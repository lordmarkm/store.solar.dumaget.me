import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  parseBrandCursor, parseProductQuery, parseSupplierStatus, parseSupplierUpdate,
} from '../src/admin-catalog.js';
import { ApiError } from '../src/errors.js';
import type { Firestore } from 'firebase-admin/firestore';
import { FirestoreAdminCatalogRepository } from '../src/admin-catalog.repository.js';

const requestId = '11111111-1111-4111-8111-111111111111';
const supplierId = '22222222-2222-4222-8222-222222222222';
const at = '2026-10-13T00:00:00.000Z';

function supplierInput(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    requestId, name: 'Solar Supply', region: 'Manila', description: 'Supplier',
    website: 'https://supplier.example', email: 'sales@supplier.example', phone: '123',
    ...overrides,
  };
}

function invalidInput(action: () => unknown): void {
  assert.throws(action, (error: unknown) => error instanceof ApiError
    && error.statusCode === 400 && error.code === 'INVALID_CATALOG_INPUT');
}

test('product query accepts only bounded allowlisted filters and normalizes SKU and supplier IDs', () => {
  assert.deepEqual(parseProductQuery({
    cursor: 'next_01', skuPrefix: ' panel-01 ', brand: ' Solar ', category: 'Panels',
    supplierId: supplierId.toUpperCase(),
  }), {
    cursor: 'next_01',
    filters: { skuPrefix: 'PANEL-01', brand: 'Solar', category: 'Panels', supplierId },
  });
  assert.deepEqual(parseProductQuery({}), { cursor: null, filters: {} });
  for (const category of ['PV Isolator', 'MCCB'])
    assert.deepEqual(parseProductQuery({ category }), { cursor: null, filters: { category } });
  assert.equal(parseProductQuery({ cursor: 'x'.repeat(512) }).cursor, 'x'.repeat(512));

  for (const query of [
    null, [], { unknown: '1' }, { brand: '' }, { brand: 'x'.repeat(81) },
    { skuPrefix: 'has space' }, { skuPrefix: '-' }, { skuPrefix: 'x'.repeat(65) },
    { category: 'Other' }, { supplierId: 'not-a-uuid' }, { cursor: 'x'.repeat(513) },
    { cursor: 'has space' },
  ]) invalidInput(() => parseProductQuery(query));
});

test('admin protection-category listing uses existing category indexes and bounded scan cursors without skipping lookahead', async () => {
  const records = Array.from({ length: 60 }, (_, index) => {
    const n = index + 1, isMcb = n % 2 === 1, rawCategory = n % 3 === 0 && isMcb ? 'Circuit breakers' : 'Protection';
    const id = `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
    return { id, value: { id, schemaVersion: 1, version: 1, createdBy: 'admin', createdAt: at, updatedAt: at,
      state: 'draft', currency: 'PHP', sku: `SKU-${String(n).padStart(3, '0')}`, name: `Product ${n}`, brand: 'Solar',
      category: rawCategory, unitCode: 'unit', description: 'Product details', amountMinor: 100, supplierId,
      protectionType: isMcb ? 'MCB' : 'ATS', ...(isMcb ? { mcbSpecifications: { type: 'AC', amperage: 32 } } : { atsSpecifications: { amperage: 63 } }) } };
  });
  const queryLog: Array<{ conditions: Array<[string, string, unknown]>; limit: number; anchor: string | null }> = [];
  const database = { collection(name: string) {
    assert.equal(name, 'products');
    const make = (conditions: Array<[string, string, unknown]> = [], anchor: string | null = null, limit = 50) => ({
      where(field: string, operator: string, value: unknown) { return make([...conditions, [field, operator, value]], anchor, limit); },
      orderBy() { return make(conditions, anchor, limit); },
      startAfter(sku: string) { return make(conditions, sku, limit); },
      limit(value: number) { return make(conditions, anchor, value); },
      async get() {
        queryLog.push({ conditions, limit, anchor });
        const matches = records.filter(({ value }) => conditions.every(([field, operator, expected]) => {
          const actual = value[field as keyof typeof value];
          if (operator === '==') return actual === expected;
          if (operator === 'in') return Array.isArray(expected) && expected.includes(actual);
          if (operator === '>=') return typeof actual === 'string' && actual >= expected;
          if (operator === '<') return typeof actual === 'string' && actual < expected;
          return false;
        })).filter(({ value }) => !anchor || value.sku > anchor).sort((a, b) => a.value.sku.localeCompare(b.value.sku));
        return { docs: matches.slice(0, limit).map(row => ({ id: row.id, data: () => row.value })) };
      },
    });
    return make();
  } } as unknown as Firestore;
  const repository = new FirestoreAdminCatalogRepository(() => database);
  const filters = { category: 'Circuit breakers', brand: 'Solar', supplierId };
  const first = await repository.products(null, filters, 10);
  assert.equal(first.items.length, 10);
  assert.ok(first.items.every(item => item.category === 'Circuit breakers' && item.protectionType === 'MCB'));
  assert.ok(first.nextCursor);
  assert.equal(queryLog[0]?.limit, 50);
  assert.ok(queryLog[0]?.conditions.some(([field, operator, value]) => field === 'category' && operator === 'in'
    && Array.isArray(value) && value[0] === 'Circuit breakers' && value[1] === 'Protection'));
  assert.ok(queryLog[0]?.conditions.some(([field]) => field === 'brand'));
  assert.ok(queryLog[0]?.conditions.some(([field]) => field === 'supplierId'));
  assert.ok(!queryLog[0]?.conditions.some(([field]) => field === 'protectionType'));
  const second = await repository.products(first.nextCursor, filters, 10);
  assert.equal(second.items.length, 10);
  assert.ok(second.items.every(item => item.category === 'Circuit breakers' && item.protectionType === 'MCB'));
  assert.equal(second.items[0]?.sku, 'SKU-021');
  assert.ok(queryLog[1]?.anchor && queryLog[1]!.anchor! < 'SKU-021');
});

test('brand cursor is optional, bounded, trimmed, and rejects unknown query keys', () => {
  assert.equal(parseBrandCursor({}), null);
  assert.equal(parseBrandCursor({ cursor: 'Solar' }), 'Solar');
  assert.equal(parseBrandCursor({ cursor: ' x ' }), 'x');
  assert.equal(parseBrandCursor({ cursor: 'x'.repeat(80) }), 'x'.repeat(80));
  for (const query of [null, [], { page: '2' }, { cursor: '' }, { cursor: 'x'.repeat(81) }]) {
    invalidInput(() => parseBrandCursor(query));
  }
});

test('supplier update requires every input field and a valid expectedVersion with no unknown fields', () => {
  const parsed = parseSupplierUpdate({
    ...supplierInput({ requestId: requestId.toUpperCase(), name: '  Solar Supply  ' }),
    expectedVersion: 7,
  });
  assert.equal(parsed.requestId, requestId);
  assert.equal(parsed.name, 'Solar Supply');
  assert.equal(parsed.expectedVersion, 7);

  for (const input of [
    { ...supplierInput() },
    { ...supplierInput(), expectedVersion: 0 },
    { ...supplierInput(), expectedVersion: 1.5 },
    { ...supplierInput(), expectedVersion: Number.MAX_SAFE_INTEGER },
    { ...supplierInput(), expectedVersion: '1' },
    { ...supplierInput(), expectedVersion: 1, unknown: true },
    { ...supplierInput({ requestId: 'bad' }), expectedVersion: 1 },
    { ...supplierInput({ name: '' }), expectedVersion: 1 },
  ]) invalidInput(() => parseSupplierUpdate(input));
});

test('supplier status requires an exact request, valid status, and positive safe expectedVersion', () => {
  assert.deepEqual(parseSupplierStatus({
    requestId: requestId.toUpperCase(), expectedVersion: 3, status: 'inactive',
  }), { requestId, expectedVersion: 3, status: 'inactive' });
  assert.equal(parseSupplierStatus({ requestId, expectedVersion: 1, status: 'active' }).status, 'active');

  for (const input of [
    { requestId, expectedVersion: 0, status: 'active' },
    { requestId, expectedVersion: 1.5, status: 'active' },
    { requestId, expectedVersion: Number.MAX_SAFE_INTEGER, status: 'active' },
    { requestId, expectedVersion: '1', status: 'inactive' },
    { requestId, expectedVersion: 1, status: 'disabled' },
    { requestId, expectedVersion: 1 },
    { requestId: 'bad', expectedVersion: 1, status: 'active' },
    { requestId, expectedVersion: 1, status: 'active', extra: true },
    { requestId, expectedVersion: 1, status: 'active', name: 'attacker' },
  ]) invalidInput(() => parseSupplierStatus(input));
});
