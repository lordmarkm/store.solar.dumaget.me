import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  parseBrandCursor, parseProductQuery, parseSupplierStatus, parseSupplierUpdate,
} from '../src/admin-catalog.js';
import { ApiError } from '../src/errors.js';

const requestId = '11111111-1111-4111-8111-111111111111';
const supplierId = '22222222-2222-4222-8222-222222222222';

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
  assert.equal(parseProductQuery({ cursor: 'x'.repeat(512) }).cursor, 'x'.repeat(512));

  for (const query of [
    null, [], { unknown: '1' }, { brand: '' }, { brand: 'x'.repeat(81) },
    { skuPrefix: 'has space' }, { skuPrefix: '-' }, { skuPrefix: 'x'.repeat(65) },
    { category: 'Other' }, { supplierId: 'not-a-uuid' }, { cursor: 'x'.repeat(513) },
    { cursor: 'has space' },
  ]) invalidInput(() => parseProductQuery(query));
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
