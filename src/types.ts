import { createClient } from 'redis';
import type { Pool } from 'pg';
import type { FastifyRequest } from 'fastify';

export interface EnvConfig {
  nodeEnv: string;
  host: string;
  port: number;
  logLevel: string;
  databaseUrl: string;
  redisUrl: string;
  redisCacheTtlSeconds: number;
  rateLimitMax: number;
  rateLimitWindow: string;
  trustProxy: boolean;
  queryTraceEnabled: boolean;
  realIpHeaderOrder: string[];
  statusEnabled: boolean;
  metricsEnabled: boolean;
  opsAccessToken: string;
  opsIpAllowlist: string[];
  corsEnabled: boolean;
  corsOrigins: string[];
  corsMethods: string[];
  corsHeaders: string[];
  corsCredentials: boolean;
  corsMaxAgeSeconds: number;
}

export interface HolidayRecord {
  date: string;
  year: number;
  month: number;
  day: number;
  name: string;
  scope: string;
}

export interface SnapshotMeta {
  snapshot_id: string | null;
  updated_at: string | null;
  record_count?: number;
  source_url?: string;
  parser_version?: string;
}

export interface MetaResponse {
  data: {
    total_holidays: number;
  };
  meta: SnapshotMeta;
}

export interface StatusResponse {
  service: string;
  status: 'ok' | 'degraded';
  now: string;
  checks: ReadinessChecks;
  snapshot: SnapshotMeta;
  cache_strategy: 'redis_then_postgres';
  docs_url: string;
}

export interface DateResponse {
  data: {
    date: string;
    is_holiday: boolean;
    holiday: {
      name: string;
      scope: string;
    } | null;
  };
  meta: SnapshotMeta & {
    source: string;
  };
}

export interface HolidayListResponse {
  data: HolidayRecord[];
  meta: SnapshotMeta & {
    source: string;
  };
}

export interface LandingSummary {
  today: {
    date: string;
    is_holiday: boolean;
    holiday: {
      name: string;
      scope: string;
    } | null;
  };
  next_holiday: HolidayRecord | null;
}

export interface ReadinessChecks {
  postgres: 'ok' | 'error' | 'disabled' | 'unknown';
  redis: 'ok' | 'error' | 'disabled' | 'unknown';
}

export interface HolidayRepository {
  ping(): Promise<void>;
  getCurrentMeta(): Promise<{
    snapshot_id: string | null;
    updated_at: string | null;
    record_count: number;
    source_url: string | null;
    parser_version: string | null;
  }>;
  getAll(): Promise<HolidayRecord[]>;
  getByYear(year: number): Promise<HolidayRecord[]>;
  getByDate(date: string): Promise<HolidayRecord | null>;
}

export interface CacheRepository {
  getJson<T>(key: string): Promise<T | null>;
  setJson(key: string, value: unknown): Promise<void>;
  ping(): Promise<void>;
}

export interface QueryTraceRecord {
  request_id: string;
  method: string;
  route_pattern: string;
  request_path: string;
  query_string: string | null;
  status_code: number;
  latency_ms: number;
  client_ip: string | null;
  ip_source: string;
  remote_address: string | null;
  forwarded_for: string | null;
  user_agent: string | null;
  browser_headers: Record<string, string>;
  params: Record<string, unknown>;
  query_params: Record<string, unknown>;
}

export interface QueryTraceRepository {
  insertTrace(trace: QueryTraceRecord): Promise<void>;
}

export interface OpsAccessService {
  ensureStatusAccess(request: FastifyRequest): {
    allowed: boolean;
    statusCode: 200 | 403 | 404;
  };
  ensureMetricsAccess(request: FastifyRequest): {
    allowed: boolean;
    statusCode: 200 | 403 | 404;
  };
}

export interface AppDependencies {
  holidayRepository?: HolidayRepository | null;
  cacheRepository?: CacheRepository | null;
  queryTraceRepository?: QueryTraceRepository | null;
  postgresPool?: Pool | null;
  redisClient?: RedisConnection | null;
}

export type RedisConnection = ReturnType<typeof createClient>;

export interface RuntimeMetricsSnapshot {
  started_at: string;
  uptime_seconds: number;
  requests_total: number;
  errors_total: number;
  in_flight: number;
  cache_hits: number;
  cache_misses: number;
  cache_writes: number;
  cache_errors: number;
  status_codes: Record<string, number>;
  routes: Record<string, number>;
  route_latency_ms: Record<string, {
    count: number;
    total: number;
    avg: number;
    max: number;
  }>;
  memory: {
    rss: number;
    heap_total: number;
    heap_used: number;
    external: number;
  };
}
