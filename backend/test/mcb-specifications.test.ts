import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Firestore } from 'firebase-admin/firestore';
import { FirestoreAdminCatalogRepository } from '../src/admin-catalog.repository.js';
import { parseProductInput, parseProductUpdate, parseProductRecord, parsePublishedProduct, publicProjection } from '../src/admin-catalog.js';
import type { ProductInput, AdminSupplier } from '../src/admin-catalog.js';
import { imageDescriptor } from '../src/product-images.js';

const id = '11111111-1111-4111-8111-111111111111';
const supplierId = '22222222-2222-4222-8222-222222222222';
const at = '2026-10-12T00:00:00.000Z';
const identity = { uid: 'admin', email: 'admin@solar.dumaget.me', emailVerified: true, storeAdmin: true };
const input: ProductInput = { requestId: id, sku: 'MCB-32', name: 'MCB', brand: 'SUNTREE', category: 'Batteries',
  unitCode: 'unit', description: '32A AC breaker', amountMinor: 39900, supplierId,
  images: [imageDescriptor('f'.repeat(64), 100, 100)] };
const supplier: AdminSupplier = { id: supplierId, schemaVersion: 1, version: 1, createdBy: identity.uid, createdAt: at, updatedAt: at,
  status: 'active', name: 'Other supplier', region: '', description: '', website: '', email: '', phone: '' };
const { requestId: _requestId, ...fields } = input;
const stored = { ...fields, id, schemaVersion: 1, version: 1, createdBy: identity.uid, createdAt: at, updatedAt: at, state: 'draft', currency: 'PHP' };
const specs = { type: 'AC' as const, amperage: 32 };
const typedMcb = { ...stored, category: 'Circuit breakers', protectionType: 'MCB', mcbSpecifications: specs };

test('explicit MCBs require AC/DC type and positive numeric amperage, including drafts', () => {
  for (const type of ['AC', 'DC'] as const) for (const amperage of [0.5, 16, 32, 63]) {
    assert.deepEqual(parseProductInput({ ...input, category: 'Circuit breakers', protectionType: 'MCB', mcbSpecifications: { type, amperage } }).mcbSpecifications, { type, amperage });
  }
  const invalidSpecs = [undefined, null, {}, { type: 'AC' }, { amperage: 32 }, { ...specs, extra: true },
    { ...specs, type: 'ac' }, { ...specs, type: 'AC/DC' }, { ...specs, type: '' }, { ...specs, amperage: '32' },
    ...[null, 0, -1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1].map(amperage => ({ ...specs, amperage }))];
  for (const mcbSpecifications of invalidSpecs) {
    const value = { ...input, category: 'Circuit breakers', protectionType: 'MCB', ...(mcbSpecifications === undefined ? {} : { mcbSpecifications }) };
    assert.throws(() => parseProductInput(value), { code: 'INVALID_CATALOG_INPUT' });
    assert.throws(() => parseProductUpdate({ ...value, expectedVersion: 1 }), { code: 'INVALID_CATALOG_INPUT' });
  }
});

test('other categories and untyped legacy records do not become MCBs by name inference', () => {
  assert.equal(parseProductInput(input).protectionType, undefined); // Even the name MCB is not a discriminator.
  assert.equal(parseProductRecord(stored, id).mcbSpecifications, undefined);
  assert.equal(parseProductInput({ ...input, protectionType: null, mcbSpecifications: null }).mcbSpecifications, null);
  assert.equal(parseProductInput({ ...input, category: 'Circuit breakers', mcbSpecifications: specs }).protectionType, 'MCB');
  for (const value of [{ ...input, protectionType: 'SPD' },
    { ...input, protectionType: 'MCB', category: 'Panels', mcbSpecifications: specs },
    { ...input, protectionType: null, mcbSpecifications: specs }])
    assert.throws(() => parseProductInput(value), { code: 'INVALID_CATALOG_INPUT' });
  assert.throws(() => parseProductRecord({ ...stored, protectionType: 'MCB' }, id), { code: 'CATALOG_DATA_INVALID' });
  assert.throws(() => parseProductInput({ ...input, category: 'Protection' }), { code: 'INVALID_CATALOG_INPUT' });
});

test('legacy Protection reads normalize by explicit subtype and keep untyped products uncategorized', () => {
  const untyped = parseProductRecord({ ...stored, category: 'Protection' }, id);
  assert.equal(untyped.category, null);
  const legacyMcb = parseProductRecord({ ...stored, category: 'Protection', protectionType: 'MCB', mcbSpecifications: specs }, id);
  assert.equal(legacyMcb.category, 'Circuit breakers');
  const legacyAts = parseProductRecord({ ...stored, category: 'Protection', protectionType: 'ATS', mcbSpecifications: null }, id);
  assert.equal(legacyAts.category, 'ATS');
  const untypedPublic = { id, schemaVersion: 1, version: 1, publishedAt: at, sku: input.sku, name: input.name,
    brand: input.brand, category: 'Protection', unitCode: 'unit', description: input.description, amountMinor: 39900, currency: 'PHP' };
  assert.equal(parsePublishedProduct(untypedPublic, id).category, null);
});

test('public projection retains typed MCB facts, rejects invalid specs, and keeps sourcing private', () => {
  const product = parseProductRecord({ ...typedMcb, supplierUrl: 'https://example.com/item' }, id);
  const projection = publicProjection(product, at);
  assert.equal(projection.protectionType, 'MCB');
  assert.deepEqual(parsePublishedProduct(projection, id).mcbSpecifications, specs);
  assert.equal(Object.hasOwn(projection, 'supplierUrl'), false);
  assert.throws(() => parsePublishedProduct({ ...projection, mcbSpecifications: null }, id), { code: 'CATALOG_DATA_INVALID' });
  assert.throws(() => publicProjection({ ...product, mcbSpecifications: null }, at), { code: 'INVALID_CATALOG_INPUT' });
});

function offlineDatabase() {
  const documents = new Map<string, unknown>([['suppliers/' + supplierId, supplier],
    ['products/' + id, typedMcb]]);
  type Ref = { id: string; path: string };
  const database = {
    collection(name: string) { return { doc(docId: string): Ref { return { id: docId, path: name + '/' + docId }; } }; },
    async runTransaction<T>(callback: (tx: unknown) => Promise<T>) {
      const pending = new Map<string, unknown>();
      let writing = false;
      const tx = {
        get: async (ref: Ref) => { assert.equal(writing, false); return { id: ref.id, exists: documents.has(ref.path), data: () => structuredClone(documents.get(ref.path)) }; },
        set: (ref: Ref, value: unknown) => { writing = true; pending.set(ref.path, structuredClone(value)); },
        create: (ref: Ref, value: unknown) => { writing = true; assert.equal(documents.has(ref.path), false); pending.set(ref.path, structuredClone(value)); },
        delete: (ref: Ref) => { writing = true; pending.set(ref.path, undefined); },
      };
      const result = await callback(tx);
      for (const [key, value] of pending) value === undefined ? documents.delete(key) : documents.set(key, value);
      return result;
    },
  } as unknown as Firestore;
  return { documents, repo: new FirestoreAdminCatalogRepository(() => database, () => new Date(at)) };
}

test('ATS is an explicit Protection subcategory, not an MCB or a rating inference', () => {
  const ats = { ...input, category: 'ATS' as const, protectionType: 'ATS' as const, atsSpecifications: { amperage: 63 } };
  assert.equal(parseProductInput(ats).protectionType, 'ATS');
  assert.equal(parseProductUpdate({ ...ats, expectedVersion: 1 }).protectionType, 'ATS');
  const product = parseProductRecord({ ...stored, category: 'ATS', protectionType: 'ATS', mcbSpecifications: null, atsSpecifications: { amperage: 63 } }, id);
  assert.equal(parsePublishedProduct(publicProjection(product, at), id).protectionType, 'ATS');
  for (const value of [{ ...ats, category: 'Inverters' }, { ...ats, category: null },
    { ...ats, mcbSpecifications: specs }, { ...ats, protectionType: 'ats' }]) {
    assert.throws(() => parseProductInput(value), { code: 'INVALID_CATALOG_INPUT' });
  }
  assert.throws(() => parseProductRecord({ ...stored, protectionType: 'ATS', mcbSpecifications: specs }, id), { code: 'CATALOG_DATA_INVALID' });
  assert.equal(parseProductInput({ ...input, name: 'ATS 63A photovoltaic' }).protectionType, undefined);
});

test('MCB to ATS clears breaker ratings explicitly and unrelated edits preserve ATS', async () => {
  const fake = offlineDatabase();
  const before = structuredClone([...fake.documents]);
  await assert.rejects(async () => fake.repo.updateProduct(identity, id, { ...input, category: 'ATS', protectionType: 'ATS', expectedVersion: 1 }), { code: 'INVALID_CATALOG_INPUT' });
  assert.deepEqual([...fake.documents], before);
  const ats = await fake.repo.updateProduct(identity, id, { ...input, category: 'ATS', protectionType: 'ATS', mcbSpecifications: null, atsSpecifications: { amperage: 63 }, expectedVersion: 1 });
  assert.equal(ats.protectionType, 'ATS');
  assert.equal(ats.mcbSpecifications, null);
  const edited = await fake.repo.updateProduct(identity, id, { ...input, category: 'ATS', protectionType: 'ATS', mcbSpecifications: null, atsSpecifications: { amperage: 63 }, requestId: '55555555-5555-4555-8555-555555555555', expectedVersion: 2 });
  assert.equal(edited.protectionType, 'ATS');
  assert.deepEqual(edited.atsSpecifications, { amperage: 63 });
  const published = await fake.repo.publishProduct(identity, id, { requestId: '66666666-6666-4666-8666-666666666666', expectedVersion: 3 });
  assert.equal(published.protectionType, 'ATS');
  assert.equal((fake.documents.get('publishedProducts/' + id) as { protectionType: string }).protectionType, 'ATS');
});

test('ATS amperage is required on writes, exact and positive with public/private round trips', () => {
  for (const amperage of [0.5, 63, 100, 125]) {
    const value = { ...input, category: 'ATS', protectionType: 'ATS', atsSpecifications: { amperage } };
    assert.deepEqual(parseProductInput(value).atsSpecifications, { amperage });
    assert.deepEqual(parseProductUpdate({ ...value, expectedVersion: 1 }).atsSpecifications, { amperage });
    const record = parseProductRecord({ ...stored, category: 'ATS', protectionType: 'ATS', atsSpecifications: { amperage }, supplierUrl: 'https://shopee.ph/item' }, id);
    const projection = publicProjection(record, at);
    assert.deepEqual(parsePublishedProduct(projection, id).atsSpecifications, { amperage });
    assert.equal(Object.hasOwn(projection, 'supplierUrl'), false);
  }
  const invalid = [undefined, null, {}, { amperage: '63' }, { amperage: 63, type: 'AC' },
    ...[null, 0, -1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1].map(amperage => ({ amperage }))];
  for (const atsSpecifications of invalid) {
    const value = { ...input, category: 'ATS', protectionType: 'ATS', ...(atsSpecifications === undefined ? {} : { atsSpecifications }) };
    assert.throws(() => parseProductInput(value), { code: 'INVALID_CATALOG_INPUT' });
    assert.throws(() => parseProductUpdate({ ...value, expectedVersion: 1 }), { code: 'INVALID_CATALOG_INPUT' });
  }
  for (const value of [{ ...input, atsSpecifications: { amperage: 63 } },
    { ...input, category: 'Circuit breakers', protectionType: 'MCB', mcbSpecifications: specs, atsSpecifications: { amperage: 63 } }])
    assert.throws(() => parseProductInput(value), { code: 'INVALID_CATALOG_INPUT' });
  assert.throws(() => parseProductRecord({ ...stored, protectionType: 'ATS', atsSpecifications: { amperage: 0 } }, id), { code: 'CATALOG_DATA_INVALID' });
});

test('legacy ATS is viewable but cannot save or publish until rated; leaving ATS clears its facts', async () => {
  const legacy = parseProductRecord({ ...stored, category: 'Protection', protectionType: 'ATS', mcbSpecifications: null }, id);
  assert.equal(legacy.atsSpecifications, undefined);
  const legacyPublic = { id, schemaVersion: 1, version: 1, publishedAt: at, sku: input.sku, name: input.name,
    brand: input.brand, category: 'Protection', unitCode: 'unit', description: input.description, amountMinor: 39900, currency: 'PHP', protectionType: 'ATS' };
  assert.equal(parsePublishedProduct(legacyPublic, id).atsSpecifications, undefined);
  assert.equal(parsePublishedProduct(legacyPublic, id).category, 'ATS');
  assert.throws(() => publicProjection(legacy, at), { code: 'INVALID_CATALOG_INPUT' });
  const fake = offlineDatabase();
  fake.documents.set('products/' + id, legacy);
  const before = structuredClone([...fake.documents]);
  await assert.rejects(fake.repo.updateProduct(identity, id, { ...input, expectedVersion: 1 }), { code: 'INVALID_CATALOG_INPUT' });
  await assert.rejects(fake.repo.publishProduct(identity, id, { requestId: '33333333-3333-4333-8333-333333333333', expectedVersion: 1 }), { code: 'INVALID_CATALOG_INPUT' });
  assert.deepEqual([...fake.documents], before);
  const rated = await fake.repo.updateProduct(identity, id, { ...input, category: 'ATS', protectionType: 'ATS', atsSpecifications: { amperage: 63 }, expectedVersion: 1 });
  assert.deepEqual(rated.atsSpecifications, { amperage: 63 });
  await assert.rejects(async () => fake.repo.updateProduct(identity, id, { ...input, requestId: '44444444-4444-4444-8444-444444444444',
    category: 'ATS', protectionType: 'MCB', mcbSpecifications: specs, expectedVersion: 2 }), { code: 'INVALID_CATALOG_INPUT' });
  const mcb = await fake.repo.updateProduct(identity, id, { ...input, requestId: '55555555-5555-4555-8555-555555555555',
    category: 'Circuit breakers', protectionType: 'MCB', mcbSpecifications: specs, atsSpecifications: null, expectedVersion: 2 });
  assert.equal(mcb.atsSpecifications, null);
  assert.deepEqual(mcb.mcbSpecifications, specs);
});

test('merged updates preserve MCB fields and prevent contradictory category/subtype clears before writes', async () => {
  const fake = offlineDatabase();
  const before = structuredClone([...fake.documents]);
  for (const change of [{ category: 'Inverters' }, { protectionType: null }]) {
    await assert.rejects(fake.repo.updateProduct(identity, id, { ...input, ...change, expectedVersion: 1 } as ProductInput & { expectedVersion: number }), { code: 'INVALID_CATALOG_INPUT' });
    assert.deepEqual([...fake.documents], before);
  }
  const saved = await fake.repo.updateProduct(identity, id, { ...input, category: 'Circuit breakers', protectionType: 'MCB', mcbSpecifications: specs, expectedVersion: 1 });
  assert.deepEqual(saved.mcbSpecifications, specs);
  const published = await fake.repo.publishProduct(identity, id, { requestId: '33333333-3333-4333-8333-333333333333', expectedVersion: 2 });
  assert.equal(published.protectionType, 'MCB');
  assert.deepEqual((fake.documents.get('publishedProducts/' + id) as { mcbSpecifications: unknown }).mcbSpecifications, specs);
  const cleared = await fake.repo.updateProduct(identity, id, { ...input, requestId: '44444444-4444-4444-8444-444444444444',
    category: 'Batteries', protectionType: null, mcbSpecifications: null, expectedVersion: 3 });
  assert.equal(cleared.mcbSpecifications, null);
});
