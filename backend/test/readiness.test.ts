import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CachedReadiness } from '../src/readiness.js';
import { FirebaseGateway } from '../src/firebase.js';
import { loadConfig } from '../src/config.js';
import type { Firestore } from 'firebase-admin/firestore';
import type { ImageBucket } from '../src/product-images.js';

test('readiness coalesces requests and caches success/failure, then recovers', async () => {
  let clock = 0, calls = 0, fail = false;
  const cache = new CachedReadiness(async () => { calls++; if (fail) throw new Error('secret'); }, () => clock, 100, 30);
  assert.deepEqual(await Promise.all([cache.check(), cache.check(), cache.check()]), [true, true, true]);
  assert.equal(calls, 1);
  clock = 101; fail = true;
  assert.equal(await cache.check(), false);
  assert.equal(await cache.check(), false);
  assert.equal(calls, 2);
  clock = 202; fail = false;
  assert.equal(await cache.check(), true);
  assert.equal(calls, 3);
  cache.close();
  assert.equal(await cache.check(), false);
});

test('timeout remains bounded without stacking hung calls after TTL expiry', async () => {
  let clock = 0, calls = 0;
  let resolve!: () => void;
  const cache = new CachedReadiness(() => { calls++; return new Promise<void>(done => { resolve = done; }); }, () => clock, 10, 10);
  assert.equal(await cache.check(), false);
  clock = 100;
  assert.equal(await cache.check(), false);
  assert.equal(calls, 1);
  resolve();
  await new Promise<void>(done => setImmediate(done));
  const second = cache.check();
  await Promise.resolve();
  assert.equal(calls, 2);
  cache.close();
  assert.equal(await second, false);
  resolve();
});

test('synchronous probe exceptions and closing in flight are safely unavailable', async () => {
  const broken = new CachedReadiness(() => { throw new Error('private-key'); });
  assert.equal(await broken.check(), false);
  broken.close();
  const hanging = new CachedReadiness(() => new Promise<void>(() => {}));
  const pending = hanging.check();
  hanging.close();
  assert.equal(await pending, false);
});

test('disabled readiness never initializes cloud SDKs', async () => {
  let calls = 0;
  const gateway = new FirebaseGateway(loadConfig({}), () => { calls++; throw new Error(); });
  await assert.rejects(gateway.checkReadiness(), { code: 'BACKEND_DISABLED' });
  assert.equal(calls, 0);
  await gateway.close();
});

test('connected gateway checks every dependency with fixed read-only destinations', async () => {
  for (const failing of [null, 'firestore', 'auth', 'storage'] as const) {
    const calls: string[] = [];
    const probe = async (name: string) => { calls.push(name); if (failing === name) throw new Error('credential-private'); };
    const gateway = new FirebaseGateway(loadConfig({ FIREBASE_BACKEND_ENABLED: 'true', FIREBASE_AUTH_SETUP_APPROVED: 'true' }), config => {
      assert.equal(config.databaseId, 'store-dev');
      return {
        verify: async () => { throw new Error('Must not mint or verify tokens'); },
        firestore: () => ({ collection: (name: string) => {
          assert.equal(name, '_health');
          return { doc: (id: string) => { assert.equal(id, 'readiness'); return { get: () => probe('firestore') }; } };
        } }) as unknown as Firestore,
        checkAuth: () => probe('auth'),
        imageBucket: () => ({ getMetadata: () => probe('storage') }) as unknown as ImageBucket,
        close: async () => {},
      };
    });
    if (failing) await assert.rejects(gateway.checkReadiness(), { code: 'BACKEND_NOT_READY', message: 'Connected services are unavailable.' });
    else await gateway.checkReadiness();
    assert.deepEqual(calls.sort(), ['auth', 'firestore', 'storage']);
    await gateway.close();
  }
});
