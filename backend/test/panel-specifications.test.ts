import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  parseProductInput, parseProductRecord, parseProductUpdate, parsePublishedProduct, publicProjection, type PanelSpecifications,
} from '../src/admin-catalog.js';
import { imageDescriptor } from '../src/product-images.js';
import { ApiError } from '../src/errors.js';

const id = '11111111-1111-4111-8111-111111111111';
const supplierId = '22222222-2222-4222-8222-222222222222';
const at = '2026-10-07T00:00:00.000Z';
const images = [imageDescriptor('b'.repeat(64), 120, 80)];
const example: PanelSpecifications = {
  productCode: 'PX-450', eanCode: '0123456789012', lightColor: 'Black frame', cable: '1.2 m',
  ratedMaximumPower: '450 W', shortCircuitCurrentTolerance: '+3%', openCircuitVoltageTolerance: '+3%',
  ipRating: 'IP68', dimensions: '1762 × 1134 × 30 mm', standardTestConditions: '1000 W/m²\n25°C\nAM 1.5',
  safetyClass: 'Class II', maxSystemVoltage: '1500 V DC', grossWeight: '22 kg', netWeight: '21 kg',
  warranty: '12 years product\n25 years performance',
};
function input(overrides: Record<string, unknown> = {}) {
  return { requestId: id, sku: 'PANEL-01', name: 'Panel', brand: 'Solar', category: 'Panels', unitCode: 'panel',
    description: 'Panel description', amountMinor: 50000, supplierId, ...overrides };
}
function adminRecord(panelSpecifications?: unknown) {
  return {
    sku: 'PANEL-01', name: 'Panel', brand: 'Solar', category: 'Panels', unitCode: 'panel', description: 'Panel description',
    amountMinor: 50000, supplierId, id, schemaVersion: 1, version: 1, createdBy: 'admin-uid', createdAt: at,
    updatedAt: at, state: 'published', currency: 'PHP', publishedVersion: 1,
    ...(panelSpecifications === undefined ? {} : { panelSpecifications }),
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

test('panel specs parse as bounded strings with stable key order and preserve EAN leading zeroes', () => {
  const specs = { warranty: '  12 years  ', eanCode: ' 0123456789012 ', productCode: ' PX-450 ' };
  const parsed = parseProductInput(input({ panelSpecifications: specs })).panelSpecifications;
  assert.deepEqual(parsed, { productCode: 'PX-450', eanCode: '0123456789012', warranty: '12 years' });
  assert.equal(parsed?.eanCode, '0123456789012');
  assert.deepEqual(parseProductInput(input({ panelSpecifications: example })).panelSpecifications, example);
  assert.deepEqual(parseProductInput(input()).panelSpecifications, undefined);
  assert.equal(parseProductInput(input({ panelSpecifications: null })).panelSpecifications, null);
  assert.deepEqual(parseProductUpdate({ ...input({ panelSpecifications: example }), expectedVersion: 1 }).panelSpecifications, example);
  assert.equal(parseProductUpdate({ ...input({ panelSpecifications: null }), expectedVersion: 1 }).panelSpecifications, null);
});

test('panel specs reject unknown keys, bad types, controls, overlong values and non-panel objects', () => {
  for (const specs of [
    { productCode: 'x', unexpected: 'x' }, { eanCode: 123 }, { cable: null },
    { productCode: 'x'.repeat(201) }, { standardTestConditions: 'x'.repeat(501) }, { warranty: 'x'.repeat(1001) },
    { dimensions: 'bad\ttab' }, { standardTestConditions: 'bad\u0000control' }, { warranty: 'bad\u007fcontrol' },
  ]) invalidInput(() => parseProductInput(input({ panelSpecifications: specs })));
  for (const category of ['Inverters', 'Batteries', 'Mounting', 'Protection', null]) {
    invalidInput(() => parseProductInput(input({ category, panelSpecifications: {} })));
  }
  assert.deepEqual(parseProductInput(input({ panelSpecifications: { warranty: 'line 1\nline 2' } })).panelSpecifications,
    { warranty: 'line 1\nline 2' });
  assert.deepEqual(parseProductInput(input({ panelSpecifications: { standardTestConditions: '' } })).panelSpecifications,
    { standardTestConditions: '' });
});

test('legacy admin and public records remain valid and specs project without private supplier data', () => {
  const legacy = parseProductRecord(adminRecord(), id);
  assert.equal(legacy.panelSpecifications, undefined);
  const record = parseProductRecord(adminRecord(example), id);
  assert.deepEqual(record.panelSpecifications, example);
  const projected = publicProjection({ ...record, images }, at);
  assert.deepEqual(projected.panelSpecifications, example);
  assert.equal('supplierId' in projected, false);
  assert.equal('createdBy' in projected, false);
  assert.equal('requestId' in projected, false);
  assert.deepEqual(parsePublishedProduct(projected, id), projected);
  const legacyProjection = { ...publicProjection({ ...legacy, images }, at) };
  delete legacyProjection.images;
  assert.deepEqual(parsePublishedProduct(legacyProjection, id), legacyProjection);
  assert.equal(parsePublishedProduct(publicProjection({ ...legacy, images }, at), id).panelSpecifications, undefined);
});

test('stored panel specs require a canonical, valid map while allowing reordered keys', () => {
  const reversed = Object.fromEntries(Object.entries(example).reverse());
  assert.deepEqual(parseProductRecord(adminRecord(reversed), id).panelSpecifications, example);
  assert.equal(parseProductRecord(adminRecord(null), id).panelSpecifications, null);
  for (const specs of [
    { productCode: ' PX-450 ' }, { productCode: 42 }, { extra: 'value' },
    { warranty: 'x'.repeat(1001) },
  ]) invalidRecord(() => parseProductRecord(adminRecord(specs), id));
});
