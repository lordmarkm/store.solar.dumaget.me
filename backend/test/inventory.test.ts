import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { parseStockInput, parseCountInput, parseTransferInput, parseSettingsInput, parseSettings, parseInventoryQuery, parseLocationInput, parseLocationUpdate, parseLocation, parseBalance, parseMovement, movementDelta, stockStatus } from '../src/inventory.js';
import type { InventoryRepository, StockInput } from '../src/inventory.js';
import { ApiError } from '../src/errors.js';
import { FirestoreInventoryRepository } from '../src/inventory.repository.js';
import { FirestoreAdminCatalogRepository } from '../src/admin-catalog.repository.js';
import type { Firestore } from 'firebase-admin/firestore';
import type { AdminCatalogRepository } from '../src/admin-catalog.js';
const id = '11111111-1111-4111-8111-111111111111', productId = '22222222-2222-4222-8222-222222222222', destinationId = '44444444-4444-4444-8444-444444444444';
const at = '2026-10-09T00:00:00.000Z';
const actor = { uid: 'admin-test', email: 'test@solar.dumaget.me', emailVerified: true, storeAdmin: true };
const enabled = loadConfig({ NODE_ENV: 'test', FIREBASE_BACKEND_ENABLED: 'true', FIREBASE_AUTH_SETUP_APPROVED: 'true' });
const input: StockInput = { requestId: id, expectedVersion: null, expectedProductVersion: 1, kind: 'opening', quantity: 0, reason: 'Verified empty bin', observedAt: at };
test('inventory delegates a fixed ten-row query and catalog rejects unsupported page sizes before reading', async () => {
  const location = { id, schemaVersion: 1, code: 'DEPOT', name: 'Depot', notes: '', status: 'active',
    version: 1, createdAt: at, updatedAt: at, createdBy: actor.uid };
  let called = false;
  const database = {
    collection: (name: string) => {
      assert.equal(name, 'inventoryLocations');
      return { doc: (key: string) => {
        assert.equal(key, id); return { get: async () => ({ exists: true, data: () => location }) };
      } };
    },
    getAll: async () => { throw new Error('Empty pages must not load balances'); },
  } as unknown as Firestore;
  const catalog = { products: async (cursor: string | null, filters: unknown, size: number) => {
    called = true; assert.equal(cursor, null); assert.deepEqual(filters, { category: 'Panels' }); assert.equal(size, 10);
    return { items: [], nextCursor: null };
  } } as unknown as AdminCatalogRepository;
  assert.deepEqual(await new FirestoreInventoryRepository(() => database, catalog).list(id, null, { category: 'Panels' }), { items: [], nextCursor: null });
  assert.ok(called);
  await assert.rejects(new FirestoreAdminCatalogRepository(() => { throw new Error('Must not open Firestore'); })
    .products(null, {}, 100 as never), { code: 'INVALID_PAGE_SIZE' });
});
test('movement queries fetch six at most and return five entries with a pool-bound cursor', async () => {
  let limit = 0, after: unknown[] = [];
  const docs = Array.from({ length: 6 }, (_, index) => {
    const version = 6 - index, key = '33333333-3333-4333-8333-' + String(version).padStart(12, '0');
    return { id: key, data: () => ({ id: key, schemaVersion: 1, productId, locationId: id,
      unitCode: 'panel', kind: version === 1 ? 'opening' : 'receipt', quantity: 1, delta: 1,
      onHandBefore: version === 1 ? null : version - 1, onHandAfter: version,
      version, reason: 'Physical receipt', observedAt: at, createdAt: at, actorUid: actor.uid }) };
  });
  const query = {
    orderBy: () => query,
    limit: (size: number) => { limit = size; return query; },
    startAfter: (...values: unknown[]) => { after = values; return query; },
    get: async () => ({ docs: docs.filter(doc => !after.length || doc.data().version < Number(after[0])).slice(0, limit) }),
  };
  const database = { collection: (name: string) => {
    assert.equal(name, 'inventoryBalances');
    return { doc: (key: string) => {
      assert.equal(key, productId + '_' + id);
      return { collection: (child: string) => { assert.equal(child, 'movements'); return query; } };
    } };
  } } as unknown as Firestore;
  const repo = new FirestoreInventoryRepository(() => database, {} as AdminCatalogRepository);
  const first = await repo.movements(productId, id, null);
  assert.equal(limit, 6); assert.deepEqual(first.items.map(item => item.version), [6, 5, 4, 3, 2]);
  assert.ok(first.nextCursor);
  const last = await repo.movements(productId, id, first.nextCursor);
  assert.deepEqual(after, [2, docs[4]!.id]); assert.deepEqual(last.items.map(item => item.version), [1]);
  assert.equal(last.nextCursor, null);
});
test('stock input accepts explicit zero opening and safe typed deltas only', () => {
  assert.deepEqual(parseStockInput(input), input);
  for (const kind of ['receipt', 'issue', 'return', 'damage', 'correction'] as const) {
    assert.equal(parseStockInput({ ...input, expectedVersion: 1, kind, quantity: 3 }).kind, kind);
  }
  assert.equal(movementDelta({ kind: 'issue', quantity: 3 }), -3);
  assert.equal(movementDelta({ kind: 'damage', quantity: 3 }), -3);
  assert.equal(movementDelta({ kind: 'correction', quantity: -3 }), -3);
  assert.equal(parseStockInput({ ...input, expectedVersion: 1, kind: 'correction', quantity: -3 }).quantity, -3);
  for (const extra of [{ quantity: -1 }, { quantity: 1.2 }, { quantity: 1_000_000_001 }, { expectedVersion: 1 },
    { reason: '' }, { reason: 'x\n' }, { observedAt: 'yesterday' }, { observedAt: ['2026'] }, { expectedProductVersion: null },
    { actorUid: 'spoofed' }, { reserved: 5 }, { kind: 'issue', expectedVersion: 1, quantity: 0 }, { kind: 'correction', expectedVersion: 1, quantity: 0 }])
    assert.throws(() => parseStockInput({ ...input, ...extra }), { code: 'INVALID_INVENTORY_INPUT' });
});
test('counts accept physical zero, calculate observed deltas, and reject spoofed or invalid input', () => {
  const count = { requestId: id, expectedVersion: null, expectedProductVersion: 1, countedQuantity: 0, reason: 'Verified empty', observedAt: at };
  assert.deepEqual(parseCountInput(count), count);
  const movement = { id, schemaVersion: 1, productId, locationId: id, unitCode: 'panel', kind: 'count', quantity: 4,
    delta: -3, onHandBefore: 7, onHandAfter: 4, version: 2, reason: 'Cycle count', observedAt: at, createdAt: at, actorUid: actor.uid };
  assert.deepEqual(parseMovement(movement, productId, id), movement);
  const first = { ...movement, quantity: 0, delta: 0, onHandBefore: null, onHandAfter: 0, version: 1 };
  assert.deepEqual(parseMovement(first, productId, id), first);
  for (const extra of [{ countedQuantity: -1 }, { countedQuantity: 1.5 }, { countedQuantity: 1_000_000_001 },
    { expectedVersion: -1 }, { expectedProductVersion: null }, { reason: '' }, { observedAt: 'yesterday' },
    { actorUid: 'spoofed' }, { transferId: id }, { reserved: 2 }])
    assert.throws(() => parseCountInput({ ...count, ...extra }), { code: 'INVALID_INVENTORY_INPUT' });
  for (const extra of [{ delta: 0 }, { onHandAfter: 7 }, { onHandBefore: null }, { version: 1 }, { transferId: id }])
    assert.throws(() => parseMovement({ ...movement, ...extra }, productId, id), { code: 'INVENTORY_DATA_INVALID' });
  for (const kind of ['count', 'transfer-in', 'transfer-out'])
    assert.throws(() => parseStockInput({ ...input, kind }), { code: 'INVALID_INVENTORY_INPUT' });
});
test('transfers require positive safe quantities, both expected versions, and consistent paired links', async () => {
  const transfer = { requestId: id, expectedProductVersion: 1, destinationLocationId: destinationId,
    expectedSourceVersion: 2, expectedDestinationVersion: 3, quantity: 5, reason: 'Move stock', observedAt: at };
  assert.deepEqual(parseTransferInput(transfer), transfer);
  const source = { id, schemaVersion: 1, productId, locationId: id, unitCode: 'panel', kind: 'transfer-out', quantity: 5,
    delta: -5, onHandBefore: 10, onHandAfter: 5, version: 3, reason: transfer.reason, observedAt: at, createdAt: at,
    actorUid: actor.uid, transferId: id, otherLocationId: destinationId };
  const destination = { ...source, locationId: destinationId, kind: 'transfer-in', delta: 5, onHandBefore: 2, onHandAfter: 7,
    version: 4, otherLocationId: id };
  assert.deepEqual(parseMovement(source, productId, id), source);
  assert.deepEqual(parseMovement(destination, productId, destinationId), destination);
  for (const extra of [{ quantity: 0 }, { quantity: -1 }, { quantity: 1.25 }, { destinationLocationId: 'bad' },
    { expectedProductVersion: null }, { expectedSourceVersion: null }, { expectedDestinationVersion: null },
    { reason: '' }, { observedAt: 'later' }, { actorUid: 'spoofed' }, { extra: true }])
    assert.throws(() => parseTransferInput({ ...transfer, ...extra }), { code: 'INVALID_INVENTORY_INPUT' });
  for (const extra of [{ transferId: destinationId }, { otherLocationId: id }, { delta: -4 }, { onHandAfter: 2 }, { quantity: 0 }])
    assert.throws(() => parseMovement({ ...source, ...extra }, productId, id), { code: 'INVENTORY_DATA_INVALID' });
  const repo = new FirestoreInventoryRepository(() => { throw new Error('Same-location transfer must stop before database access'); }, {} as AdminCatalogRepository);
  await assert.rejects(repo.transfer(actor, productId, id, { ...transfer, destinationLocationId: id }), { code: 'INVALID_TRANSFER' });
});
test('reorder thresholds distinguish unknown, zero, low positive, and in-stock balances', () => {
  const settingsInput = { requestId: id, expectedVersion: null, expectedProductVersion: 1, reorderPoint: 0 };
  assert.deepEqual(parseSettingsInput(settingsInput), settingsInput);
  assert.deepEqual(parseSettingsInput({ ...settingsInput, expectedVersion: 1, reorderPoint: null }),
    { ...settingsInput, expectedVersion: 1, reorderPoint: null });
  for (const extra of [{ reorderPoint: -1 }, { reorderPoint: 1.2 }, { reorderPoint: '0' }, { expectedVersion: -1 },
    { expectedProductVersion: null }, { extra: true }])
    assert.throws(() => parseSettingsInput({ ...settingsInput, ...extra }), { code: 'INVALID_INVENTORY_INPUT' });
  const balance = { schemaVersion: 1 as const, productId, locationId: id, unitCode: 'panel' as const, onHand: 0,
    version: 1, updatedAt: at, observedAt: at, updatedBy: actor.uid };
  assert.equal(stockStatus(null, null), 'unknown');
  assert.equal(stockStatus(balance, null), 'zero');
  assert.equal(stockStatus({ ...balance, onHand: 1 }, { schemaVersion: 1, productId, locationId: id, reorderPoint: 1,
    version: 1, updatedAt: at, updatedBy: actor.uid }), 'low');
  assert.equal(stockStatus({ ...balance, onHand: 2 }, { schemaVersion: 1, productId, locationId: id, reorderPoint: 1,
    version: 1, updatedAt: at, updatedBy: actor.uid }), 'in-stock');
  assert.equal(stockStatus({ ...balance, onHand: 1 }, { schemaVersion: 1, productId, locationId: id, reorderPoint: null,
    version: 1, updatedAt: at, updatedBy: actor.uid }), 'in-stock');
});
test('location contracts validate canonical codes and immutable edit identity', () => {
  assert.deepEqual(parseLocationInput({ requestId: id, code: ' depot_01 ', name: ' Depot ', notes: '' }),
    { requestId: id, code: 'DEPOT_01', name: 'Depot', notes: '' });
  for (const extra of [{ code: '../path' }, { code: 'a b' }, { name: '' }, { notes: 'x'.repeat(1001) }, { status: 'active' }])
    assert.throws(() => parseLocationInput({ requestId: id, code: 'DEPOT', name: 'Depot', notes: '', ...extra }), { code: 'INVALID_INVENTORY_INPUT' });
  assert.throws(() => parseLocationUpdate({ requestId: id, expectedVersion: 1, name: 'Depot', notes: '', status: ['active'] }), { code: 'INVALID_INVENTORY_INPUT' });
  const location = { id, schemaVersion: 1, code: 'DEPOT', name: 'Depot', notes: 'Floor one\nBin two', status: 'active',
    version: 1, createdAt: at, updatedAt: at, createdBy: actor.uid };
  assert.deepEqual(parseLocation(location, id), location);
  assert.throws(() => parseLocation({ ...location, status: ['active'] }, id), { code: 'INVENTORY_DATA_INVALID' });
});

test('stock queries and stored threshold data reject malformed or injected fields', () => {
  assert.deepEqual(parseInventoryQuery({ skuPrefix: 'sol-', category: 'Panels', stockStatus: 'low' }),
    { cursor: null, filters: { skuPrefix: 'SOL-', category: 'Panels', stockStatus: 'low' } });
  for (const query of [{ stockStatus: ['low'] }, { stockStatus: 'available' }, { stockStatus: 'LOW' },
    { reserved: 4 }, { offset: 10 }, { pageSize: 50 }, { cursor: 'x'.repeat(513) }])
    assert.throws(() => parseInventoryQuery(query));
  const settings = { schemaVersion: 1, productId, locationId: id, reorderPoint: null, version: 1,
    updatedAt: at, updatedBy: actor.uid };
  assert.deepEqual(parseSettings(settings, productId, id), settings);
  for (const update of [{ reorderPoint: -1 }, { reorderPoint: '0' }, { productId: id },
    { version: 0 }, { updatedBy: '\n' }, { reserved: 1 }])
    assert.throws(() => parseSettings({ ...settings, ...update }, productId, id), { code: 'INVENTORY_DATA_INVALID' });
});
test('stored inventory validates identities, units, actor metadata and conservation', () => {
  const balance = { schemaVersion: 1, productId, locationId: id, unitCode: 'panel', onHand: 0, version: 1, updatedAt: at, observedAt: at, updatedBy: actor.uid };
  const movement = { id, schemaVersion: 1, productId, locationId: id, unitCode: 'panel', kind: 'opening', quantity: 0,
    delta: 0, onHandBefore: null, onHandAfter: 0, version: 1, reason: input.reason, observedAt: at, createdAt: at, actorUid: actor.uid };
  assert.deepEqual(parseBalance(balance, productId, id), balance);
  assert.deepEqual(parseMovement(movement, productId, id), movement);
  for (const extra of [{ onHand: -1 }, { unitCode: 'box' }, { productId: id }, { reserved: 2 }, { updatedBy: '' }])
    assert.throws(() => parseBalance({ ...balance, ...extra }, productId, id), { code: 'INVENTORY_DATA_INVALID' });
  for (const extra of [{ delta: 1 }, { onHandAfter: 1 }, { onHandBefore: 0 }, { actorUid: '' }, { reason: '' }])
    assert.throws(() => parseMovement({ ...movement, ...extra }, productId, id), { code: 'INVENTORY_DATA_INVALID' });
});
test('inventory API enforces activation/admin claims before query/body parsing', async () => {
  const calls: string[] = [];
  const countResult = { balance: { onHand: 0 }, movement: { kind: 'count' } } as never;
  const transferResult = { source: countResult, destination: countResult } as never;
  const settingsResult = { schemaVersion: 1 as const, productId, locationId: id, reorderPoint: 0, version: 1, updatedAt: at, updatedBy: actor.uid };
  const inventory: InventoryRepository = {
    locations: async () => { calls.push('locations'); return { items: [], nextCursor: null }; },
    createLocation: async () => { calls.push('create'); throw new ApiError(409, 'TEST', 'Expected'); },
    updateLocation: async () => { calls.push('edit'); throw new ApiError(409, 'TEST', 'Expected'); },
    list: async (location, cursor, filters) => { calls.push('list'); assert.equal(location, id); assert.equal(cursor, 'opaque');
      assert.deepEqual(filters, { skuPrefix: 'SOL-', category: 'Panels', stockStatus: 'unknown' }); return { items: [], nextCursor: null }; },
    row: async (product, location) => { calls.push('row'); assert.equal(product, productId); assert.equal(location, id);
      return { product: {} as never, balance: null, settings: null, stockStatus: 'unknown' }; },
    count: async (owner, product, location, value) => { calls.push('count'); assert.equal(owner.uid, actor.uid); assert.equal(product, productId);
      assert.equal(location, id); assert.equal(value.countedQuantity, 0); return countResult; },
    transfer: async (owner, product, location, value) => { calls.push('transfer'); assert.equal(owner.uid, actor.uid); assert.equal(product, productId);
      assert.equal(location, id); assert.equal(value.destinationLocationId, destinationId); return transferResult; },
    settings: async (owner, product, location, value) => { calls.push('settings'); assert.equal(owner.uid, actor.uid); assert.equal(product, productId);
      assert.equal(location, id); assert.equal(value.reorderPoint, 0); assert.equal(value.expectedProductVersion, 1);
      return settingsResult; },
    movements: async (product, location, cursor) => {
      calls.push('movements'); assert.equal(product, productId); assert.equal(location, id); assert.equal(cursor, 'history_cursor');
      return { items: [], nextCursor: null };
    },
    adjust: async owner => { calls.push('adjust'); assert.equal(owner.uid, actor.uid); throw new ApiError(409, 'TEST', 'Expected'); },
  };
  const verifier = { verify: async (token: string) => ({ ...actor, storeAdmin: token === 'admin' }), close: async () => {} };
  const app = buildApp(enabled, { logger: false, verifier, inventory });
  const off = buildApp(loadConfig({ NODE_ENV: 'test' }), { logger: false, verifier, inventory });
  const routes = [
    { method: 'GET' as const, url: '/api/v1/admin/inventory/locations?extra=x' },
    { method: 'POST' as const, url: '/api/v1/admin/inventory/locations', payload: {} },
    { method: 'PUT' as const, url: '/api/v1/admin/inventory/locations/' + id, payload: {} },
    { method: 'GET' as const, url: '/api/v1/admin/inventory/' + id + '?extra=x' },
    { method: 'GET' as const, url: '/api/v1/admin/inventory/' + id + '?stockStatus=invalid' },
    { method: 'GET' as const, url: '/api/v1/admin/inventory/' + id + '/products/' + productId + '?extra=x' },
    { method: 'GET' as const, url: '/api/v1/admin/inventory/' + id + '/products/' + productId + '/movements?extra=x' },
    { method: 'POST' as const, url: '/api/v1/admin/inventory/' + id + '/products/' + productId + '/adjustments', payload: {} },
    { method: 'POST' as const, url: '/api/v1/admin/inventory/' + id + '/products/' + productId + '/counts?extra=x', payload: {} },
    { method: 'POST' as const, url: '/api/v1/admin/inventory/' + id + '/products/' + productId + '/transfers?extra=x', payload: {} },
    { method: 'PUT' as const, url: '/api/v1/admin/inventory/' + id + '/products/' + productId + '/settings?extra=x', payload: {} },
  ];
  try {
    for (const route of routes) {
      assert.equal((await off.inject({ ...route, headers: { authorization: 'Bearer admin' } })).statusCode, 503);
      assert.equal((await app.inject(route)).statusCode, 401);
      assert.equal((await app.inject({ ...route, headers: { authorization: 'Bearer customer' } })).statusCode, 403);
      assert.equal((await app.inject({ ...route, headers: { authorization: 'Bearer admin' } })).statusCode, 400);
    }
    assert.deepEqual(calls, []);
    const historyUrl = '/api/v1/admin/inventory/' + id + '/products/' + productId + '/movements';
    assert.equal((await app.inject({ method: 'GET', url: historyUrl + '?pageSize=50', headers: { authorization: 'Bearer admin' } })).statusCode, 400);
    const history = await app.inject({ method: 'GET', url: historyUrl + '?cursor=history_cursor', headers: { authorization: 'Bearer admin' } });
    assert.equal(history.statusCode, 200); assert.equal(history.headers['cache-control'], 'no-store');
    assert.deepEqual(history.json(), { items: [], nextCursor: null });
    assert.equal((await app.inject({ method: 'GET', url: '/api/v1/admin/inventory/' + id + '?skuPrefix=sol-&category=Panels&stockStatus=unknown&cursor=opaque', headers: { authorization: 'Bearer admin' } })).statusCode, 200);
    assert.equal((await app.inject({ method: 'POST', url: '/api/v1/admin/inventory/' + id + '/products/' + productId + '/adjustments',
      headers: { authorization: 'Bearer admin' }, payload: input })).statusCode, 409);
    const rowUrl = '/api/v1/admin/inventory/' + id + '/products/' + productId;
    const row = await app.inject({ method: 'GET', url: rowUrl, headers: { authorization: 'Bearer admin' } });
    assert.equal(row.statusCode, 200); assert.equal(row.headers['cache-control'], 'no-store'); assert.equal(row.json().stockStatus, 'unknown');
    const countInput = { requestId: id, expectedVersion: null, expectedProductVersion: 1, countedQuantity: 0, reason: 'Verified empty', observedAt: at };
    const count = await app.inject({ method: 'POST', url: rowUrl + '/counts', headers: { authorization: 'Bearer admin' }, payload: countInput });
    assert.equal(count.statusCode, 200); assert.deepEqual(count.json(), countResult);
    const transferInput = { requestId: id, expectedProductVersion: 1, destinationLocationId: destinationId, expectedSourceVersion: 1,
      expectedDestinationVersion: 1, quantity: 2, reason: 'Move stock', observedAt: at };
    const transfer = await app.inject({ method: 'POST', url: rowUrl + '/transfers', headers: { authorization: 'Bearer admin' }, payload: transferInput });
    assert.equal(transfer.statusCode, 200); assert.deepEqual(transfer.json(), transferResult);
    const settingsInput = { requestId: id, expectedVersion: null, expectedProductVersion: 1, reorderPoint: 0 };
    const settings = await app.inject({ method: 'PUT', url: rowUrl + '/settings', headers: { authorization: 'Bearer admin' }, payload: settingsInput });
    assert.equal(settings.statusCode, 200); assert.deepEqual(settings.json(), { settings: settingsResult });
    assert.deepEqual(calls, ['movements', 'list', 'adjust', 'row', 'count', 'transfer', 'settings']);
  } finally { await app.close(); await off.close(); }
});
