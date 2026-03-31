import test from 'node:test';
import assert from 'node:assert/strict';

import { buildQueryTraceRecord, extractClientIp, shouldTraceRequest } from '../../src/lib/request-trace';

function createRequest(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'req-1',
    method: 'GET',
    url: '/v1/holidays/is/2026-07-28',
    raw: {
      url: '/v1/holidays/is/2026-07-28?from=test'
    },
    routeOptions: {
      url: '/v1/holidays/is/:date'
    },
    ip: '10.0.0.5',
    socket: {
      remoteAddress: '10.0.0.5'
    },
    headers: {
      'cf-connecting-ip': '203.0.113.10',
      'x-forwarded-for': '198.51.100.20, 10.0.0.5',
      'user-agent': 'Mozilla/5.0',
      'accept-language': 'es-PE'
    },
    params: {
      date: '2026-07-28'
    },
    query: {
      from: 'test'
    },
    ...overrides
  };
}

test('extracts the real client IP using the configured header order', () => {
  const request = createRequest();
  const result = extractClientIp(request as never, [
    'cf-connecting-ip',
    'x-forwarded-for'
  ]);

  assert.equal(result.clientIp, '203.0.113.10');
  assert.equal(result.ipSource, 'cf-connecting-ip');
  assert.equal(result.forwardedFor, '198.51.100.20, 10.0.0.5');
});

test('builds a query trace record with browser data and query details', () => {
  const request = createRequest();
  const trace = buildQueryTraceRecord(request as never, 200, 12.3456, [
    'cf-connecting-ip',
    'x-forwarded-for'
  ]);

  assert.equal(trace.route_pattern, '/v1/holidays/is/:date');
  assert.equal(trace.request_path, '/v1/holidays/is/2026-07-28');
  assert.equal(trace.query_string, 'from=test');
  assert.equal(trace.client_ip, '203.0.113.10');
  assert.equal(trace.user_agent, 'Mozilla/5.0');
  assert.equal(trace.browser_headers['accept-language'], 'es-PE');
  assert.equal(trace.params.date, '2026-07-28');
  assert.equal(trace.query_params.from, 'test');
  assert.equal(trace.latency_ms, 12.346);
});

test('traces only public query endpoints', () => {
  assert.equal(shouldTraceRequest(createRequest() as never), true);
  assert.equal(shouldTraceRequest(createRequest({
    routeOptions: {
      url: '/metrics'
    },
    url: '/metrics',
    raw: {
      url: '/metrics'
    }
  }) as never), false);
});
