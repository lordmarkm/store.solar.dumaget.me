/** Isolated demo emulator only: never invoke on a live database. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { FirestoreInventoryRepository } from '../src/inventory.repository.js';
import { FirestoreAdminCatalogRepository } from '../src/admin-catalog.repository.js';
import type { CountInput, TransferInput } from '../src/inventory.js';
if (process.env['FIRESTORE_EMULATOR_HOST'] !== '127.0.0.1:8180') throw new Error('Fixed loopback emulator required');
const app = initializeApp({ projectId: 'demo-store-provisioning' }, 'inventory-operations-' + randomUUID());
const db = getFirestore(app, 'store-dev'), at = '2026-10-09T00:00:00.000Z';
const catalog = new FirestoreAdminCatalogRepository(() => db, () => new Date(at));
const repo = new FirestoreInventoryRepository(() => db, catalog, () => new Date(at));
const actor = { uid: 'operations-fixture', email: 'fixture@solar.dumaget.me', emailVerified: true, storeAdmin: true };
try {
  const supplier = await catalog.createSupplier(actor, { requestId: randomUUID(), name: 'Operations fixture', region: '', description: '', website: '', email: '', phone: '' });
  const fields = { sku: 'OPS-COUNT', name: 'Panel', brand: 'Fixture', category: 'Panels' as const, unitCode: 'panel' as const,
    description: 'Emulator only', amountMinor: 0, supplierId: supplier.id };
  const product = await catalog.createProduct(actor, { requestId: randomUUID(), ...fields });
  let from = await repo.createLocation(actor, { requestId: randomUUID(), code: 'OPS_FROM', name: 'Source', notes: '' });
  let to = await repo.createLocation(actor, { requestId: randomUUID(), code: 'OPS_TO', name: 'Destination', notes: '' });
  const countInput = (expectedVersion: number | null, countedQuantity: number): CountInput => ({
    requestId: randomUUID(), expectedVersion, expectedProductVersion: product.version, countedQuantity, reason: 'Physical count', observedAt: at,
  });
  assert.equal((await repo.row(product.id, from.id)).stockStatus, 'unknown');
  const opening = countInput(null, 0);
  let source = await repo.count(actor, product.id, from.id, opening);
  assert.equal(source.movement.kind, 'count'); assert.equal(source.movement.delta, 0); assert.equal(source.movement.onHandBefore, null);
  assert.equal((await repo.row(product.id, from.id)).stockStatus, 'zero');
  assert.deepEqual(await repo.count(actor, product.id, from.id, opening), source, 'Count retry cannot double-post');
  await assert.rejects(repo.count(actor, product.id, from.id, { ...opening, countedQuantity: 2 }), { code: 'IDEMPOTENCY_CONFLICT' });
  source = await repo.count(actor, product.id, from.id, countInput(source.balance.version, 10));
  assert.equal(source.movement.delta, 10);
  const staleCount = countInput(source.balance.version, 3);
  source = await repo.count(actor, product.id, from.id, countInput(source.balance.version, 10));
  assert.equal(source.movement.delta, 0); assert.equal(source.balance.version, 3, 'Matching counts retain audit evidence');
  await assert.rejects(repo.count(actor, product.id, from.id, staleCount), { code: 'INVENTORY_CHANGED' });
  source = await repo.count(actor, product.id, from.id, countInput(source.balance.version, 8));
  assert.equal(source.movement.delta, -2); assert.equal(source.balance.onHand, 8);
  await assert.rejects(repo.count(actor, product.id, from.id, { ...countInput(source.balance.version, 7), observedAt: '2026-10-10T00:00:00.000Z' }), { code: 'OBSERVATION_IN_FUTURE' });

  await assert.rejects(repo.settings(actor, product.id, from.id, { requestId: randomUUID(), expectedVersion: null, expectedProductVersion: product.version + 1, reorderPoint: 9 }), { code: 'PRODUCT_CHANGED' });
  const thresholdInput = { requestId: randomUUID(), expectedVersion: null, expectedProductVersion: product.version, reorderPoint: 9 };
  const settings = await repo.settings(actor, product.id, from.id, thresholdInput);
  assert.equal((await repo.row(product.id, from.id)).stockStatus, 'low');
  assert.deepEqual(await repo.settings(actor, product.id, from.id, thresholdInput), settings);
  await assert.rejects(repo.settings(actor, product.id, from.id, { ...thresholdInput, requestId: randomUUID() }), { code: 'INVENTORY_CHANGED' });
  const reset = await repo.settings(actor, product.id, from.id, { requestId: randomUUID(), expectedVersion: settings.version, expectedProductVersion: product.version, reorderPoint: null });
  assert.equal(reset.reorderPoint, null); assert.equal((await repo.row(product.id, from.id)).stockStatus, 'in-stock');
  await assert.rejects(catalog.updateProduct(actor, product.id, { requestId: randomUUID(), expectedVersion: product.version, ...fields, unitCode: 'kit' }), { code: 'STOCK_UNIT_IMMUTABLE' });

  const transferInput = (sourceVersion: number, destinationVersion: number, quantity: number): TransferInput => ({
    requestId: randomUUID(), expectedProductVersion: product.version, destinationLocationId: to.id,
    expectedSourceVersion: sourceVersion, expectedDestinationVersion: destinationVersion, quantity, reason: 'Physical relocation', observedAt: at,
  });
  await assert.rejects(repo.transfer(actor, product.id, from.id, transferInput(source.balance.version, 1, 1)), { code: 'OPENING_BALANCE_REQUIRED' });
  let destination = await repo.count(actor, product.id, to.id, countInput(null, 0));
  const transfer = transferInput(source.balance.version, destination.balance.version, 3);
  const moved = await repo.transfer(actor, product.id, from.id, transfer);
  assert.equal(moved.source.balance.onHand, 5); assert.equal(moved.destination.balance.onHand, 3);
  assert.equal(moved.source.movement.transferId, moved.destination.movement.transferId);
  assert.equal(moved.source.movement.otherLocationId, to.id); assert.equal(moved.destination.movement.otherLocationId, from.id);
  assert.equal(moved.source.movement.delta + moved.destination.movement.delta, 0);
  assert.deepEqual(await repo.transfer(actor, product.id, from.id, transfer), moved);
  await assert.rejects(repo.transfer(actor, product.id, from.id, { ...transfer, quantity: 2 }), { code: 'IDEMPOTENCY_CONFLICT' });
  await assert.rejects(repo.transfer(actor, product.id, from.id, { ...transferInput(moved.source.balance.version, moved.destination.balance.version, 1), destinationLocationId: from.id }), { code: 'INVALID_TRANSFER' });
  await assert.rejects(repo.transfer(actor, product.id, from.id, transferInput(moved.source.balance.version, moved.destination.balance.version, 6)), { code: 'INVALID_STOCK_BALANCE' });
  assert.equal((await repo.row(product.id, to.id)).balance!.onHand, 3, 'Failed transfer never writes only one side');
  const simultaneous = await Promise.allSettled([
    repo.transfer(actor, product.id, from.id, transferInput(moved.source.balance.version, moved.destination.balance.version, 4)),
    repo.transfer(actor, product.id, from.id, transferInput(moved.source.balance.version, moved.destination.balance.version, 4)),
  ]);
  assert.equal(simultaneous.filter(item => item.status === 'fulfilled').length, 1, 'Only one versioned transfer commits');
  assert.equal((await repo.row(product.id, from.id)).balance!.onHand + (await repo.row(product.id, to.id)).balance!.onHand, 8);
  await assert.rejects(repo.transfer(actor, product.id, from.id, transfer), { code: 'INVENTORY_CHANGED' });
  from = await repo.updateLocation(actor, from.id, { requestId: randomUUID(), expectedVersion: from.version, name: from.name, notes: '', status: 'inactive' });
  const currentSource = (await repo.row(product.id, from.id)).balance!, currentDestination = (await repo.row(product.id, to.id)).balance!;
  await assert.rejects(repo.transfer(actor, product.id, from.id, transferInput(currentSource.version, currentDestination.version, 1)), { code: 'LOCATION_INACTIVE' });
  await assert.rejects(repo.count(actor, product.id, from.id, countInput(currentSource.version, 1)), { code: 'LOCATION_INACTIVE' });
  from = await repo.updateLocation(actor, from.id, { requestId: randomUUID(), expectedVersion: from.version, name: from.name, notes: '', status: 'active' });
  to = await repo.updateLocation(actor, to.id, { requestId: randomUUID(), expectedVersion: to.version, name: to.name, notes: '', status: 'inactive' });
  await assert.rejects(repo.transfer(actor, product.id, from.id, transferInput(currentSource.version, currentDestination.version, 1)), { code: 'LOCATION_INACTIVE' });

  const products = [];
  for (let n = 0; n < 55; n++) products.push(await catalog.createProduct(actor, { requestId: randomUUID(), ...fields, sku: 'OPS-PAGE-' + String(n).padStart(3, '0') }));
  const rare = products[52]!, zero = products[51]!, unknown = products[50]!;
  await repo.count(actor, rare.id, from.id, { ...countInput(null, 2), expectedProductVersion: rare.version });
  await repo.settings(actor, rare.id, from.id, { requestId: randomUUID(), expectedVersion: null, expectedProductVersion: rare.version, reorderPoint: 3 });
  await repo.count(actor, zero.id, from.id, { ...countInput(null, 0), expectedProductVersion: zero.version });
  await repo.settings(actor, unknown.id, from.id, { requestId: randomUUID(), expectedVersion: null, expectedProductVersion: unknown.version, reorderPoint: 3 });
  const filter = { skuPrefix: 'OPS-PAGE-', category: 'Panels', stockStatus: 'low' as const };
  const sparse = await repo.list(from.id, null, filter);
  assert.deepEqual(sparse.items, []); assert.ok(sparse.nextCursor, 'Budget-limited empty page must retain continuation');
  assert.ok(sparse.nextCursor.length <= 512);
  const later = await repo.list(from.id, sparse.nextCursor, filter);
  assert.deepEqual(later.items.map(row => row.product.id), [rare.id]); assert.equal(later.nextCursor, null);
  await assert.rejects(repo.list(from.id, sparse.nextCursor, { ...filter, stockStatus: 'zero' }), { code: 'INVALID_CURSOR' });
  await assert.rejects(repo.list(to.id, sparse.nextCursor, filter), { code: 'INVALID_CURSOR' });
  const zeros = await repo.list(from.id, null, { ...filter, stockStatus: 'zero' });
  assert.ok(zeros.nextCursor);
  assert.deepEqual((await repo.list(from.id, zeros.nextCursor, { ...filter, stockStatus: 'zero' })).items.map(row => row.product.id), [zero.id]);
  const unknownPage = await repo.list(from.id, null, { ...filter, stockStatus: 'unknown' });
  assert.equal(unknownPage.items.length, 10); assert.ok(unknownPage.nextCursor);
  assert.ok(unknownPage.items.every(row => row.balance === null));
  assert.equal((await repo.row(unknown.id, from.id)).stockStatus, 'unknown', 'Threshold alone is not a stock count');
  const seen = unknownPage.items.map(row => row.product.id), pageSizes = [unknownPage.items.length];
  let cursor: string | null = unknownPage.nextCursor;
  while (cursor) {
    const page = await repo.list(from.id, cursor, { ...filter, stockStatus: 'unknown' });
    assert.ok(page.items.every(row => row.balance === null));
    seen.push(...page.items.map(row => row.product.id)); pageSizes.push(page.items.length);
    cursor = page.nextCursor;
  }
  assert.deepEqual(pageSizes, [10, 10, 10, 10, 10, 3]);
  assert.equal(new Set(seen).size, 53); assert.equal(seen.length, 53, 'Filtered pages never skip or duplicate candidates');
  await assert.rejects(catalog.updateProduct(actor, unknown.id, {
    requestId: randomUUID(), expectedVersion: unknown.version, ...fields, sku: unknown.sku, unitCode: 'kit',
  }), { code: 'STOCK_UNIT_IMMUTABLE' }, 'Threshold-only pool locks its unit before a balance exists');
  const ledger = [];
  let historyCursor: string | null = null;
  do {
    const page = await repo.movements(product.id, from.id, historyCursor);
    ledger.push(...page.items); historyCursor = page.nextCursor;
  } while (historyCursor);
  assert.equal(ledger.reduce((sum, movement) => sum + movement.delta, 0), currentSource.onHand);
  assert.ok(ledger.some(movement => movement.kind === 'transfer-out' && movement.transferId));
  assert.ok(ledger.some(movement => movement.kind === 'count' && movement.delta === 0));
  console.log('PASS physical operations: audited counts/no-change/stale guards; atomic linked transfers/concurrency/retry/inactive guards; thresholds/units; bounded server-side sparse stock filtering. Emulator only.');
} finally { await db.terminate(); await deleteApp(app); }
