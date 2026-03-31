import 'dotenv/config';

import type { EnvConfig } from '../types';

function getEnvNumber(name: string, fallback: number): number {
  const rawValue = process.env[name];
  if (!rawValue) {
    return fallback;
  }

  const parsed = Number(rawValue);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getEnvBoolean(name: string, fallback: boolean): boolean {
  const rawValue = process.env[name];
  if (rawValue === undefined) {
    return fallback;
  }

  return ['1', 'true', 'yes', 'on'].includes(String(rawValue).toLowerCase());
}

function getEnvStringArray(
  name: string,
  fallback: string[],
  normalize: (value: string) => string = (value) => value.toLowerCase()
): string[] {
  const rawValue = process.env[name];
  if (!rawValue) {
    return fallback;
  }

  return rawValue
    .split(',')
    .map((value) => normalize(value.trim()))
    .filter(Boolean);
}

export function loadEnv(): EnvConfig {
  const nodeEnv = process.env.NODE_ENV || 'development';

  return {
    nodeEnv,
    host: process.env.HOST || '0.0.0.0',
    port: getEnvNumber('PORT', 3000),
    logLevel: process.env.LOG_LEVEL || 'info',
    databaseUrl: process.env.DATABASE_URL || '',
    redisUrl: process.env.REDIS_URL || '',
    redisCacheTtlSeconds: getEnvNumber('REDIS_CACHE_TTL_SECONDS', 172800),
    rateLimitMax: getEnvNumber('RATE_LIMIT_MAX', 100),
    rateLimitWindow: process.env.RATE_LIMIT_WINDOW || '1 minute',
    trustProxy: getEnvBoolean('TRUST_PROXY', true),
    queryTraceEnabled: getEnvBoolean('QUERY_TRACE_ENABLED', true),
    realIpHeaderOrder: getEnvStringArray('REAL_IP_HEADER_ORDER', [
      'cf-connecting-ip',
      'true-client-ip',
      'x-real-ip',
      'x-forwarded-for',
      'forwarded',
      'fly-client-ip',
      'fastly-client-ip',
      'x-client-ip'
    ]),
    statusEnabled: getEnvBoolean('STATUS_ENABLED', nodeEnv !== 'production'),
    metricsEnabled: getEnvBoolean('METRICS_ENABLED', nodeEnv !== 'production'),
    opsAccessToken: process.env.OPS_ACCESS_TOKEN || '',
    opsIpAllowlist: getEnvStringArray('OPS_IP_ALLOWLIST', []),
    corsEnabled: getEnvBoolean('CORS_ENABLED', false),
    corsOrigins: getEnvStringArray('CORS_ORIGINS', []),
    corsMethods: getEnvStringArray('CORS_METHODS', ['GET', 'HEAD', 'OPTIONS'], (value) => value.toUpperCase()),
    corsHeaders: getEnvStringArray('CORS_HEADERS', [
      'content-type',
      'x-request-id',
      'x-ops-token'
    ]),
    corsCredentials: getEnvBoolean('CORS_CREDENTIALS', false),
    corsMaxAgeSeconds: getEnvNumber('CORS_MAX_AGE_SECONDS', 86400)
  };
}
