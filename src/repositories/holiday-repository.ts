import type { Pool } from 'pg';

import type { HolidayRecord, HolidayRepository } from '../types';

interface CurrentMetaRow {
  snapshot_id: string | null;
  updated_at: string | null;
  record_count: number;
  source_url: string | null;
  parser_version: string | null;
}

export function createHolidayRepository(pool: Pool | null): HolidayRepository | null {
  if (!pool) {
    return null;
  }

  const db = pool;

  async function ping(): Promise<void> {
    await db.query('SELECT 1');
  }

  async function getCurrentMeta(): Promise<CurrentMetaRow> {
    const result = await db.query<CurrentMetaRow>(`
      SELECT
        snapshots.id AS snapshot_id,
        snapshots.fetched_at AS updated_at,
        COALESCE(current_projection.record_count, 0) AS record_count,
        snapshots.source_url,
        snapshots.parser_version
      FROM holiday_snapshots AS snapshots
      LEFT JOIN (
        SELECT snapshot_id, COUNT(*)::integer AS record_count
        FROM holidays_current
        GROUP BY snapshot_id
      ) AS current_projection
        ON current_projection.snapshot_id = snapshots.id
      WHERE snapshots.is_current = TRUE
      LIMIT 1
    `);

    return result.rows[0] || {
      snapshot_id: null,
      updated_at: null,
      record_count: 0,
      source_url: null,
      parser_version: null
    };
  }

  async function getAll(): Promise<HolidayRecord[]> {
    const result = await db.query<HolidayRecord>(`
      SELECT holiday_date::text AS date, year, month, day, name, scope
      FROM holidays_current
      ORDER BY holiday_date ASC
    `);

    return result.rows;
  }

  async function getByYear(year: number): Promise<HolidayRecord[]> {
    const result = await db.query<HolidayRecord>(`
      SELECT holiday_date::text AS date, year, month, day, name, scope
      FROM holidays_current
      WHERE year = $1
      ORDER BY holiday_date ASC
    `, [year]);

    return result.rows;
  }

  async function getByDate(date: string): Promise<HolidayRecord | null> {
    const result = await db.query<HolidayRecord>(`
      SELECT holiday_date::text AS date, year, month, day, name, scope
      FROM holidays_current
      WHERE holiday_date = $1::date
      LIMIT 1
    `, [date]);

    return result.rows[0] || null;
  }

  return {
    getAll,
    getByDate,
    getByYear,
    getCurrentMeta,
    ping
  };
}
