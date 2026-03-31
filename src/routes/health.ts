import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

function denyOpsEndpoint(request: FastifyRequest, reply: FastifyReply, statusCode: 403 | 404): FastifyReply {
  return reply.code(statusCode).send({
    error: {
      code: statusCode === 404 ? 'NOT_FOUND' : 'FORBIDDEN',
      message: statusCode === 404 ? 'Not Found' : 'Forbidden',
      status_code: statusCode
    },
    request_id: request.id
  });
}

export default async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/healthz', {
    schema: {
      tags: ['health'],
      summary: 'Liveness probe',
      response: {
        200: {
          type: 'object',
          required: ['status'],
          properties: {
            status: { type: 'string', const: 'ok' }
          }
        }
      }
    }
  }, async () => ({
    status: 'ok'
  }));

  app.get('/metrics', {
    schema: {
      tags: ['health'],
      summary: 'Basic runtime metrics for the API process',
      response: {
        200: {
          type: 'object',
          required: ['runtime', 'checks', 'snapshot'],
          properties: {
            runtime: {
              type: 'object',
              required: ['started_at', 'uptime_seconds', 'requests_total', 'errors_total', 'in_flight', 'cache_hits', 'cache_misses', 'cache_writes', 'cache_errors', 'status_codes', 'routes', 'route_latency_ms', 'memory'],
              properties: {
                started_at: { type: 'string' },
                uptime_seconds: { type: 'integer' },
                requests_total: { type: 'integer' },
                errors_total: { type: 'integer' },
                in_flight: { type: 'integer' },
                cache_hits: { type: 'integer' },
                cache_misses: { type: 'integer' },
                cache_writes: { type: 'integer' },
                cache_errors: { type: 'integer' },
                status_codes: { type: 'object', additionalProperties: { type: 'integer' } },
                routes: { type: 'object', additionalProperties: { type: 'integer' } },
                route_latency_ms: {
                  type: 'object',
                  additionalProperties: {
                    type: 'object',
                    required: ['count', 'total', 'avg', 'max'],
                    properties: {
                      count: { type: 'integer' },
                      total: { type: 'number' },
                      avg: { type: 'number' },
                      max: { type: 'number' }
                    }
                  }
                },
                memory: {
                  type: 'object',
                  required: ['rss', 'heap_total', 'heap_used', 'external'],
                  properties: {
                    rss: { type: 'integer' },
                    heap_total: { type: 'integer' },
                    heap_used: { type: 'integer' },
                    external: { type: 'integer' }
                  }
                }
              }
            },
            checks: {
              type: 'object',
              required: ['postgres', 'redis'],
              properties: {
                postgres: { type: 'string' },
                redis: { type: 'string' }
              }
            },
            snapshot: {
              type: 'object',
              required: ['snapshot_id', 'updated_at'],
              properties: {
                snapshot_id: { type: ['string', 'null'] },
                updated_at: { type: ['string', 'null'] },
                record_count: { type: 'integer' },
                source_url: { type: 'string' },
                parser_version: { type: 'string' }
              }
            }
          }
        },
        403: {
          type: 'object',
          required: ['error', 'request_id'],
          properties: {
            error: {
              type: 'object',
              required: ['code', 'message', 'status_code'],
              properties: {
                code: { type: 'string' },
                message: { type: 'string' },
                status_code: { type: 'integer' }
              }
            },
            request_id: { type: 'string' }
          }
        },
        404: {
          type: 'object',
          required: ['error', 'request_id'],
          properties: {
            error: {
              type: 'object',
              required: ['code', 'message', 'status_code'],
              properties: {
                code: { type: 'string' },
                message: { type: 'string' },
                status_code: { type: 'integer' }
              }
            },
            request_id: { type: 'string' }
          }
        }
      }
    },
    preHandler: async (request, reply) => {
      const access = app.opsAccess.ensureMetricsAccess(request);
      if (!access.allowed) {
        return denyOpsEndpoint(request, reply, access.statusCode === 404 ? 404 : 403);
      }
    }
  }, async () => {
    const summary = await app.holidayService.getStatusSummary();

    return {
      runtime: app.runtimeMetrics.snapshot(),
      checks: summary.checks,
      snapshot: summary.snapshot
    };
  });

  app.get('/readyz', {
    schema: {
      tags: ['health'],
      summary: 'Readiness probe',
      response: {
        200: {
          type: 'object',
          required: ['status', 'checks', 'snapshot'],
          properties: {
            status: { type: 'string', enum: ['ready'] },
            checks: {
              type: 'object',
              required: ['postgres', 'redis'],
              properties: {
                postgres: { type: 'string' },
                redis: { type: 'string' }
              }
            },
            snapshot: {
              type: 'object',
              required: ['snapshot_id', 'updated_at'],
              properties: {
                snapshot_id: { type: ['string', 'null'] },
                updated_at: { type: ['string', 'null'] },
                record_count: { type: 'integer' },
                source_url: { type: 'string' },
                parser_version: { type: 'string' }
              }
            }
          }
        },
        503: {
          type: 'object',
          required: ['status', 'checks', 'snapshot'],
          properties: {
            status: { type: 'string', enum: ['degraded'] },
            checks: {
              type: 'object',
              required: ['postgres', 'redis'],
              properties: {
                postgres: { type: 'string' },
                redis: { type: 'string' }
              }
            },
            snapshot: {
              type: 'object',
              required: ['snapshot_id', 'updated_at'],
              properties: {
                snapshot_id: { type: ['string', 'null'] },
                updated_at: { type: ['string', 'null'] },
                record_count: { type: 'integer' },
                source_url: { type: 'string' },
                parser_version: { type: 'string' }
              }
            }
          }
        }
      }
    }
  }, async (_, reply) => {
    const summary = await app.holidayService.getStatusSummary();
    const isReady = !Object.values(summary.checks).includes('error');

    reply.code(isReady ? 200 : 503).send({
      status: isReady ? 'ready' : 'degraded',
      checks: summary.checks,
      snapshot: summary.snapshot
    });
  });
}
