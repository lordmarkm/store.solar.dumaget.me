/** Real transactions on isolated demo emulator. No live stock, credentials or cloud writes. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { FirestoreInventoryRepository } from '../src/inventory.repository.js';
import { FirestoreAdminCatalogRepository } from '../src/admin-catalog.repository.js';
import type { StockInput } from '../src/inventory.js';
if (process.env['FIRESTORE_EMULATOR_HOST'] !== '127.0.0.1:8180') throw new Error('Fixed loopback emulator required');
const app = initializeApp({ projectId: 'demo-store-provisioning' }, 'inventory-' + randomUUID());
const db = getFirestore(app, 'store-dev'), at = '2026-10-09T00:00:00.000Z';
const catalog = new FirestoreAdminCatalogRepository(() => db, () => new Date(at));
const repo = new FirestoreInventoryRepository(() => db, catalog, () => new Date(at));
const actor = { uid: 'inventory-fixture', email: 'fixture@solar.dumaget.me', emailVerified: true, storeAdmin: true };
try {
  const source = await catalog.createSupplier(actor, { requestId: randomUUID(), name: 'Inventory test ' + randomUUID(), region: '', description: '', website: '', email: '', phone: '' });
  const productInput = { requestId: randomUUID(), sku: 'INVENTORY-TEST', name: 'Panel', brand: 'Fixture', category: 'Panels' as const,
    unitCode: 'panel' as const, description: 'Fixture', amountMinor: 0, supplierId: source.id };
  const product = await catalog.createProduct(actor, productInput);
  const locationInput = { requestId: randomUUID(), code: 'TEST_DEPOT', name: 'Fixture depot', notes: '' };
  let location = await repo.createLocation(actor, locationInput);
  assert.deepEqual(await repo.createLocation(actor, locationInput), location, 'Create retry must not duplicate');
  await assert.rejects(repo.createLocation(actor, { ...locationInput, requestId: randomUUID() }), { code: 'LOCATION_CODE_EXISTS' });
  assert.equal((await repo.list(location.id, null, { skuPrefix: 'INVENTORY-' })).items[0]?.balance, null, 'Unknown is not zero');
  const stockInput = (version: number | null, kind: StockInput['kind'], quantity: number): StockInput =>
    ({ requestId: randomUUID(), expectedVersion: version, expectedProductVersion: product.version, kind, quantity, reason: 'Fixture physical observation', observedAt: at });
  const opening = stockInput(null, 'opening', 0);
  let result = await repo.adjust(actor, product.id, location.id, opening);
  assert.equal(result.balance.onHand, 0); assert.equal(result.movement.onHandBefore, null);
  assert.deepEqual(await repo.adjust(actor, product.id, location.id, opening), result, 'Retry is idempotent');
  await assert.rejects(repo.adjust(actor, product.id, location.id, { ...opening, quantity: 5 }), { code: 'IDEMPOTENCY_CONFLICT' });
  await assert.rejects(repo.adjust(actor, product.id, location.id, stockInput(null, 'opening', 4)), { code: 'INVENTORY_CHANGED' });
  result = await repo.adjust(actor, product.id, location.id, stockInput(result.balance.version, 'receipt', 10));
  await assert.rejects(repo.adjust(actor, product.id, location.id, stockInput(result.balance.version, 'issue', 11)), { code: 'INVALID_STOCK_BALANCE' });
  const concurrent = await Promise.allSettled([
    repo.adjust(actor, product.id, location.id, stockInput(result.balance.version, 'issue', 6)),
    repo.adjust(actor, product.id, location.id, stockInput(result.balance.version, 'issue', 6)),
  ]);
  assert.equal(concurrent.filter(item => item.status === 'fulfilled').length, 1, 'Only one same-version issue commits');
  const row = (await repo.list(location.id, null, { skuPrefix: 'INVENTORY-' })).items[0]!;
  assert.equal(row.balance?.onHand, 4);
  result = await repo.adjust(actor, product.id, location.id, stockInput(row.balance!.version, 'correction', -2));
  result = await repo.adjust(actor, product.id, location.id, stockInput(result.balance.version, 'return', 3));
  result = await repo.adjust(actor, product.id, location.id, stockInput(result.balance.version, 'damage', 1));
  const edit = { requestId: randomUUID(), expectedVersion: location.version, name: 'Renamed depot', notes: '', status: 'inactive' as const };
  location = await repo.updateLocation(actor, location.id, edit);
  assert.deepEqual(await repo.updateLocation(actor, location.id, edit), location);
  await assert.rejects(repo.adjust(actor, product.id, location.id, stockInput(result.balance.version, 'receipt', 1)), { code: 'LOCATION_INACTIVE' });
  assert.equal((await repo.list(location.id, null, { skuPrefix: 'INVENTORY-' })).items[0]?.balance?.onHand, 4, 'Deactivation preserves stock/history');
  location = await repo.updateLocation(actor, location.id, { ...edit, requestId: randomUUID(), expectedVersion: location.version, status: 'active' });
  await assert.rejects(catalog.updateProduct(actor, product.id, { ...productInput, requestId: randomUUID(), expectedVersion: product.version, unitCode: 'kit' }), { code: 'STOCK_UNIT_IMMUTABLE' });
  await assert.rejects(repo.adjust(actor, product.id, location.id, { ...stockInput(result.balance.version, 'receipt', 1), expectedProductVersion: 2 }), { code: 'PRODUCT_CHANGED' });
  await assert.rejects(repo.adjust(actor, product.id, location.id, { ...stockInput(result.balance.version, 'receipt', 1), observedAt: '2026-10-10T00:00:00.000Z' }), { code: 'OBSERVATION_IN_FUTURE' });
  const raceInput = { ...productInput, requestId: randomUUID(), sku: 'UNIT-OPENING-RACE' };
  const racing = await catalog.createProduct(actor, raceInput);
  const race = await Promise.allSettled([
    repo.adjust(actor, racing.id, location.id, { ...stockInput(null, 'opening', 2), expectedProductVersion: racing.version }),
    catalog.updateProduct(actor, racing.id, { ...raceInput, requestId: randomUUID(), expectedVersion: racing.version, unitCode: 'kit' }),
  ]);
  assert.equal(race.filter(item => item.status === 'fulfilled').length, 1, 'Opening and unit conversion cannot both commit');
  const withoutUnit = await catalog.createProduct(actor, { ...productInput, requestId: randomUUID(), sku: 'UNIT-MISSING', unitCode: null });
  await assert.rejects(repo.adjust(actor, withoutUnit.id, location.id, stockInput(null, 'opening', 1)), { code: 'STOCK_UNIT_REQUIRED' });
  for (let n = 0; n < 50; n++) result = await repo.adjust(actor, product.id, location.id, stockInput(result.balance.version, 'receipt', 1));
  const first = await repo.movements(product.id, location.id, null);
  assert.equal(first.items.length, 5); assert.ok(first.nextCursor);
  const ledger = [...first.items], movementSizes = [first.items.length];
  let movementCursor: string | null = first.nextCursor;
  while (movementCursor) {
    const next = await repo.movements(product.id, location.id, movementCursor);
    ledger.push(...next.items); movementSizes.push(next.items.length); movementCursor = next.nextCursor;
  }
  assert.deepEqual(movementSizes, [...Array(11).fill(5), 1]);
  assert.deepEqual(ledger.map(movement => movement.version), Array.from({ length: 56 }, (_, index) => 56 - index));
  assert.deepEqual(await repo.movements(product.id, location.id, null), first, 'Previous-page reads re-fetch the same ledger slice');
  assert.equal(ledger.reduce((sum, movement) => sum + movement.delta, 0), result.balance.onHand, 'Ledger reconciles to physical balance');
  assert.equal(new Set(ledger.map(movement => movement.id)).size, ledger.length);
  await assert.rejects(repo.movements(product.id, randomUUID(), first.nextCursor), { code: 'INVALID_CURSOR' });
  assert.equal((await repo.movements(product.id, randomUUID(), null)).items.length, 0);
  for (let n = 0; n < 54; n++) await catalog.createProduct(actor, { ...productInput, requestId: randomUUID(), sku: 'INVENTORY-PAGE-' + String(n).padStart(3, '0') });
  const page = await repo.list(location.id, null, { skuPrefix: 'INVENTORY-', category: 'Panels' });
  assert.equal(page.items.length, 10); assert.ok(page.nextCursor);
  const inventoryIds = page.items.map(item => item.product.id), sizes = [page.items.length];
  let inventoryCursor: string | null = page.nextCursor;
  while (inventoryCursor) {
    const later = await repo.list(location.id, inventoryCursor, { skuPrefix: 'INVENTORY-', category: 'Panels' });
    inventoryIds.push(...later.items.map(item => item.product.id)); sizes.push(later.items.length); inventoryCursor = later.nextCursor;
  }
  assert.deepEqual(sizes, [10, 10, 10, 10, 10, 5]);
  assert.equal(new Set(inventoryIds).size, 55, 'Ten-row pages must not skip or repeat products');
  assert.deepEqual((await repo.list(location.id, null, { skuPrefix: 'INVENTORY-', category: 'Panels' })).items.map(item => item.product.id),
    page.items.map(item => item.product.id), 'Returning to the first cursor re-fetches the same page');
  await assert.rejects(repo.list(location.id, page.nextCursor, { category: 'Inverters' }), { code: 'INVALID_CURSOR' });
  await assert.rejects(catalog.products(page.nextCursor, { skuPrefix: 'INVENTORY-', category: 'Panels' }), { code: 'INVALID_CURSOR' });
  assert.equal((await catalog.products(null, { skuPrefix: 'INVENTORY-', category: 'Panels' })).items.length, 50, 'Catalog retains its existing page size');
  for (let n = 0; n < 50; n++) await repo.createLocation(actor, { ...locationInput, requestId: randomUUID(), code: 'PAGED_' + n });
  const locations = await repo.locations(null); assert.equal(locations.items.length, 50); assert.ok(locations.nextCursor);
  assert.equal((await repo.locations(locations.nextCursor)).items.length, 1);
  console.log('PASS physical stock: zero/unknown, locations, receipts/issues/returns/damage/corrections, concurrency/retry/negative guards, unit protection, history pagination and reconciliation. Emulator only.');
} finally { await db.terminate(); await deleteApp(app); }
