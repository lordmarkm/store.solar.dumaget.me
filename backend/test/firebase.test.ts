import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Firestore } from 'firebase-admin/firestore';
import { FirebaseGateway } from '../src/firebase.js';
import { loadConfig } from '../src/config.js';
import { ApiError } from '../src/errors.js';
import { createRequire } from 'node:module';

test('disabled gateway never initializes credentials or SDK services', async () => {
  let calls = 0;
  const gateway = new FirebaseGateway(loadConfig({}), () => { calls++; throw new Error('Must not initialize'); });
  assert.throws(() => gateway.firestore(), (error: unknown) => error instanceof ApiError && error.statusCode === 503);
  assert.throws(() => gateway.verify('token'), (error: unknown) => error instanceof ApiError && error.statusCode === 503);
  await gateway.close();
  assert.equal(calls, 0);
});

test('lazy services receive only the explicitly agreed destination and close once', async () => {
  const config = loadConfig({ FIREBASE_BACKEND_ENABLED: 'true', FIREBASE_AUTH_SETUP_APPROVED: 'true' });
  let calls = 0;
  let closes = 0;
  const database = {} as Firestore;
  const gateway = new FirebaseGateway(config, (destination) => {
    calls++;
    assert.equal(destination.projectId, 'dumaget-me-solar');
    assert.equal(destination.databaseId, 'store-dev');
    return {
      verify: async () => ({ uid: 'uid', email: null, emailVerified: false, storeAdmin: false }),
      firestore: () => database,
      close: async () => { closes++; },
    };
  });
  assert.equal(calls, 0);
  assert.equal(gateway.firestore(), database);
  assert.equal((await gateway.verify('token')).uid, 'uid');
  assert.equal(calls, 1);
  await gateway.close();
  await gateway.close();
  assert.equal(closes, 1);
});

test('initialization failures are sanitized and do not latch failed clients', () => {
  let calls = 0;
  const gateway = new FirebaseGateway(loadConfig({ FIREBASE_BACKEND_ENABLED: 'true', FIREBASE_AUTH_SETUP_APPROVED: 'true' }), () => {
    calls++; throw new Error('private-key-secret');
  });
  for (let attempt = 0; attempt < 2; attempt++) {
    assert.throws(() => gateway.firestore(), (error: unknown) => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.statusCode, 503);
      assert.ok(!error.message.includes('private-key-secret'));
      return true;
    });
  }
  assert.equal(calls, 2);
});

test('patched uuid remains compatible with the installed gaxios CommonJS caller', () => {
  const require = createRequire(import.meta.url);
  const gaxiosRequire = createRequire(require.resolve('gaxios'));
  const uuid = gaxiosRequire('uuid') as { v4(): string };
  assert.match(uuid.v4(), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.ok(gaxiosRequire('gaxios'));
});
