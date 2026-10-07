import test from 'node:test';
import assert from 'node:assert/strict';
import { logError } from '../../src/lib/logging.js';

test('error logs exclude credential-bearing driver errors and request bodies', (t) => {
  const output = [];
  t.mock.method(console, 'error', (...args) => output.push(args));
  const error = new Error('postgres://user:private-password@host/db');
  error.stack = 'Bearer private-token';
  logError({ id: 'req-123', body: { note: 'private-note' } }, error, 'database');
  assert.deepEqual(output, [['Application error', { requestId: 'req-123', context: 'database', errorType: 'Error' }]]);
});
