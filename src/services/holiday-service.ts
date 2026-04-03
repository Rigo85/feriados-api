import type {
  CacheRepository,
  DateResponse,
  HolidayListResponse,
  LandingSummary,
  HolidayRecord,
  HolidayRepository,
  MetaResponse,
  ReadinessChecks,
  SnapshotMeta
} from '../types';

const FALLBACK_META: SnapshotMeta = {
  snapshot_id: null,
  updated_at: null
};

const FALLBACK_HOLIDAYS: HolidayRecord[] = [
  { date: '2026-04-02', year: 2026, month: 4, day: 2, name: 'Semana Santa', scope: 'national' },
  { date: '2026-04-03', year: 2026, month: 4, day: 3, name: 'Semana Santa', scope: 'national' },
  { date: '2026-05-01', year: 2026, month: 5, day: 1, name: 'Día del Trabajo', scope: 'national' }
];

interface HolidayServiceDependencies {
  holidayRepository?: HolidayRepository | null;
  cacheRepository?: CacheRepository | null;
  defaultSource?: string;
  nowProvider?: () => Date;
  onCacheHit?: () => void;
  onCacheMiss?: () => void;
  onCacheWrite?: () => void;
  onCacheError?: () => void;
}

export function createHolidayService(dependencies: HolidayServiceDependencies) {
  function getDateInLima(date: Date): string {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Lima',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(date);

    const year = parts.find((part) => part.type === 'year')?.value;
    const month = parts.find((part) => part.type === 'month')?.value;
    const day = parts.find((part) => part.type === 'day')?.value;

    if (!year || !month || !day) {
      throw new Error('Unable to compute Lima calendar date');
    }

    return `${year}-${month}-${day}`;
  }

  async function getMetaFromRepository(): Promise<SnapshotMeta> {
    if (!dependencies.holidayRepository) {
      return FALLBACK_META;
    }

    const meta = await dependencies.holidayRepository.getCurrentMeta();
    return {
      snapshot_id: meta.snapshot_id,
      updated_at: meta.updated_at,
      record_count: meta.record_count,
      ...(meta.source_url ? { source_url: meta.source_url } : {}),
      ...(meta.parser_version ? { parser_version: meta.parser_version } : {})
    };
  }

  async function readThroughCache<T>(cacheKey: string, loader: () => Promise<T>): Promise<T> {
    if (dependencies.cacheRepository) {
      try {
        const cachedValue = await dependencies.cacheRepository.getJson<T & { meta?: { source?: string } }>(cacheKey);
        if (cachedValue) {
          dependencies.onCacheHit?.();
          if (typeof cachedValue === 'object' && cachedValue !== null && 'meta' in cachedValue && cachedValue.meta) {
            return {
              ...cachedValue,
              meta: {
                ...cachedValue.meta,
                source: 'redis'
              }
            } as T;
          }

          return cachedValue as T;
        }

        dependencies.onCacheMiss?.();
      } catch {
        dependencies.onCacheError?.();
      }
    }

    const value = await loader();

    if (dependencies.cacheRepository) {
      try {
        await dependencies.cacheRepository.setJson(cacheKey, value);
        dependencies.onCacheWrite?.();
      } catch {
        dependencies.onCacheError?.();
      }
    }

    return value;
  }

  function buildDateResponse(date: string, holiday: HolidayRecord | null, meta: SnapshotMeta, source: string): DateResponse {
    return {
      data: {
        date,
        is_holiday: Boolean(holiday),
        holiday: holiday
          ? {
              name: holiday.name,
              scope: holiday.scope
            }
          : null
      },
      meta: {
        source,
        ...meta
      }
    };
  }

  async function getAll(): Promise<HolidayListResponse> {
    return readThroughCache('holidays:all', async () => {
      const data = dependencies.holidayRepository ? await dependencies.holidayRepository.getAll() : FALLBACK_HOLIDAYS;
      const meta = await getMetaFromRepository();

      return {
        data,
        meta: {
          source: dependencies.holidayRepository ? 'postgres' : (dependencies.defaultSource || 'memory'),
          ...meta
        }
      };
    });
  }

  async function getByYear(year: number): Promise<HolidayListResponse> {
    return readThroughCache(`holidays:year:${year}`, async () => {
      const filtered = dependencies.holidayRepository
        ? await dependencies.holidayRepository.getByYear(Number(year))
        : FALLBACK_HOLIDAYS.filter((holiday) => holiday.year === Number(year));
      const meta = await getMetaFromRepository();

      return {
        data: filtered,
        meta: {
          source: dependencies.holidayRepository ? 'postgres' : (dependencies.defaultSource || 'memory'),
          ...meta
        }
      };
    });
  }

  async function getByDate(date: string): Promise<DateResponse> {
    return readThroughCache(`holidays:date:${date}`, async () => {
      const holiday = dependencies.holidayRepository
        ? await dependencies.holidayRepository.getByDate(date)
        : (FALLBACK_HOLIDAYS.find((item) => item.date === date) || null);
      const meta = await getMetaFromRepository();

      return buildDateResponse(
        date,
        holiday,
        meta,
        dependencies.holidayRepository ? 'postgres' : (dependencies.defaultSource || 'memory')
      );
    });
  }

  async function getMeta(): Promise<MetaResponse> {
    return readThroughCache('holidays:meta:current', async () => {
      const meta = await getMetaFromRepository();
      const holidays = dependencies.holidayRepository ? await dependencies.holidayRepository.getAll() : FALLBACK_HOLIDAYS;

      return {
        data: {
          total_holidays: holidays.length
        },
        meta
      };
    });
  }

  async function getLandingSummary(): Promise<LandingSummary> {
    const holidays = (await getAll()).data;
    const now = dependencies.nowProvider ? dependencies.nowProvider() : new Date();
    const today = getDateInLima(now);
    const todayHoliday = holidays.find((holiday) => holiday.date === today) || null;
    const nextHoliday = holidays.find((holiday) => holiday.date > today) || null;

    return {
      today: {
        date: today,
        is_holiday: Boolean(todayHoliday),
        holiday: todayHoliday
          ? {
              name: todayHoliday.name,
              scope: todayHoliday.scope
            }
          : null
      },
      next_holiday: nextHoliday
    };
  }

  async function getReadiness(): Promise<ReadinessChecks> {
    const checks: ReadinessChecks = {
      postgres: dependencies.holidayRepository ? 'unknown' : 'disabled',
      redis: dependencies.cacheRepository ? 'unknown' : 'disabled'
    };

    if (dependencies.holidayRepository) {
      try {
        await dependencies.holidayRepository.ping();
        checks.postgres = 'ok';
      } catch {
        checks.postgres = 'error';
      }
    }

    if (dependencies.cacheRepository) {
      try {
        await dependencies.cacheRepository.ping();
        checks.redis = 'ok';
      } catch {
        checks.redis = 'error';
      }
    }

    return checks;
  }

  async function getStatusSummary() {
    const checks = await getReadiness();
    const snapshot = await getMetaFromRepository();

    return {
      service: 'feriados-api' as const,
      status: Object.values(checks).includes('error') ? 'degraded' as const : 'ok' as const,
      now: new Date().toISOString(),
      checks,
      snapshot,
      cache_strategy: 'redis_then_postgres' as const,
      docs_url: '/docs'
    };
  }

  return {
    getAll,
    getByYear,
    getByDate,
    getLandingSummary,
    getMeta,
    getReadiness,
    getStatusSummary
  };
}
