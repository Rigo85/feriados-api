import test from 'node:test';
import assert from 'node:assert/strict';

import { createHolidayService } from '../../src/services/holiday-service';

const service = createHolidayService({ defaultSource: 'memory' });

test('returns holiday metadata by date', async () => {
  const result = await service.getByDate('2026-04-02');

  assert.equal(result.data.is_holiday, true);
  assert.equal(result.data.holiday?.name, 'Semana Santa');
  assert.equal(result.meta.snapshot_id, null);
  assert.equal(result.meta.updated_at, null);
});

test('returns negative result for non holiday dates', async () => {
  const result = await service.getByDate('2026-04-04');

  assert.equal(result.data.is_holiday, false);
  assert.equal(result.data.holiday, null);
});

test('falls back to postgres when redis get fails', async () => {
  let cacheErrors = 0;
  let cacheWrites = 0;

  const postgresService = createHolidayService({
    holidayRepository: {
      async ping() {},
      async getCurrentMeta() {
        return {
          snapshot_id: '42',
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
    },
    onCacheError: () => {
      cacheErrors += 1;
    },
    onCacheWrite: () => {
      cacheWrites += 1;
    }
  });

  const result = await postgresService.getByDate('2026-07-28');

  assert.equal(result.data.is_holiday, true);
  assert.equal(result.data.holiday?.name, 'Fiestas Patrias');
  assert.equal(result.meta.source, 'postgres');
  assert.equal(cacheErrors, 1);
  assert.equal(cacheWrites, 1);
});

test('returns redis as source when a cached response is reused', async () => {
  let cacheHits = 0;

  const redisService = createHolidayService({
    cacheRepository: {
      async ping() {},
      async getJson<T>() {
        return {
          data: {
            date: '2026-07-29',
            is_holiday: false,
            holiday: null
          },
          meta: {
            source: 'postgres',
            snapshot_id: '42',
            updated_at: '2026-03-31T15:00:00.000Z'
          }
        } as T;
      },
      async setJson() {}
    },
    onCacheHit: () => {
      cacheHits += 1;
    }
  });

  const result = await redisService.getByDate('2026-07-29');

  assert.equal(result.meta.source, 'redis');
  assert.equal(result.data.is_holiday, false);
  assert.equal(cacheHits, 1);
});

test('builds a landing summary when today is a holiday', async () => {
  const summary = await createHolidayService({
    defaultSource: 'memory',
    nowProvider: () => new Date('2026-04-02T15:00:00.000Z')
  }).getLandingSummary();

  assert.equal(summary.today.date, '2026-04-02');
  assert.equal(summary.today.is_holiday, true);
  assert.equal(summary.today.holiday?.name, 'Semana Santa');
  assert.equal(summary.next_holiday?.date, '2026-04-03');
});

test('builds a landing summary with the next upcoming holiday when today is not a holiday', async () => {
  const summary = await createHolidayService({
    defaultSource: 'memory',
    nowProvider: () => new Date('2026-04-04T15:00:00.000Z')
  }).getLandingSummary();

  assert.equal(summary.today.date, '2026-04-04');
  assert.equal(summary.today.is_holiday, false);
  assert.equal(summary.today.holiday, null);
  assert.equal(summary.next_holiday?.date, '2026-05-01');
  assert.equal(summary.next_holiday?.name, 'Día del Trabajo');
});
