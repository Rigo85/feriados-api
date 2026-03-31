import fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';

import { createPostgresPool } from '../db/postgres';
import { createRedisConnection } from './redis-client';
import { createRuntimeMetrics, type RuntimeMetrics } from './runtime-metrics';
import { registerSecurity } from '../plugins/security';
import { createCacheRepository } from '../repositories/cache-repository';
import { createHolidayRepository } from '../repositories/holiday-repository';
import { createQueryTraceRepository } from '../repositories/query-trace-repository';
import { createHolidayService } from '../services/holiday-service';
import { createOpsAccessService } from '../services/ops-access-service';
import { createQueryTraceService } from '../services/query-trace-service';
import holidayRoutes from '../routes/holidays';
import healthRoutes from '../routes/health';
import pageRoutes from '../routes/pages';
import type { AppDependencies, EnvConfig, OpsAccessService } from '../types';

declare module 'fastify' {
  interface FastifyInstance {
    holidayService: ReturnType<typeof createHolidayService>;
    runtimeMetrics: RuntimeMetrics;
    opsAccess: OpsAccessService;
  }

  interface FastifyRequest {
    requestStartNs?: bigint;
  }
}

type BuildAppOptions = EnvConfig & AppDependencies & {
  holidayService?: ReturnType<typeof createHolidayService>;
};

export async function buildApp(options: BuildAppOptions): Promise<FastifyInstance> {
  const app = fastify({
    requestIdHeader: 'x-request-id',
    trustProxy: options.trustProxy,
    logger: {
      level: options.logLevel,
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'req.headers.x-api-key',
          'req.headers.proxy-authorization',
          'req.body.password',
          'req.body.token',
          'req.body.secret'
        ],
        censor: '[REDACTED]'
      }
    }
  });
  const runtimeMetrics = createRuntimeMetrics();

  const postgresPool = options.postgresPool ?? createPostgresPool(options);
  const redisClient = options.redisClient ?? await createRedisConnection(options, app.log);
  const holidayRepository = options.holidayRepository ?? createHolidayRepository(postgresPool);
  const cacheRepository = options.cacheRepository ?? createCacheRepository(redisClient, {
    ttlSeconds: options.redisCacheTtlSeconds
  });
  const queryTraceRepository = options.queryTraceRepository ?? createQueryTraceRepository(postgresPool);
  const queryTraceService = createQueryTraceService({
    enabled: options.queryTraceEnabled,
    queryTraceRepository,
    realIpHeaderOrder: options.realIpHeaderOrder
  });
  const opsAccess = createOpsAccessService({
    nodeEnv: options.nodeEnv,
    statusEnabled: options.statusEnabled,
    metricsEnabled: options.metricsEnabled,
    opsAccessToken: options.opsAccessToken,
    opsIpAllowlist: options.opsIpAllowlist,
    realIpHeaderOrder: options.realIpHeaderOrder
  });

  app.decorate('holidayService', options.holidayService || createHolidayService({
    cacheRepository,
    holidayRepository,
    defaultSource: 'memory',
    onCacheError: () => runtimeMetrics.recordCacheError(),
    onCacheHit: () => runtimeMetrics.recordCacheHit(),
    onCacheMiss: () => runtimeMetrics.recordCacheMiss(),
    onCacheWrite: () => runtimeMetrics.recordCacheWrite()
  }));
  app.decorate('runtimeMetrics', runtimeMetrics);
  app.decorate('opsAccess', opsAccess);

  app.addHook('onRequest', async (request, reply) => {
    runtimeMetrics.recordRequest();
    request.requestStartNs = process.hrtime.bigint();
    reply.header('x-request-id', request.id);
  });

  app.addHook('onResponse', async (request, reply) => {
    const routeKey = request.routeOptions.url || request.url;
    const startedAt = request.requestStartNs || process.hrtime.bigint();
    const latencyMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    runtimeMetrics.recordResponse(routeKey, reply.statusCode, latencyMs);

    try {
      await queryTraceService.record(request, reply.statusCode, latencyMs);
    } catch (error) {
      request.log.warn({
        err: error,
        request_id: request.id
      }, 'query trace persistence failed');
    }
  });

  app.setErrorHandler((error: FastifyError, request, reply) => {
    const statusCode = typeof error.statusCode === 'number' && error.statusCode >= 400 ? error.statusCode : 500;
    const errorCode = typeof error.code === 'string'
      ? error.code
      : (statusCode >= 500 ? 'INTERNAL_ERROR' : 'BAD_REQUEST');
    const errorMessage = statusCode >= 500 ? 'Internal Server Error' : error.message;
    request.log.error({
      err: error,
      request_id: request.id,
      status_code: statusCode
    }, 'request failed');

    reply
      .header('x-request-id', request.id)
      .status(statusCode)
      .send({
        error: {
          code: errorCode,
          message: errorMessage,
          status_code: statusCode
        },
        request_id: request.id
      });
  });

  await app.register(registerSecurity, {
    rateLimitMax: options.rateLimitMax,
    rateLimitWindow: options.rateLimitWindow,
    corsEnabled: options.corsEnabled,
    corsOrigins: options.corsOrigins,
    corsMethods: options.corsMethods,
    corsHeaders: options.corsHeaders,
    corsCredentials: options.corsCredentials,
    corsMaxAgeSeconds: options.corsMaxAgeSeconds
  });

  await app.register(swagger, {
    openapi: {
      info: {
        title: 'Feriados Perú API',
        version: '0.1.0',
        description: 'API publica para consultar feriados nacionales del Perú, con caché Redis, fuente de verdad en PostgreSQL y metadata del snapshot actual.'
      },
      tags: [
        { name: 'holidays', description: 'Consulta de feriados y metadata del snapshot actual' },
        { name: 'health', description: 'Liveness y readiness del servicio' },
        { name: 'status', description: 'Estado operativo y metadata del runtime' },
        { name: 'docs', description: 'Superficie documental y especificacion OpenAPI' }
      ]
    }
  });

  await app.register(swaggerUi, {
    routePrefix: '/docs'
  });

  await app.register(healthRoutes);
  await app.register(holidayRoutes);
  await app.register(pageRoutes);

  app.addHook('onClose', async () => {
    if (redisClient && !options.redisClient) {
      await redisClient.quit();
    }

    if (postgresPool && !options.postgresPool) {
      await postgresPool.end();
    }
  });

  return app;
}
