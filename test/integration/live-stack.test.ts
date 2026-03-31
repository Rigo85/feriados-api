import test from 'node:test';
import assert from 'node:assert/strict';

import { loadEnv } from '../../src/config/env';
import { buildApp } from '../../src/lib/build-app';

const env = loadEnv();
const hasLiveStack = Boolean(env.databaseUrl && env.redisUrl);

if (!hasLiveStack) {
  test.skip('live stack tests require DATABASE_URL and REDIS_URL');
} else {
  test('returns current snapshot metadata from the real stack', async () => {
    const app = await buildApp(env);

    const response = await app.inject({
      method: 'GET',
      url: '/v1/meta'
    });

    assert.equal(response.statusCode, 200);
    const payload = response.json();
    assert.equal(typeof payload.data.total_holidays, 'number');
    assert.ok(payload.data.total_holidays > 0);
    assert.ok(payload.meta.snapshot_id);
    assert.ok(payload.meta.updated_at);

    await app.close();
  });

  test('exposes runtime status with checks and snapshot metadata', async () => {
    const app = await buildApp(env);

    const response = await app.inject({
      method: 'GET',
      url: '/status'
    });

    assert.equal(response.statusCode, 200);
    const payload = response.json();
    assert.equal(payload.status, 'ok');
    assert.equal(payload.checks.postgres, 'ok');
    assert.equal(payload.checks.redis, 'ok');
    assert.ok(payload.snapshot.snapshot_id);
    assert.ok(payload.snapshot.record_count > 0);
    assert.equal(response.headers['x-request-id'] !== undefined, true);

    await app.close();
  });

  test('exposes OpenAPI with runtime snapshot metadata', async () => {
    const app = await buildApp(env);

    const response = await app.inject({
      method: 'GET',
      url: '/openapi.json'
    });

    assert.equal(response.statusCode, 200);
    const payload = response.json();
    assert.ok(payload.paths['/v1/holidays/is/:date'] || payload.paths['/v1/holidays/is/{date}']);
    assert.equal(payload['x-runtime-status'].checks.postgres, 'ok');
    assert.ok(payload['x-runtime-status'].snapshot.snapshot_id);

    await app.close();
  });

  test('exposes basic runtime metrics', async () => {
    const app = await buildApp(env);

    await app.inject({
      method: 'GET',
      url: '/v1/holidays/is/2026-07-28'
    });

    await app.inject({
      method: 'GET',
      url: '/v1/holidays/is/2026-07-28'
    });

    const response = await app.inject({
      method: 'GET',
      url: '/metrics'
    });

    assert.equal(response.statusCode, 200);
    const payload = response.json();
    assert.ok(payload.runtime.requests_total >= 2);
    assert.ok(payload.runtime.cache_hits >= 1);
    assert.ok(payload.runtime.cache_misses >= 0);
    assert.ok(payload.runtime.cache_writes >= 0);
    assert.ok(payload.runtime.cache_errors >= 0);
    assert.ok(payload.runtime.route_latency_ms['/v1/holidays/is/:date']);
    assert.equal(payload.checks.postgres, 'ok');
    assert.equal(payload.checks.redis, 'ok');
    assert.ok(payload.snapshot.snapshot_id);

    await app.close();
  });
}
