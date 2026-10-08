import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  parseCursor, parseProductInput, parseProductRecord, parseSupplierInput, parseSupplierRecord,
} from '../src/admin-catalog.js';
import { ApiError } from '../src/errors.js';

const requestId = '11111111-1111-4111-8111-111111111111';
const supplierId = '22222222-2222-4222-8222-222222222222';
const at = '2026-10-07T00:00:00.000Z';

function supplierInput(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    requestId, name: 'Solar Supply', region: '', description: '', website: '', email: '', phone: '',
    ...overrides,
  };
}

function productInput(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    requestId, sku: 'PANEL-01', name: 'Panel', brand: '', category: null, unitCode: null,
    description: '', amountMinor: null, supplierId, ...overrides,
  };
}

function supplierRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: 'Solar Supply', region: '', description: '', website: '', email: '', phone: '',
    id: supplierId, schemaVersion: 1, version: 1, createdBy: 'admin-uid', createdAt: at,
    updatedAt: at, status: 'active', ...overrides,
  };
}

function productRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    sku: 'PANEL-01', name: 'Panel', brand: '', category: null, unitCode: null, description: '',
    amountMinor: null, supplierId, id: requestId, schemaVersion: 1, version: 1,
    createdBy: 'admin-uid', createdAt: at, updatedAt: at, state: 'draft', currency: 'PHP',
    ...overrides,
  };
}

function invalidInput(action: () => unknown): void {
  assert.throws(action, (error: unknown) => error instanceof ApiError && error.statusCode === 400
    && error.code === 'INVALID_CATALOG_INPUT');
}

function invalidRecord(action: () => unknown): void {
  assert.throws(action, (error: unknown) => error instanceof ApiError && error.statusCode === 503
    && error.code === 'CATALOG_DATA_INVALID');
}

test('catalog input requires exact object keys and canonicalizes case-sensitive identifiers', () => {
  const upperRequest = requestId.toUpperCase();
  const upperSupplier = supplierId.toUpperCase();
  assert.equal(parseSupplierInput(supplierInput({ requestId: upperRequest })).requestId, requestId);
  const parsedProduct = parseProductInput(productInput({ requestId: upperRequest, supplierId: upperSupplier, sku: 'panel-01' }));
  assert.equal(parsedProduct.requestId, requestId);
  assert.equal(parsedProduct.supplierId, supplierId);
  assert.equal(parsedProduct.sku, 'PANEL-01');
  invalidInput(() => parseSupplierInput(supplierInput({ unexpected: true })));
  invalidInput(() => parseSupplierInput({ ...supplierInput(), name: undefined }));
  invalidInput(() => parseProductInput(productInput({ unexpected: true })));
  invalidInput(() => parseProductInput({ ...productInput(), sku: undefined }));
});

test('supplier input rejects blank names, invalid identifiers, unsafe URLs, and invalid email lengths', () => {
  for (const name of ['', '  \t  ']) invalidInput(() => parseSupplierInput(supplierInput({ name })));
  for (const id of ['', 'not-a-uuid', '11111111-1111-3111-8111-111111111111']) {
    invalidInput(() => parseSupplierInput(supplierInput({ requestId: id })));
  }
  for (const website of [
    'http://supplier.example', 'https://user:pass@supplier.example', 'https://', 'javascript:alert(1)',
  ]) invalidInput(() => parseSupplierInput(supplierInput({ website })));
  invalidInput(() => parseSupplierInput(supplierInput({ email: 'x'.repeat(315) + '@a.com' })));
  invalidInput(() => parseSupplierInput(supplierInput({ email: 'not-an-email' })));
  assert.equal(parseSupplierInput(supplierInput({ website: 'https://supplier.example/path', email: 'sales@supplier.example' })).website,
    'https://supplier.example/path');
});

test('product input rejects reserved or malformed SKUs, arrays, unsupported units, and unsafe prices', () => {
  for (const sku of ['', '   ', 'with space', '.hidden', '-reserved', '_reserved', 'has/slash', 'has?query']) {
    invalidInput(() => parseProductInput(productInput({ sku })));
  }
  for (const category of [[], ['Panels'], ['Panels', 'Inverters']]) {
    invalidInput(() => parseProductInput(productInput({ category })));
  }
  for (const unitCode of ['piece', '', [], ['unit']]) {
    invalidInput(() => parseProductInput(productInput({ unitCode })));
  }

  assert.equal(parseProductInput(productInput({ amountMinor: null })).amountMinor, null);
  assert.equal(parseProductInput(productInput({ amountMinor: 0 })).amountMinor, 0);
  assert.equal(parseProductInput(productInput({ amountMinor: 1250 })).amountMinor, 1250);
  assert.equal(parseProductInput(productInput({ amountMinor: 99_999_999_999_999 })).amountMinor, 99_999_999_999_999);
  for (const amountMinor of [0.5, -1, Number.MAX_SAFE_INTEGER + 1, 100_000_000_000_000, Infinity, '0']) {
    invalidInput(() => parseProductInput(productInput({ amountMinor })));
  }
});

test('descriptions reject control characters while permitting multiline text', () => {
  assert.equal(parseSupplierInput(supplierInput({ description: 'line one\nline two' })).description,
    'line one\nline two');
  assert.equal(parseProductInput(productInput({ description: 'line one\nline two' })).description, 'line one\nline two');
  invalidInput(() => parseSupplierInput(supplierInput({ description: 'bad\u0000text' })));
  invalidInput(() => parseSupplierInput(supplierInput({ description: 'bad\ttab' })));
  invalidInput(() => parseSupplierInput(supplierInput({ description: 'bad\u007ftext' })));
  invalidInput(() => parseProductInput(productInput({ description: 'bad\u000btext' })));
});

test('cursor accepts only an optional UUID cursor parameter', () => {
  assert.equal(parseCursor({}), null);
  assert.equal(parseCursor({ cursor: requestId.toUpperCase() }), requestId);
  for (const query of [null, [], { page: '2' }, { cursor: 'bad' }, { cursor: requestId, extra: 'x' }]) {
    invalidInput(() => parseCursor(query));
  }
});

test('stored records reject owner, timestamp, control, status, and unknown-field tampering', () => {
  assert.equal(parseSupplierRecord(supplierRecord(), supplierId).createdBy, 'admin-uid');
  assert.equal(parseSupplierRecord(supplierRecord({ version: 2, status: 'inactive', updatedAt: '2026-10-07T00:00:01.000Z' }), supplierId).version, 2);
  assert.equal(parseProductRecord(productRecord(), requestId).currency, 'PHP');
  const invalidSuppliers = [
    { createdBy: '' }, { createdBy: `admin\u0000uid` }, { id: requestId },
    { schemaVersion: 2 }, { version: 0 }, { status: 'disabled' }, { extra: true },
    { updatedAt: '2026-10-06T00:00:01.000Z' }, { createdAt: 'not-a-time' },
    { name: '  ' }, { description: 'bad\u0001text' },
  ];
  for (const change of invalidSuppliers) invalidRecord(() => parseSupplierRecord(supplierRecord(change), supplierId));
  const invalidProducts = [
    { createdBy: '' }, { createdBy: `admin\u007fuid` }, { id: supplierId },
    { schemaVersion: 2 }, { version: 0 }, { state: 'active' }, { currency: 'USD' }, { stock: 5 },
    { updatedAt: '2026-10-06T00:00:01.000Z' }, { createdAt: 'not-a-time' },
    { sku: 'has space' }, { description: 'bad\u0000text' },
  ];
  for (const change of invalidProducts) invalidRecord(() => parseProductRecord(productRecord(change), requestId));
});
