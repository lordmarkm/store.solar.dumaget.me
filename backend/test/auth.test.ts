import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bearerToken, isAdminEligible, isAdminAuthorized, requireAdmin } from '../src/auth.js';
import type { VerifiedIdentity } from '../src/auth.js';
import { loadConfig } from '../src/config.js';
import { ApiError } from '../src/errors.js';

const identity: VerifiedIdentity = { uid: 'verified-user', email: 'mark@solar.dumaget.me', emailVerified: true, storeAdmin: false };

test('extracts only a well-formed single bearer token', () => {
  assert.equal(bearerToken('Bearer token-value'), 'token-value');
  assert.equal(bearerToken('bearer token-value'), 'token-value');
  for (const header of [undefined, '', 'Basic value', 'Bearer', 'Bearer a b', 'Bearer a,b', `Bearer ${'x'.repeat(8193)}`]) {
    assert.throws(() => bearerToken(header), (error: unknown) => error instanceof ApiError && error.statusCode === 401);
  }
});

test('verified exact domain confers eligibility, not authorization', () => {
  const config = loadConfig({});
  assert.equal(isAdminEligible(identity, config.adminEmailDomains), true);
  assert.equal(isAdminAuthorized(identity, config), false);
  assert.throws(() => requireAdmin(identity, config), (error: unknown) => error instanceof ApiError && error.statusCode === 403);
  assert.equal(isAdminAuthorized({ ...identity, storeAdmin: true }, config), true);
  requireAdmin({ ...identity, storeAdmin: true }, config);
});

test('admin grants reject unverified, foreign, subdomain and malformed identities', () => {
  const config = loadConfig({});
  for (const candidate of [
    { ...identity, emailVerified: false },
    { ...identity, email: null },
    { ...identity, email: 'mark@sub.solar.dumaget.me' },
    { ...identity, email: 'mark@solar.dumaget.me.attacker.example' },
    { ...identity, email: 'mark@@solar.dumaget.me' },
    { ...identity, email: '@solar.dumaget.me' },
    { ...identity, email: 'mark @solar.dumaget.me' },
  ]) assert.equal(isAdminAuthorized({ ...candidate, storeAdmin: true }, config), false);
  assert.equal(isAdminAuthorized({ ...identity, email: 'MARK@SOLAR.DUMAGET.ME', storeAdmin: true }, config), true);
  assert.equal(isAdminAuthorized({ ...identity, storeAdmin: true }, loadConfig({ ADMIN_EMAIL_DOMAINS: '' })), false);
  assert.equal(isAdminAuthorized({ ...identity, storeAdmin: true }, loadConfig({ ADMIN_EMAIL_DOMAINS: 'replacement.example' })), false);
});
