import type { Pool } from 'pg';

import type { QueryTraceRecord, QueryTraceRepository } from '../types';

export function createQueryTraceRepository(pool: Pool | null): QueryTraceRepository | null {
  if (!pool) {
    return null;
  }

  const db = pool;

  async function insertTrace(trace: QueryTraceRecord): Promise<void> {
    await db.query(`
      INSERT INTO query_traces (
        request_id,
        method,
        route_pattern,
        request_path,
        query_string,
        status_code,
        latency_ms,
        client_ip,
        ip_source,
        remote_address,
        forwarded_for,
        user_agent,
        browser_headers,
        params,
        query_params
      )
      VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9, $10,
        $11, $12, $13::jsonb, $14::jsonb, $15::jsonb
      )
    `, [
      trace.request_id,
      trace.method,
      trace.route_pattern,
      trace.request_path,
      trace.query_string,
      trace.status_code,
      trace.latency_ms,
      trace.client_ip,
      trace.ip_source,
      trace.remote_address,
      trace.forwarded_for,
      trace.user_agent,
      JSON.stringify(trace.browser_headers),
      JSON.stringify(trace.params),
      JSON.stringify(trace.query_params)
    ]);
  }

  return {
    insertTrace
  };
}
