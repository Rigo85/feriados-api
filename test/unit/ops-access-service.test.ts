import test from 'node:test';
import assert from 'node:assert/strict';

import { createOpsAccessService } from '../../src/services/ops-access-service';

const baseOptions = {
  nodeEnv: 'production',
  statusEnabled: true,
  metricsEnabled: true,
  opsAccessToken: '',
  opsIpAllowlist: [],
  realIpHeaderOrder: ['cf-connecting-ip', 'x-forwarded-for']
};

function buildRequest(headers: Record<string, string> = {}, ip = '127.0.0.1') {
  return {
    headers,
    ip
  } as never;
}

test('allows status access outside production', () => {
  const service = createOpsAccessService({
    ...baseOptions,
    nodeEnv: 'development'
  });

  const result = service.ensureStatusAccess(buildRequest());

  assert.equal(result.allowed, true);
  assert.equal(result.statusCode, 200);
});

test('allows production ops access when the token matches', () => {
  const service = createOpsAccessService({
    ...baseOptions,
    opsAccessToken: 'secret-token'
  });

  const result = service.ensureMetricsAccess(buildRequest({
    'x-ops-token': 'secret-token'
  }));

  assert.equal(result.allowed, true);
  assert.equal(result.statusCode, 200);
});

test('rejects production ops access when the token length differs', () => {
  const service = createOpsAccessService({
    ...baseOptions,
    opsAccessToken: 'secret-token'
  });

  const result = service.ensureMetricsAccess(buildRequest({
    'x-ops-token': 'secret'
  }));

  assert.equal(result.allowed, false);
  assert.equal(result.statusCode, 403);
});

test('allows production ops access when the extracted client ip is allowlisted', () => {
  const service = createOpsAccessService({
    ...baseOptions,
    opsIpAllowlist: ['203.0.113.10']
  });

  const result = service.ensureStatusAccess(buildRequest({
    'cf-connecting-ip': '203.0.113.10'
  }));

  assert.equal(result.allowed, true);
  assert.equal(result.statusCode, 200);
});
