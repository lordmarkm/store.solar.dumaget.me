import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Firestore } from 'firebase-admin/firestore';
import { FirestoreAdminCatalogRepository } from '../src/admin-catalog.repository.js';
import { parseProductInput, parseProductRecord, parsePublishedProduct, publicProjection, requireSupplierProductUrl } from '../src/admin-catalog.js';
import type { ProductInput, AdminSupplier } from '../src/admin-catalog.js';
import { imageDescriptor } from '../src/product-images.js';

const id = '11111111-1111-4111-8111-111111111111';
const supplierId = '22222222-2222-4222-8222-222222222222';
const at = '2026-10-12T00:00:00.000Z';
const identity = { uid: 'admin', email: 'admin@solar.dumaget.me', emailVerified: true, storeAdmin: true };
const url = 'https://shopee.ph/SUNTREE-AC-MCB-i.172114281.23155901342?extraParams=%7B%22display_model_id%22%3A49702679795%7D';
const input: ProductInput = { requestId: id, sku: 'SUNTREE-32A', name: '32A breaker', brand: 'SUNTREE', category: 'Batteries',
  unitCode: 'unit', description: '2-pole AC MCB', amountMinor: null, supplierId };
const supplier: AdminSupplier = { id: supplierId, schemaVersion: 1, version: 1, createdBy: identity.uid, createdAt: at, updatedAt: at,
  status: 'active', name: 'Shopee', region: '', description: '', website: '', email: '', phone: '' };
const record = { ...input, id, schemaVersion: 1, version: 1, createdBy: identity.uid, createdAt: at, updatedAt: at, state: 'draft', currency: 'PHP' };
const { requestId: _requestId, ...stored } = record;

test('supplier URLs are optional legacy metadata, bounded HTTPS, and preserve the full query', () => {
  assert.equal(parseProductInput(input).supplierUrl, undefined);
  assert.equal(parseProductInput({ ...input, supplierUrl: '' }).supplierUrl, '');
  assert.equal(parseProductInput({ ...input, supplierUrl: ` ${url} ` }).supplierUrl, url);
  assert.equal(parseProductRecord({ ...stored, supplierUrl: url }, id).supplierUrl, url);
  assert.equal(parseProductRecord(stored, id).supplierUrl, undefined);
  for (const supplierUrl of [null, 1, 'http://shopee.ph/item', 'javascript:alert(1)', 'https://user:pass@shopee.ph/item',
    'https://shopee.ph:8080/item', 'https://', 'https://shopee.ph/\nitem', 'https://shopee.ph/with space',
    'https://shopee.ph/\ud800', 'https://shopee.ph/\\item', 'https://shopee.ph/' + 'x'.repeat(2048)]) {
    assert.throws(() => parseProductInput({ ...input, supplierUrl }), { code: 'INVALID_CATALOG_INPUT' });
  }
  assert.throws(() => parseProductRecord({ ...stored, supplierUrl: ` ${url}` }, id), { code: 'CATALOG_DATA_INVALID' });
});

test('authoritative Shopee supplier name requires a real Shopee host, other sources remain optional', () => {
  for (const supplierUrl of [undefined, '', 'https://example.com/item', 'https://shopee.ph.evil.test/item', 'https://evilshopee.ph/item']) {
    assert.throws(() => requireSupplierProductUrl(supplierUrl === undefined ? {} : { supplierUrl }, { name: ' shOPee ' }), { code: 'SUPPLIER_URL_REQUIRED' });
  }
  requireSupplierProductUrl({ supplierUrl: url }, supplier);
  requireSupplierProductUrl({ supplierUrl: 'https://s.shopee.ph/item' }, supplier);
  requireSupplierProductUrl({}, { name: 'Other supplier' });
});

test('sourcing URL is not a public product field', () => {
  const product = parseProductRecord({ ...stored, supplierUrl: url, amountMinor: 100, images: [imageDescriptor('d'.repeat(64), 100, 100)] }, id);
  const projection = publicProjection(product, at);
  assert.equal(Object.hasOwn(projection, 'supplierUrl'), false);
  assert.equal(parsePublishedProduct(projection, id).sku, input.sku);
  assert.throws(() => parsePublishedProduct({ ...projection, supplierUrl: url }, id), { code: 'CATALOG_DATA_INVALID' });
});

// Offline transaction double: no Firebase credentials, SDK connection or live data.
function fakeDatabase() {
  const documents = new Map<string, unknown>([['suppliers/' + supplierId, supplier], ['products/' + id, stored]]);
  const reads: string[] = [];
  type Ref = { id: string; path: string };
  const database = {
    collection(name: string) { return { doc(docId: string): Ref { return { id: docId, path: name + '/' + docId }; } }; },
    async runTransaction<T>(callback: (tx: unknown) => Promise<T>) {
      const pending = new Map<string, unknown>();
      let writing = false;
      const tx = {
        get: async (ref: Ref) => {
          assert.equal(writing, false, 'Reads must precede writes'); reads.push(ref.path);
          return { id: ref.id, exists: documents.has(ref.path), data: () => structuredClone(documents.get(ref.path)) };
        },
        set: (ref: Ref, value: unknown) => { writing = true; pending.set(ref.path, structuredClone(value)); },
        create: (ref: Ref, value: unknown) => { writing = true; assert.equal(documents.has(ref.path), false); pending.set(ref.path, structuredClone(value)); },
        delete: (ref: Ref) => { writing = true; pending.set(ref.path, undefined); },
      };
      const result = await callback(tx);
      for (const [key, value] of pending) value === undefined ? documents.delete(key) : documents.set(key, value);
      return result;
    },
  } as unknown as Firestore;
  return { documents, reads, repo: new FirestoreAdminCatalogRepository(() => database, () => new Date(at)) };
}

test('create/save/publish enforce source URL before any write; legacy unpublish remains available', async () => {
  const fake = fakeDatabase();
  const before = structuredClone([...fake.documents]);
  await assert.rejects(fake.repo.createProduct(identity, input), { code: 'SUPPLIER_URL_REQUIRED' });
  await assert.rejects(fake.repo.updateProduct(identity, id, { ...input, expectedVersion: 1 }), { code: 'SUPPLIER_URL_REQUIRED' });
  await assert.rejects(fake.repo.publishProduct(identity, id, { requestId: id, expectedVersion: 1 }), { code: 'SUPPLIER_URL_REQUIRED' });
  assert.deepEqual([...fake.documents], before);
  const created = await fake.repo.createProduct(identity, { ...input, supplierUrl: url });
  assert.equal(created.supplierUrl, url); assert.equal(created.amountMinor, null); assert.equal(created.state, 'draft');
  const saved = await fake.repo.updateProduct(identity, id, { ...input, supplierUrl: url, expectedVersion: 1 });
  assert.equal(saved.supplierUrl, url); assert.equal(saved.version, 2);
  await assert.rejects(fake.repo.updateProduct(identity, id, { ...input, requestId: '44444444-4444-4444-8444-444444444444', supplierUrl: '', expectedVersion: 2 }), { code: 'SUPPLIER_URL_REQUIRED' });
  // A legacy published record without sourcing metadata can still be taken off sale.
  fake.documents.set('products/' + id, { ...stored, state: 'published', publishedVersion: 1 });
  const unpublished = await fake.repo.unpublishProduct(identity, id, { requestId: '33333333-3333-4333-8333-333333333333', expectedVersion: 1 });
  assert.equal(unpublished.state, 'draft');
});

test('other suppliers can save without a URL; Shopee publish preserves the link privately', async () => {
  const fake = fakeDatabase();
  fake.documents.set('suppliers/' + supplierId, { ...supplier, name: 'Other source' });
  const other = await fake.repo.createProduct(identity, input);
  assert.equal(Object.hasOwn(other, 'supplierUrl'), false);
  // A source rename is enforced on the next product command, without a bulk backfill.
  fake.documents.set('suppliers/' + supplierId, supplier);
  const updated = await fake.repo.updateProduct(identity, id, { ...input, supplierUrl: url, amountMinor: 100,
    images: [imageDescriptor('e'.repeat(64), 100, 100)], expectedVersion: 1 });
  const published = await fake.repo.publishProduct(identity, id, {
    requestId: '55555555-5555-4555-8555-555555555555', expectedVersion: updated.version,
  });
  assert.equal(published.state, 'published');
  assert.equal(published.supplierUrl, url);
  assert.equal(Object.hasOwn(fake.documents.get('publishedProducts/' + id) as object, 'supplierUrl'), false);
});
