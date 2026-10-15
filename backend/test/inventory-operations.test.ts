import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FirestoreInventoryRepository } from '../src/inventory.repository.js';
import type { AdminCatalogRepository, AdminPage, AdminProduct } from '../src/admin-catalog.js';
import type { Firestore } from 'firebase-admin/firestore';

const locationId = '11111111-1111-4111-8111-111111111111';
const at = '2026-10-09T00:00:00.000Z';
const actorUid = 'inventory-test-admin';
const location = { id: locationId, schemaVersion: 1, code: 'DEPOT', name: 'Depot', notes: '', status: 'active',
  version: 1, createdAt: at, updatedAt: at, createdBy: actorUid };
const candidate = (index: number): AdminProduct => ({
  id: '00000000-0000-4000-8000-' + String(index).padStart(12, '0'),
  sku: 'SKU-' + String(index).padStart(3, '0'), name: 'Product ' + index, brand: 'Brand', category: 'Panels', unitCode: 'panel',
  description: '', amountMinor: null, supplierId: '22222222-2222-4222-8222-222222222222', version: 1, createdAt: at,
  updatedAt: at, createdBy: actorUid, schemaVersion: 1, state: 'draft', currency: 'PHP',
});

test('stock-status filtering scans no more than 50 candidates and preserves continuation on sparse empty pages', async () => {
  const catalogAnchors: (string | null)[] = [];
  const catalog = {
    products: async (cursor: string | null, filters: unknown, size: number): Promise<AdminPage<AdminProduct>> => {
      catalogAnchors.push(cursor);
      assert.deepEqual(filters, {});
      assert.equal(size, 10);
      const start = cursor ? Number(cursor.slice(1)) : 0;
      return { items: Array.from({ length: 10 }, (_, offset) => candidate(start + offset)), nextCursor: 'c' + (start + 10) };
    },
  } as unknown as AdminCatalogRepository;

  let balanceReadBatch = 0;
  const database = {
    collection: (name: string) => ({
      doc: (key: string) => name === 'inventoryLocations'
        ? { get: async () => { assert.equal(key, locationId); return { exists: true, data: () => location }; } }
        : { id: key },
    }),
    getAll: async (...refs: { id: string }[]) => {
      assert.equal(refs.length, 20);
      const hasTarget = balanceReadBatch++ === 0;
      return refs.map((_, index) => {
        return hasTarget && index === 7
          ? { exists: true, data: () => ({ schemaVersion: 1, productId: candidate(3).id, locationId,
            reorderPoint: 2, version: 1, updatedAt: at, updatedBy: actorUid }) }
          : hasTarget && index === 6
            ? { exists: true, data: () => ({ schemaVersion: 1, productId: candidate(3).id, locationId, unitCode: 'panel',
              onHand: 1, version: 1, updatedAt: at, observedAt: at, updatedBy: actorUid }) }
            : { exists: false, data: () => undefined };
      });
    },
  } as unknown as Firestore;

  const repo = new FirestoreInventoryRepository(() => database, catalog);
  const low = await repo.list(locationId, null, { stockStatus: 'low' });
  assert.deepEqual(low.items.map(row => row.product.id), [candidate(3).id]);
  assert.ok(low.nextCursor);
  assert.deepEqual(catalogAnchors, [null, 'c10', 'c20', 'c30', 'c40']);
  const wrapped = JSON.parse(Buffer.from(low.nextCursor!, 'base64url').toString('utf8')) as { q: string; c: string };
  assert.equal(wrapped.c, 'c50');

  catalogAnchors.length = 0;
  const empty = await repo.list(locationId, null, { stockStatus: 'zero' });
  assert.deepEqual(empty.items, []);
  assert.ok(empty.nextCursor, 'a bounded scan can be empty and still have more candidates');
  assert.deepEqual(catalogAnchors, [null, 'c10', 'c20', 'c30', 'c40']);
});
