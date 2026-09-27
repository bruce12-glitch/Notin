// WP-AUDIT — unit tests for lib/passwordStrength.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluatePasswordStrength, isCommonPassword } from '../../src/lib/passwordStrength.js';

test('empty password is invalid with zero score', () => {
  const r = evaluatePasswordStrength('');
  assert.equal(r.valid, false);
  assert.equal(r.score, 0);
  assert.deepEqual(r.issues, ['empty']);
});

test('common passwords are flagged and invalid', () => {
  const r = evaluatePasswordStrength('password');
  assert.equal(r.valid, false);
  assert.ok(r.issues.includes('too common'));
  assert.equal(isCommonPassword('PASSWORD'), true, 'check is case-insensitive');
  assert.equal(isCommonPassword('Notin123'), true);
});

test('short passwords fail the length rule', () => {
  const r = evaluatePasswordStrength('Ab1!xyz');
  assert.equal(r.valid, false);
  assert.ok(r.issues.includes('at least 8 characters'));
});

test('passwords need 3 of 4 character categories', () => {
  const r = evaluatePasswordStrength('alllowercaseletters');
  assert.equal(r.valid, false);
  assert.ok(r.issues.some((i) => i.includes('3 of')));
});

test('repeating and sequential characters are rejected', () => {
  assert.ok(evaluatePasswordStrength('Abcdefg1!aaa').issues.includes('no 3 repeating chars'));
  assert.ok(evaluatePasswordStrength('Abcd1234!xyzW').issues.some((i) => i.includes('sequential')));
});

test('password containing the email local-part is rejected', () => {
  const r = evaluatePasswordStrength('Bruce.Notes!42', 'bruce@example.com');
  assert.equal(r.valid, false);
  assert.ok(r.issues.includes('must not contain email'));
});

test('a genuinely strong password passes with Strong label', () => {
  const r = evaluatePasswordStrength('Tr7!qZ9#mW2@xK4$', 'bruce@example.com', 'bruce');
  assert.equal(r.valid, true);
  assert.equal(r.label, 'Strong');
  assert.equal(r.score, 5);
});

test('bcrypt 72-byte ceiling is enforced', () => {
  const r = evaluatePasswordStrength(`Aa1!${'x'.repeat(80)}`);
  assert.equal(r.valid, false);
  assert.ok(r.issues.includes('72 bytes or fewer'));
});
