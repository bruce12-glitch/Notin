import test from 'node:test';
import assert from 'node:assert/strict';

process.env.APP_ORIGIN = 'https://app.example.com,https://www.example.com';
process.env.NODE_ENV = 'production';
const { corsOriginFor, isOriginAllowed } = await import('../../src/lib/httpSecurity.js');

test('credentialed CORS returns configured origins and rejects deceptive origins', () => {
  assert.equal(corsOriginFor('https://app.example.com'), 'https://app.example.com');
  assert.equal(corsOriginFor('https://www.example.com'), 'https://www.example.com');
  for (const origin of ['https://app.example.com.evil.test', 'null', 'http://localhost:4173', ['https://app.example.com'], undefined]) {
    assert.equal(corsOriginFor(origin), null);
  }
  assert.equal(isOriginAllowed('https://evil.test'), false);
});
