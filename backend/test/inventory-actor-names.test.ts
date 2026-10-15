import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Firestore } from 'firebase-admin/firestore';
import type { AdminCatalogRepository } from '../src/admin-catalog.js';
import { actorDisplayName } from '../src/auth.js';
import { FirebaseGateway } from '../src/firebase.js';
import { loadConfig } from '../src/config.js';
import { parseMovement } from '../src/inventory.js';
import { FirestoreInventoryRepository } from '../src/inventory.repository.js';

const productId = '11111111-1111-4111-8111-111111111111';
const locationId = '22222222-2222-4222-8222-222222222222';
const requestId = '33333333-3333-4333-8333-333333333333';
const destinationId = '44444444-4444-4444-8444-444444444444';
const at = '2026-10-09T00:00:00.000Z';
const actor = { uid: 'private-actor-id', displayName: 'Mark Martinez', email: 'mark@solar.dumaget.me', emailVerified: true, storeAdmin: true };
const legacy = { id: requestId, schemaVersion: 1, productId, locationId, unitCode: 'unit', kind: 'count',
  quantity: 3, delta: 3, onHandBefore: null, onHandAfter: 3, version: 1, reason: 'Initial count', observedAt: at, createdAt: at, actorUid: actor.uid };

test('actor names are presentation metadata and legacy movement IDs remain supported', () => {
  assert.equal(actorDisplayName(' Mark Martinez ', actor.uid), 'Mark Martinez');
  for (const value of [null, '', ' ', actor.uid, 'x\n', 'x'.repeat(161), '\ud800']) assert.equal(actorDisplayName(value, actor.uid), undefined);
  assert.equal(parseMovement(legacy, productId, locationId).actorUid, actor.uid);
  assert.equal(parseMovement({ ...legacy, actorName: actor.displayName }, productId, locationId).actorName, actor.displayName);
  for (const actorName of ['', ' ', actor.uid, ' Mark ', 'x\n', 'x'.repeat(161), null]) {
    assert.throws(() => parseMovement({ ...legacy, actorName }, productId, locationId), { code: 'INVENTORY_DATA_INVALID' });
  }
});

test('legacy history resolves only distinct page actors, preserves snapshots and never rewrites history', async () => {
  const records = [legacy, { ...legacy, id: destinationId, actorName: 'Historical Name' }];
  const query = { orderBy: () => query, limit: () => query,
    get: async () => ({ docs: records.map(record => ({ id: record.id, data: () => record })) }) };
  const database = { collection: () => ({ doc: () => ({ collection: () => query }) }) } as unknown as Firestore;
  let calls = 0;
  const repo = new FirestoreInventoryRepository(() => database, {} as AdminCatalogRepository, undefined, async uids => {
    calls++; assert.deepEqual(uids, [actor.uid]); return new Map([[actor.uid, 'Current Name']]);
  });
  const result = await repo.movements(productId, locationId, null);
  assert.equal(calls, 1);
  assert.deepEqual(result.items.map(item => item.actorName), ['Current Name', 'Historical Name']);
  assert.ok(!Object.hasOwn(legacy, 'actorName'));
  assert.ok(result.items.every(item => item.actorUid === actor.uid));
  const unavailable = new FirestoreInventoryRepository(() => database, {} as AdminCatalogRepository, undefined, async () => { throw new Error('Auth outage'); });
  assert.equal((await unavailable.movements(productId, locationId, null)).items[0]?.actorName, undefined);
});

test('counts and paired transfers store trusted names but retry identity remains the UID', async () => {
  const data = new Map<string, unknown>();
  const location = (id: string) => ({ id, schemaVersion: 1, code: 'DEPOT', name: 'Depot', notes: '', status: 'active', version: 1,
    createdAt: at, updatedAt: at, createdBy: actor.uid });
  data.set('products/' + productId, { id: productId, sku: 'INVERTER-1', name: 'Inverter', brand: 'Example', category: 'Inverters',
    unitCode: 'unit', description: '', amountMinor: null, supplierId: destinationId, schemaVersion: 1, version: 1,
    state: 'draft', currency: 'PHP', createdAt: at, updatedAt: at, createdBy: actor.uid });
  data.set('inventoryLocations/' + locationId, location(locationId));
  data.set('inventoryLocations/' + destinationId, location(destinationId));
  const ref = (path: string): any => ({ path, doc: (id: string) => ref(path + '/' + id), collection: (name: string) => ref(path + '/' + name) });
  const tx = {
    get: async (target: { path: string }) => ({ exists: data.has(target.path), data: () => data.get(target.path),
      get: (key: string) => (data.get(target.path) as Record<string, unknown>)?.[key] }),
    set: (target: { path: string }, value: unknown) => data.set(target.path, value),
    create: (target: { path: string }, value: unknown) => { assert.ok(!data.has(target.path)); data.set(target.path, value); },
  };
  const database = { collection: (name: string) => ref(name), runTransaction: async (callback: (value: typeof tx) => unknown) => callback(tx) } as unknown as Firestore;
  const repo = new FirestoreInventoryRepository(() => database, {} as AdminCatalogRepository, () => new Date(at));
  const input = { requestId, expectedVersion: null, expectedProductVersion: 1, countedQuantity: 3, reason: 'Initial count', observedAt: at };
  const first = await repo.count(actor, productId, locationId, input);
  assert.equal(first.movement.actorUid, actor.uid); assert.equal(first.movement.actorName, actor.displayName);
  assert.equal(first.balance.updatedBy, actor.uid);
  const retried = await repo.count({ ...actor, displayName: 'Changed Name' }, productId, locationId, input);
  assert.equal(retried.movement.actorName, actor.displayName);
  data.set('inventoryBalances/' + productId + '_' + destinationId, { ...first.balance, locationId: destinationId, onHand: 0 });
  const transfer = await repo.transfer({ ...actor, displayName: 'Changed Name' }, productId, locationId, {
    requestId: destinationId, expectedProductVersion: 1, destinationLocationId: destinationId,
    expectedSourceVersion: 1, expectedDestinationVersion: 1, quantity: 1, reason: 'Move stock', observedAt: at,
  });
  for (const result of [transfer.source, transfer.destination]) {
    assert.equal(result.movement.actorName, 'Changed Name'); assert.equal(result.movement.actorUid, actor.uid);
  }
});

test('legacy Auth lookups are exact bounded IDs, cached, and disabled defaults never initialize services', async () => {
  let calls = 0;
  const gateway = new FirebaseGateway(loadConfig({ FIREBASE_BACKEND_ENABLED: 'true', FIREBASE_AUTH_SETUP_APPROVED: 'true' }), () => ({
    verify: async () => actor, firestore: () => ({} as Firestore), close: async () => {},
    actorNames: async uids => { calls++; assert.deepEqual(uids, [actor.uid, 'deleted']); return new Map([[actor.uid, actor.displayName]]); },
  }));
  assert.deepEqual([...await gateway.actorNames([actor.uid, actor.uid, 'deleted'])], [[actor.uid, actor.displayName]]);
  await gateway.actorNames([actor.uid, 'deleted']); assert.equal(calls, 1);
  await assert.rejects(gateway.actorNames(Array.from({ length: 6 }, (_, index) => 'uid-' + index)), { code: 'INVALID_ACTOR_LOOKUP' });
  assert.equal(calls, 1); await gateway.close();
  const disabled = new FirebaseGateway(loadConfig({}), () => { throw new Error('Must not initialize'); });
  await assert.rejects(disabled.actorNames([actor.uid]), { code: 'BACKEND_DISABLED' });
});
