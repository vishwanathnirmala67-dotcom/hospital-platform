'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { sha256, newRefreshToken, refreshExpiry } = require('../src/services/tokens');

test('refresh tokens are long, unique and hashed deterministically', () => {
  const a = newRefreshToken(), b = newRefreshToken();
  assert.ok(a.length >= 60);
  assert.notEqual(a, b);
  assert.equal(sha256(a), sha256(a));
  assert.equal(sha256(a).length, 64);
  assert.notEqual(sha256(a), a); // raw token never equals what is stored
});

test('refresh expiry is in the future', () => assert.ok(refreshExpiry() > new Date()));
