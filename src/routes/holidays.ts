import type { FastifyInstance } from 'fastify';
import { isStrictIsoDate } from '../lib/date-validation';

const snapshotMetaSchema = {
  type: 'object',
  required: ['snapshot_id', 'updated_at'],
  properties: {
    snapshot_id: { type: ['string', 'null'] },
    updated_at: { type: ['string', 'null'] },
    record_count: { type: 'integer' },
    source_url: { type: 'string' },
    parser_version: { type: 'string' }
  }
} as const;

const responseMetaSchema = {
  allOf: [
    snapshotMetaSchema,
    {
      type: 'object',
      required: ['source'],
      properties: {
        source: { type: 'string', enum: ['redis', 'postgres', 'memory'] }
      }
    }
  ]
} as const;

const holidaySchema = {
  type: 'object',
  required: ['date', 'year', 'month', 'day', 'name', 'scope'],
  properties: {
    date: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
    year: { type: 'integer' },
    month: { type: 'integer' },
    day: { type: 'integer' },
    name: { type: 'string' },
    scope: { type: 'string', enum: ['national'] }
  }
} as const;

export default async function holidayRoutes(app: FastifyInstance): Promise<void> {
  app.get('/v1/holidays', {
    schema: {
      tags: ['holidays'],
      summary: 'List all holidays in the current snapshot year',
      operationId: 'getCurrentYearHolidays',
      response: {
        200: {
          type: 'object',
          required: ['data', 'meta'],
          properties: {
            data: {
              type: 'array',
              items: holidaySchema
            },
            meta: responseMetaSchema
          }
        }
      }
    }
  }, async () => app.holidayService.getAll());

  app.get('/v1/holidays/:year', {
    schema: {
      tags: ['holidays'],
      summary: 'List holidays for a specific year if it exists in the current snapshot',
      operationId: 'getHolidaysByYear',
      params: {
        type: 'object',
        required: ['year'],
        properties: {
          year: {
            type: 'integer',
            minimum: 2000,
            maximum: 2100
          }
        }
      },
      response: {
        200: {
          type: 'object',
          required: ['data', 'meta'],
          properties: {
            data: {
              type: 'array',
              items: holidaySchema
            },
            meta: responseMetaSchema
          }
        }
      }
    }
  }, async (request) => app.holidayService.getByYear((request.params as { year: number }).year));

  app.get('/v1/holidays/is/:date', {
    schema: {
      tags: ['holidays'],
      summary: 'Check whether a specific date is a holiday within the current snapshot',
      operationId: 'isHoliday',
      params: {
        type: 'object',
        required: ['date'],
        properties: {
          date: {
            type: 'string',
            pattern: '^\\d{4}-\\d{2}-\\d{2}$'
          }
        }
      },
      response: {
        200: {
          type: 'object',
          required: ['data', 'meta'],
          properties: {
            data: {
              type: 'object',
              required: ['date', 'is_holiday', 'holiday'],
              properties: {
                date: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
                is_holiday: { type: 'boolean' },
                holiday: {
                  anyOf: [
                    {
                      type: 'null'
                    },
                    {
                      type: 'object',
                      required: ['name', 'scope'],
                      properties: {
                        name: { type: 'string' },
                        scope: { type: 'string', enum: ['national'] }
                      }
                    }
                  ]
                }
              }
            },
            meta: responseMetaSchema
          }
        }
      }
    }
  }, async (request) => {
    const date = (request.params as { date: string }).date;

    if (!isStrictIsoDate(date)) {
      throw Object.assign(new Error('Invalid date value. Expected a real YYYY-MM-DD date.'), {
        statusCode: 400,
        code: 'INVALID_DATE'
      });
    }

    return app.holidayService.getByDate(date);
  });

  app.get('/v1/meta', {
    schema: {
      tags: ['holidays'],
      summary: 'Get metadata for the current loaded snapshot',
      operationId: 'getCurrentSnapshotMeta',
      response: {
        200: {
          type: 'object',
          required: ['data', 'meta'],
          properties: {
            data: {
              type: 'object',
              required: ['total_holidays'],
              properties: {
                total_holidays: { type: 'integer' }
              }
            },
            meta: snapshotMetaSchema
          }
        }
      }
    }
  }, async () => app.holidayService.getMeta());
}
