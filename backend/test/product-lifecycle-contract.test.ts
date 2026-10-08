import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseProductRecord, parsePublishedProduct, publicProjection, publicationBlockers, parseProductUpdate, parseProductCommand } from '../src/admin-catalog.js';
import { imageDescriptor } from '../src/product-images.js';
import type { AdminProduct } from '../src/admin-catalog.js';
const id = '11111111-1111-4111-8111-111111111111';
const at = '2026-10-07T00:00:00.000Z';
const images = [imageDescriptor('a'.repeat(64), 120, 80)];
const product: AdminProduct = { id, sku: 'PANEL-1', name: 'Panel', brand: 'Solar', category: 'Panels', unitCode: 'panel', description: 'A solar panel',
  amountMinor: 0, supplierId: id, images, schemaVersion: 1, version: 1, state: 'draft', currency: 'PHP', createdBy: 'admin', createdAt: at, updatedAt: at };
test('old draft shape remains valid; working copy version can advance independently of publication', () => {
  assert.deepEqual(parseProductRecord(product, id), product);
  const updated = { ...product, version: 3, state: 'published', publishedVersion: 2, updatedAt: '2026-10-07T00:00:01.000Z', category: null };
  assert.deepEqual(parseProductRecord(updated, id), updated);
  for (const bad of [{ ...product, version: Number.MAX_SAFE_INTEGER }, { ...product, state: 'published' },
    { ...product, state: 'published', publishedVersion: 2 }, { ...product, publishedVersion: 1 }]) assert.throws(() => parseProductRecord(bad, id));
});
test('publication needs content but explicit zero is valid; public DTO excludes private sourcing and actors', () => {
  assert.deepEqual(publicationBlockers(product), []);
  const projection = publicProjection(product, at);
  assert.equal(projection.amountMinor, 0);
  assert.equal('supplierId' in projection, false);
  assert.equal('createdBy' in projection, false);
  assert.deepEqual(parsePublishedProduct(projection, id), projection);
  const legacyPublished = { ...projection };
  delete legacyPublished.images;
  assert.deepEqual(parsePublishedProduct(legacyPublished, id), legacyPublished);
  assert.throws(() => parsePublishedProduct({ ...projection, supplierId: id }, id));
  assert.throws(() => parsePublishedProduct({ ...projection, amountMinor: null }, id));
  const incomplete = { ...product, brand: '', category: null, unitCode: null, description: '', amountMinor: null };
  assert.deepEqual(publicationBlockers(incomplete), ['brand', 'category', 'sellable unit', 'description', 'price']);
  assert.throws(() => publicProjection(incomplete, at));
  const withoutImages = { ...product };
  delete withoutImages.images;
  assert.deepEqual(publicationBlockers(withoutImages), ['product image']);
  assert.throws(() => publicProjection(withoutImages, at), /product image/);
});
test('commands and updates reject server-owned fields and require safe concurrency versions', () => {
  assert.deepEqual(parseProductCommand({ requestId: id, expectedVersion: 2 }), { requestId: id, expectedVersion: 2 });
  const { id: _id, schemaVersion: _schema, version: _version, state: _state, currency: _currency, createdBy: _actor, createdAt: _created, updatedAt: _updated, ...fields } = product;
  assert.equal(parseProductUpdate({ ...fields, requestId: id, expectedVersion: 1 }).sku, 'PANEL-1');
  for (const expectedVersion of [0, -1, 1.1, null, Number.MAX_SAFE_INTEGER]) assert.throws(() => parseProductCommand({ requestId: id, expectedVersion }));
  assert.throws(() => parseProductUpdate({ ...fields, requestId: id, expectedVersion: 1, state: 'published' }));
});
