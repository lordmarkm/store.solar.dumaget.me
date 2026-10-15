import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Firestore } from 'firebase-admin/firestore';
import { FirestoreAdminCatalogRepository } from '../src/admin-catalog.repository.js';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const records = Array.from({ length: 12 }, (_, index) => {
  const n = index + 1;
  return { id: id(n), value: { id: id(n), schemaVersion: 1, version: 1, publishedAt: '2026-10-01T00:00:00.000Z',
    sku: `SKU-${n}`, name: `Product ${n}`, brand: 'Solar', category: n % 2 ? 'Inverters' : 'Panels', unitCode: 'unit',
    description: 'Published product details', amountMinor: 100, currency: 'PHP' } };
});
const atsRecords = Array.from({ length: 6 }, (_, index) => ({ id: id(index + 13),
  value: { ...records[0]!.value, id: id(index + 13), category: 'Protection', protectionType: 'ATS', atsSpecifications: { amperage: 63 } } }));
const mcbRecords = Array.from({ length: 6 }, (_, index) => ({ id: id(index + 19),
  value: { ...records[0]!.value, id: id(index + 19), category: 'Protection', protectionType: 'MCB', mcbSpecifications: { type: 'AC', amperage: 32 } } }));

function memoryDatabase() {
  const executed: Array<{ category: string | null; anchor: string | null; limit: number; protectionType?: string }> = [];
  const collection = () => ({
    where(field: string, operator: string, value: string) {
      assert.ok(field === 'category' || field === 'protectionType'); assert.equal(operator, '==');
      return makeQuery(field === 'category' ? value : null, null, 50, field === 'protectionType' ? value : null);
    },
    orderBy() { return makeQuery(null, null, 50); },
    limit(count: number) { return makeQuery(null, null, count); },
  });
  const makeQuery = (category: string | null, anchor: string | null, count: number, protectionType: string | null = null) => ({
    where(field: string, operator: string, value: string) {
      assert.ok(field === 'category' || field === 'protectionType'); assert.equal(operator, '==');
      return makeQuery(field === 'category' ? value : category, anchor, count, field === 'protectionType' ? value : protectionType);
    },
    orderBy() { return makeQuery(category, anchor, count, protectionType); },
    startAfter(value: string) { return makeQuery(category, value, count, protectionType); },
    limit(value: number) { return makeQuery(category, anchor, value, protectionType); },
    async get() {
      executed.push({ category, anchor, limit: count, ...(protectionType ? { protectionType } : {}) });
      let rows = [...records, ...atsRecords, ...mcbRecords].filter(row => (!category || row.value.category === category)
        && (!protectionType || 'protectionType' in row.value && row.value.protectionType === protectionType)).sort((a, b) => a.id.localeCompare(b.id));
      if (anchor) rows = rows.filter(row => row.id > anchor);
      return { docs: rows.slice(0, count).map(row => ({ id: row.id, data: () => row.value })) };
    },
  });
  return { firestore: { collection } as unknown as Firestore, executed };
}

test('public category query filters the complete published set before bounded cursor pagination', async () => {
  const memory = memoryDatabase();
  const repository = new FirestoreAdminCatalogRepository(() => memory.firestore);
  const first = await repository.publishedProducts(null, { category: 'Inverters', limit: 3 });
  assert.deepEqual(first.items.map(item => item.id), [id(1), id(3), id(5)]);
  assert.ok(first.nextCursor);
  const next = await repository.publishedProducts(first.nextCursor, { category: 'Inverters', limit: 3 });
  assert.deepEqual(next.items.map(item => item.id), [id(7), id(9), id(11)]);
  assert.equal(next.nextCursor, null);
  assert.deepEqual(memory.executed, [
    { category: 'Inverters', anchor: null, limit: 4 },
    { category: 'Inverters', anchor: id(5), limit: 4 },
  ]);
  await assert.rejects(() => repository.publishedProducts(first.nextCursor, { category: 'Panels', limit: 3 }),
    (error: unknown) => typeof error === 'object' && error !== null && 'statusCode' in error && error.statusCode === 400);
});

test('default public listing keeps the UUID cursor and 50 item ordering contract', async () => {
  const memory = memoryDatabase();
  const repository = new FirestoreAdminCatalogRepository(() => memory.firestore);
  await repository.publishedProducts(null);
  assert.deepEqual(memory.executed, [{ category: null, anchor: null, limit: 51 }]);
});

test('ATS query uses one indexed subtype equality before pagination and scopes cursors to that subtype', async () => {
  const memory = memoryDatabase();
  const repository = new FirestoreAdminCatalogRepository(() => memory.firestore);
  const filters = { category: 'ATS' as const, limit: 3 };
  const first = await repository.publishedProducts(null, filters);
  assert.deepEqual(first.items.map(item => item.id), [id(13), id(14), id(15)]);
  const next = await repository.publishedProducts(first.nextCursor, filters);
  assert.deepEqual(next.items.map(item => item.id), [id(16), id(17), id(18)]);
  assert.equal(next.nextCursor, null);
  assert.deepEqual(memory.executed, [
    { category: null, protectionType: 'ATS', anchor: null, limit: 4 },
    { category: null, protectionType: 'ATS', anchor: id(15), limit: 4 },
  ]);
  await assert.rejects(() => repository.publishedProducts(first.nextCursor, { category: 'Panels', limit: 3 }),
    (error: unknown) => typeof error === 'object' && error !== null && 'statusCode' in error && error.statusCode === 400);
});

test('Circuit breakers query uses the indexed MCB discriminator and reads typed legacy rows as the new category', async () => {
  const memory = memoryDatabase();
  const repository = new FirestoreAdminCatalogRepository(() => memory.firestore);
  const first = await repository.publishedProducts(null, { category: 'Circuit breakers', limit: 3 });
  assert.deepEqual(first.items.map(item => item.id), [id(19), id(20), id(21)]);
  assert.ok(first.items.every(item => item.category === 'Circuit breakers' && item.protectionType === 'MCB'));
  assert.deepEqual(memory.executed, [{ category: null, protectionType: 'MCB', anchor: null, limit: 4 }]);
});
