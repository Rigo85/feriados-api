import test from 'node:test';
import assert from 'node:assert/strict';

import { buildApp } from '../../src/lib/build-app';
import { createHolidayService } from '../../src/services/holiday-service';

const holidayService = createHolidayService({ defaultSource: 'memory' });
const baseAppOptions = {
  nodeEnv: 'test',
  host: '127.0.0.1',
  port: 3000,
  logLevel: 'silent',
  databaseUrl: '',
  redisUrl: '',
  redisCacheTtlSeconds: 172800,
  rateLimitMax: 100,
  rateLimitWindow: '1 minute',
  trustProxy: true,
  queryTraceEnabled: true,
  realIpHeaderOrder: ['cf-connecting-ip', 'true-client-ip', 'x-real-ip', 'x-forwarded-for', 'forwarded'],
  statusEnabled: true,
  metricsEnabled: true,
  opsAccessToken: '',
  opsIpAllowlist: [],
  corsEnabled: false,
  corsOrigins: [],
  corsMethods: ['GET', 'HEAD', 'OPTIONS'],
  corsHeaders: ['content-type', 'x-request-id', 'x-ops-token'],
  corsCredentials: false,
  corsMaxAgeSeconds: 86400
};

test('serves the date validation endpoint', async () => {
  const app = await buildApp({
    ...baseAppOptions,
    holidayService
  });

  const response = await app.inject({
    method: 'GET',
    url: '/v1/holidays/is/2026-04-02'
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().data.is_holiday, true);
  assert.ok(response.headers['x-request-id']);

  await app.close();
});

test('validates malformed dates', async () => {
  const app = await buildApp({
    ...baseAppOptions,
    holidayService
  });

  const response = await app.inject({
    method: 'GET',
    url: '/v1/holidays/is/2026-4-2'
  });

  assert.equal(response.statusCode, 400);
  assert.ok(response.headers['x-request-id']);
  assert.ok(response.json().request_id);

  await app.close();
});

test('rejects impossible dates with a clean 400', async () => {
  const app = await buildApp({
    ...baseAppOptions,
    holidayService
  });

  const response = await app.inject({
    method: 'GET',
    url: '/v1/holidays/is/2026-13-32'
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().error.code, 'INVALID_DATE');

  await app.close();
});

test('serves a postgres-backed response when redis access fails', async () => {
  const app = await buildApp({
    ...baseAppOptions,
    holidayService: createHolidayService({
      holidayRepository: {
        async ping() {},
        async getCurrentMeta() {
          return {
            snapshot_id: '5',
            updated_at: '2026-03-31T15:00:00.000Z',
            record_count: 15,
            source_url: 'https://www.gob.pe/feriados',
            parser_version: '2026-03-31.1'
          };
        },
        async getAll() {
          return [];
        },
        async getByYear() {
          return [];
        },
        async getByDate(date: string) {
          return {
            date,
            year: 2026,
            month: 7,
            day: 28,
            name: 'Fiestas Patrias',
            scope: 'national'
          };
        }
      },
      cacheRepository: {
        async ping() {},
        async getJson() {
          throw new Error('redis unavailable');
        },
        async setJson() {}
      }
    })
  });

  const response = await app.inject({
    method: 'GET',
    url: '/v1/holidays/is/2026-07-28'
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().meta.source, 'postgres');
  assert.equal(response.json().data.holiday?.name, 'Fiestas Patrias');

  await app.close();
});

test('exposes route latency and cache counters in /metrics', async () => {
  const app = await buildApp({
    ...baseAppOptions,
    holidayService
  });

  await app.inject({
    method: 'GET',
    url: '/v1/holidays/is/2026-04-02'
  });

  const response = await app.inject({
    method: 'GET',
    url: '/metrics'
  });

  assert.equal(response.statusCode, 200);
  const payload = response.json();
  assert.equal(typeof payload.runtime.cache_hits, 'number');
  assert.equal(typeof payload.runtime.cache_misses, 'number');
  assert.equal(typeof payload.runtime.cache_writes, 'number');
  assert.equal(typeof payload.runtime.cache_errors, 'number');
  assert.ok(payload.runtime.route_latency_ms['/v1/holidays/is/:date']);

  await app.close();
});

test('persists a query trace with real-ip headers and browser metadata', async () => {
  const traces: Array<Record<string, unknown>> = [];

  const app = await buildApp({
    ...baseAppOptions,
    realIpHeaderOrder: ['cf-connecting-ip', 'x-forwarded-for'],
    holidayService,
    queryTraceRepository: {
      async insertTrace(trace) {
        traces.push(trace as unknown as Record<string, unknown>);
      }
    }
  });

  const response = await app.inject({
    method: 'GET',
    url: '/v1/holidays/is/2026-04-02?from=landing',
    headers: {
      'cf-connecting-ip': '203.0.113.10',
      'x-forwarded-for': '198.51.100.20, 10.0.0.5',
      'user-agent': 'Mozilla/5.0',
      'sec-ch-ua': '"Chromium";v="135"',
      'accept-language': 'es-PE'
    }
  });

  assert.equal(response.statusCode, 200);
  assert.equal(traces.length, 1);
  const firstTrace = traces[0]!;
  assert.equal(firstTrace.client_ip, '203.0.113.10');
  assert.equal(firstTrace.ip_source, 'cf-connecting-ip');
  assert.equal(firstTrace.user_agent, 'Mozilla/5.0');
  assert.equal((firstTrace.browser_headers as Record<string, string>)['sec-ch-ua'], '"Chromium";v="135"');
  assert.equal((firstTrace.params as Record<string, string>).date, '2026-04-02');
  assert.equal((firstTrace.query_params as Record<string, string>).from, 'landing');
  assert.equal(firstTrace.route_pattern, '/v1/holidays/is/:date');

  await app.close();
});

test('protects metrics and status in production when no ops access is configured', async () => {
  const app = await buildApp({
    ...baseAppOptions,
    nodeEnv: 'production',
    holidayService
  });

  const metricsResponse = await app.inject({
    method: 'GET',
    url: '/metrics'
  });

  const statusResponse = await app.inject({
    method: 'GET',
    url: '/status'
  });

  assert.equal(metricsResponse.statusCode, 403);
  assert.equal(statusResponse.statusCode, 403);

  await app.close();
});

test('allows metrics and status in production when the ops token matches', async () => {
  const app = await buildApp({
    ...baseAppOptions,
    nodeEnv: 'production',
    opsAccessToken: 'secret-token',
    holidayService
  });

  const metricsResponse = await app.inject({
    method: 'GET',
    url: '/metrics',
    headers: {
      'x-ops-token': 'secret-token'
    }
  });

  const statusResponse = await app.inject({
    method: 'GET',
    url: '/status',
    headers: {
      'x-ops-token': 'secret-token'
    }
  });

  assert.equal(metricsResponse.statusCode, 200);
  assert.equal(statusResponse.statusCode, 200);

  await app.close();
});

test('supports configurable CORS for third-party browsers', async () => {
  const app = await buildApp({
    ...baseAppOptions,
    corsEnabled: true,
    corsOrigins: ['https://example.com'],
    holidayService
  });

  const preflight = await app.inject({
    method: 'OPTIONS',
    url: '/v1/holidays/is/2026-04-02',
    headers: {
      origin: 'https://example.com',
      'access-control-request-method': 'GET',
      'access-control-request-headers': 'content-type'
    }
  });

  assert.equal(preflight.statusCode, 204);
  assert.equal(preflight.headers['access-control-allow-origin'], 'https://example.com');
  assert.equal(preflight.headers['access-control-allow-methods'], 'GET, HEAD, OPTIONS');
  assert.equal(preflight.headers['access-control-max-age'], '86400');

  const forbiddenPreflight = await app.inject({
    method: 'OPTIONS',
    url: '/v1/holidays/is/2026-04-02',
    headers: {
      origin: 'https://not-allowed.example',
      'access-control-request-method': 'GET'
    }
  });

  assert.equal(forbiddenPreflight.statusCode, 403);

  await app.close();
});
