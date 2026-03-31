import type { RuntimeMetricsSnapshot } from '../types';

export interface RuntimeMetrics {
  recordRequest(): void;
  recordResponse(routeKey: string, statusCode: number, latencyMs: number): void;
  recordCacheHit(): void;
  recordCacheMiss(): void;
  recordCacheWrite(): void;
  recordCacheError(): void;
  snapshot(): RuntimeMetricsSnapshot;
}

export function createRuntimeMetrics(): RuntimeMetrics {
  const startedAt = Date.now();
  let requestsTotal = 0;
  let errorsTotal = 0;
  let inFlight = 0;
  let cacheHits = 0;
  let cacheMisses = 0;
  let cacheWrites = 0;
  let cacheErrors = 0;
  const statusCodes: Record<string, number> = {};
  const routes: Record<string, number> = {};
  const routeLatencyMs: Record<string, { count: number; total: number; max: number }> = {};

  function incrementCounter(target: Record<string, number>, key: string): void {
    target[key] = (target[key] || 0) + 1;
  }

  function recordRequest(): void {
    requestsTotal += 1;
    inFlight += 1;
  }

  function recordResponse(routeKey: string, statusCode: number, latencyMs: number): void {
    inFlight = Math.max(0, inFlight - 1);
    incrementCounter(statusCodes, String(statusCode));
    incrementCounter(routes, routeKey);
    if (!routeLatencyMs[routeKey]) {
      routeLatencyMs[routeKey] = {
        count: 0,
        total: 0,
        max: 0
      };
    }
    routeLatencyMs[routeKey].count += 1;
    routeLatencyMs[routeKey].total += latencyMs;
    routeLatencyMs[routeKey].max = Math.max(routeLatencyMs[routeKey].max, latencyMs);

    if (statusCode >= 400) {
      errorsTotal += 1;
    }
  }

  function recordCacheHit(): void {
    cacheHits += 1;
  }

  function recordCacheMiss(): void {
    cacheMisses += 1;
  }

  function recordCacheWrite(): void {
    cacheWrites += 1;
  }

  function recordCacheError(): void {
    cacheErrors += 1;
  }

  function snapshot(): RuntimeMetricsSnapshot {
    const memoryUsage = process.memoryUsage();

    return {
      started_at: new Date(startedAt).toISOString(),
      uptime_seconds: Math.round(process.uptime()),
      requests_total: requestsTotal,
      errors_total: errorsTotal,
      in_flight: inFlight,
      cache_hits: cacheHits,
      cache_misses: cacheMisses,
      cache_writes: cacheWrites,
      cache_errors: cacheErrors,
      status_codes: statusCodes,
      routes,
      route_latency_ms: Object.fromEntries(
        Object.entries(routeLatencyMs).map(([key, value]) => [
          key,
          {
            count: value.count,
            total: Number(value.total.toFixed(3)),
            avg: Number((value.total / value.count).toFixed(3)),
            max: Number(value.max.toFixed(3))
          }
        ])
      ),
      memory: {
        rss: memoryUsage.rss,
        heap_total: memoryUsage.heapTotal,
        heap_used: memoryUsage.heapUsed,
        external: memoryUsage.external
      }
    };
  }

  return {
    recordRequest,
    recordResponse,
    recordCacheHit,
    recordCacheMiss,
    recordCacheWrite,
    recordCacheError,
    snapshot
  };
}
