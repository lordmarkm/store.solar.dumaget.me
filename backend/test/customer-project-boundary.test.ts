import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAccountProject, parseCreateProject, parseProjectCommand } from '../src/customer-projects.js';

const id = '11111111-1111-4111-8111-111111111111';
const requestId = '22222222-2222-4222-8222-222222222222';
const lineId = 'product-' + requestId;
const details = { name: 'Roof', classification: 'residential', installation: 'rooftop', configuration: 'hybrid', workScope: 'new-installation' };
const item = { product: { productId: id, variantId: null, unitCode: 'panel' }, quantity: 1 };
const now = '2026-10-08T00:00:00.000Z';
const project = { ...details, id, schemaVersion: 1, customerId: 'customer/a', version: 1,
  status: 'draft', createdAt: now, updatedAt: now, archivedAt: null,
  bom: { id: 'bom-' + id, projectId: id, items: [], updatedAt: now } };

test('minimal account project accepts absent optional details, but never foreign ownership', () => {
  assert.equal(parseAccountProject(project, id, 'customer/a').name, 'Roof');
  assert.throws(() => parseAccountProject(project, id, 'customer/b'));
  assert.throws(() => parseAccountProject({ ...project, customerId: 'local-preview' }, id, 'customer/a'));
  assert.throws(() => parseAccountProject({ ...project, role: 'admin' }, id, 'customer/a'));
});

test('create rejects caller-owned metadata and arbitrary nested catalog content', () => {
  const input = { requestId, details, items: [item] };
  assert.equal(parseCreateProject(input).items?.length, 1);
  for (const field of ['customerId', 'id', 'version', 'status', 'createdAt', 'bom', 'snapshot']) {
    assert.throws(() => parseCreateProject({ ...input, [field]: 'forged' }), field);
    assert.throws(() => parseCreateProject({ ...input, details: { ...details, [field]: 'forged' } }), 'details.' + field);
  }
  for (const field of ['amountMinor', 'price', 'supplierId', 'snapshot', 'notes', 'id']) {
    assert.throws(() => parseCreateProject({ ...input, items: [{ ...item, [field]: 'forged' }] }), field);
    assert.throws(() => parseCreateProject({ ...input, items: [{ ...item, product: { ...item.product, [field]: 'forged' } }] }), 'product.' + field);
  }
});

test('project planning allows above-stock safe whole quantities only and bounded rows', () => {
  assert.equal(parseCreateProject({ requestId, details, items: [{ ...item, quantity: Number.MAX_SAFE_INTEGER }] }).items?.[0]?.quantity, Number.MAX_SAFE_INTEGER);
  for (const quantity of [0, -1, 1.5, '2', NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => parseCreateProject({ requestId, details, items: [{ ...item, quantity }] }));
  }
  assert.throws(() => parseCreateProject({ requestId, details, items: Array.from({ length: 201 }, () => item) }));
  assert.throws(() => parseCreateProject({ requestId, details, items: [{ ...item, product: { ...item.product, variantId: 'unsupported' } }] }));
});

test('every BOM quantity entry point rejects non-positive, fractional, and unsafe quantities', () => {
  const common = { requestId, expectedVersion: 1 };
  const textInput = { title: 'Labor', description: '', unit: 'job', quantity: 1, notes: '' };
  const invalid = [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1];
  const guestPayload = (quantity: number) => {
    const copiedItem = { id: 'guest-item-a', kind: 'store-product', product: item.product, quantity };
    return { listId: 'guest-a', itemIds: ['guest-item-a'], fingerprint: JSON.stringify({ id: 'guest-a', state: 'unlinked', items: [copiedItem] }) };
  };

  for (const quantity of invalid) {
    const productItem = { ...item, quantity };
    assert.throws(() => parseCreateProject({ requestId, details, items: [productItem] }), `initial item: ${quantity}`);
    assert.throws(() => parseCreateProject({ requestId, details, items: [productItem], guest: guestPayload(quantity) }), `initial cart copy: ${quantity}`);
    assert.throws(() => parseProjectCommand({ ...common, action: 'add-items', items: [productItem] }), `add-items: ${quantity}`);
    assert.throws(() => parseProjectCommand({ ...common, action: 'add-items', items: [productItem], guest: guestPayload(quantity) }), `cart copy: ${quantity}`);
    assert.throws(() => parseProjectCommand({ ...common, action: 'free-text', input: { ...textInput, quantity } }), `free-text: ${quantity}`);
    assert.throws(() => parseProjectCommand({ ...common, action: 'quantity', itemId: lineId, quantity }), `quantity edit: ${quantity}`);
  }

  const maximumQuantity = parseProjectCommand({ ...common, action: 'quantity', itemId: lineId, quantity: Number.MAX_SAFE_INTEGER });
  assert.equal(maximumQuantity.action, 'quantity');
  if (maximumQuantity.action === 'quantity') assert.equal(maximumQuantity.quantity, Number.MAX_SAFE_INTEGER);
});

test('guest review requires all item identities and matching content, not a fabricated fingerprint', () => {
  const guestItem = { id: 'guest-item-a', kind: 'store-product', ...item };
  const fingerprint = JSON.stringify({ id: 'guest-a', state: 'unlinked', items: [guestItem] });
  const input = { requestId, details, items: [item], guest: { listId: 'guest-a', fingerprint, itemIds: ['guest-item-a'] } };
  assert.equal(parseCreateProject(input).guest?.listId, 'guest-a');
  assert.throws(() => parseCreateProject({ ...input, items: [{ ...item, quantity: 2 }] }));
  assert.throws(() => parseCreateProject({ ...input, guest: { ...input.guest, itemIds: [] } }));
  assert.throws(() => parseCreateProject({ ...input, guest: { ...input.guest, customerId: 'forged' } }));
});

test('commands cannot lock BOMs, write prices, or inject historical items via Undo', () => {
  const common = { requestId, expectedVersion: 1 };
  for (const action of ['lock', 'snapshot', 'revise', 'archive', 'purchase']) {
    assert.throws(() => parseProjectCommand({ ...common, action }));
  }
  const input = { title: 'Labor', description: '', unit: 'job', quantity: 1, notes: '' };
  assert.throws(() => parseProjectCommand({ ...common, action: 'free-text', input: { ...input, amountMinor: 100 } }));
  assert.throws(() => parseProjectCommand({ ...common, action: 'restore', item: { ...item, id: lineId, kind: 'store-product', createdAt: now, updatedAt: now }, index: 0 }));
  assert.equal(parseProjectCommand({ ...common, action: 'restore', itemId: lineId, index: 0 }).action, 'restore');
});
