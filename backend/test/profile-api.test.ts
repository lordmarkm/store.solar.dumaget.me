import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { ApiError } from '../src/errors.js';
import type { IdentityVerifier, VerifiedIdentity } from '../src/auth.js';
import { nextProfileRecord } from '../src/customer-profile.js';
import type { ProfileInput, ProfileRecord, ProfileRepository } from '../src/customer-profile.js';

const identity: VerifiedIdentity = { uid: 'customer-one', email: 'one@example.test', emailVerified: true, storeAdmin: false };
const enabled = loadConfig({ NODE_ENV: 'test', FIREBASE_BACKEND_ENABLED: 'true', FIREBASE_AUTH_SETUP_APPROVED: 'true' });
const headers = { authorization: 'Bearer verified-token' };
const verifier: IdentityVerifier = { verify: async () => identity, close: async () => {} };

test('disabled defaults never touch profile storage or verification', async () => {
  const forbidden = async (): Promise<never> => { throw new Error('must not run'); };
  const app = buildApp(loadConfig({ NODE_ENV: 'test' }), { logger: false, verifier: { verify: forbidden, close: async () => {} }, profiles: { get: forbidden, save: forbidden } });
  try {
    for (const method of ['GET', 'PUT'] as const) {
      const response = await app.inject({ method, url: '/api/v1/me/profile', headers, ...(method === 'PUT' ? { payload: {} } : {}) });
      assert.equal(response.statusCode, 503);
      assert.equal(response.json().error.code, 'BACKEND_DISABLED');
    }
  } finally { await app.close(); }
});

test('profile API derives ownership only from verified token and never permits body identity/role overrides', async () => {
  let record: ProfileRecord | null = null;
  let storageCalls = 0;
  const profiles: ProfileRepository = {
    async get(owner) { storageCalls++; assert.equal(owner.uid, identity.uid); return record; },
    async save(owner, input) { storageCalls++; assert.equal(owner.uid, identity.uid); record = nextProfileRecord(owner, input, record, '2026-10-07T05:00:00.000Z'); return record; },
  };
  const app = buildApp(enabled, { logger: false, verifier, profiles });
  try {
    const missing = await app.inject({ method: 'GET', url: '/api/v1/me/profile' });
    assert.equal(missing.statusCode, 401);
    assert.equal(storageCalls, 0);
    const empty = await app.inject({ method: 'GET', url: '/api/v1/me/profile', headers });
    assert.deepEqual(empty.json(), { profile: null, version: null });
    for (const extra of [{ customerId: 'victim' }, { email: 'spoof@example.test' }, { role: 'admin' }, { schemaVersion: 2 }]) {
      const response = await app.inject({ method: 'PUT', url: '/api/v1/me/profile', headers, payload: { expectedVersion: null, displayName: 'Name', ...extra } });
      assert.equal(response.statusCode, 400);
      assert.equal(response.json().error.code, 'INVALID_PROFILE');
    }
    assert.equal(storageCalls, 1);
    const saved = await app.inject({ method: 'PUT', url: '/api/v1/me/profile', headers, payload: { expectedVersion: null, displayName: 'Name' } });
    assert.equal(saved.statusCode, 200);
    assert.equal(saved.json().profile.customerId, identity.uid);
    assert.equal(saved.json().profile.email, identity.email);
    assert.equal(saved.json().version, 1);
    assert.equal(saved.headers['cache-control'], 'no-store');
    const conflict = await app.inject({ method: 'PUT', url: '/api/v1/me/profile', headers, payload: { expectedVersion: null, displayName: 'Overwritten' } });
    assert.equal(conflict.statusCode, 409);
    assert.equal(conflict.json().error.code, 'PROFILE_CONFLICT');
    const unchanged = await app.inject({ method: 'GET', url: '/api/v1/me/profile', headers });
    assert.equal(unchanged.json().profile.displayName, 'Name');
    const preflight = await app.inject({ method: 'OPTIONS', url: '/api/v1/me/profile', headers: { origin: 'http://127.0.0.1:4300', 'access-control-request-method': 'PUT' } });
    assert.match(String(preflight.headers['access-control-allow-methods']), /PUT/);
  } finally { await app.close(); }
});

test('rejected authentication never opens storage and unknown storage errors expose no details', async () => {
  let calls = 0;
  const profiles = {
    get: async () => { calls++; throw new Error('private firestore path'); },
    save: async (_owner: VerifiedIdentity, _input: ProfileInput): Promise<ProfileRecord> => { calls++; throw new Error('private firestore path'); },
  };
  const app = buildApp(enabled, { logger: false, profiles, verifier: {
    verify: async token => { if (token === 'invalid') throw new ApiError(401, 'UNAUTHENTICATED', 'Invalid ID token.'); return identity; }, close: async () => {},
  } });
  try {
    const rejected = await app.inject({ method: 'GET', url: '/api/v1/me/profile', headers: { authorization: 'Bearer invalid' } });
    assert.equal(rejected.statusCode, 401);
    assert.equal(calls, 0);
    const failure = await app.inject({ method: 'GET', url: '/api/v1/me/profile', headers });
    assert.equal(failure.statusCode, 500);
    assert.doesNotMatch(failure.body, /private firestore path|verified-token/);
  } finally { await app.close(); }
});
