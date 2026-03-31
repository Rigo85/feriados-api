import test from 'node:test';
import assert from 'node:assert/strict';

import { isStrictIsoDate } from '../../src/lib/date-validation';

test('accepts a valid leap day date', () => {
  assert.equal(isStrictIsoDate('2024-02-29'), true);
});

test('rejects malformed iso date strings', () => {
  assert.equal(isStrictIsoDate('2026-4-2'), false);
  assert.equal(isStrictIsoDate('2026/04/02'), false);
});

test('rejects impossible calendar dates', () => {
  assert.equal(isStrictIsoDate('2026-02-30'), false);
  assert.equal(isStrictIsoDate('2026-13-01'), false);
  assert.equal(isStrictIsoDate('2026-00-10'), false);
});
