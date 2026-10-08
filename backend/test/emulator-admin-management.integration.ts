/** Isolated loopback Firestore, synthetic bucket only. NEVER connects to real GCS or live catalog. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { FirestoreAdminCatalogRepository } from '../src/admin-catalog.repository.js';
import { ProductImageLifecycle } from '../src/product-image-lifecycle.js';
import { imageDescriptor, type ImageBucket, type ProductImage } from '../src/product-images.js';
import type { ProductInput } from '../src/admin-catalog.js';

if (process.env['FIRESTORE_EMULATOR_HOST'] !== '127.0.0.1:8180') throw new Error('Fixed loopback emulator required.');
const app = initializeApp({ projectId: 'demo-store-provisioning' }, 'admin-management-' + randomUUID());
const db = getFirestore(app, 'store-dev');
let time = Date.parse('2026-10-09T00:00:00.000Z');
const objects = new Map<string, { generation: string; metadata: Record<string, string>; contentType: string }>();
const deletions: string[] = [];
let failPath: string | null = null, onDelete: (() => Promise<void>) | null = null;
const bucket = { file(path: string) { return {
  async getMetadata() { const value = objects.get(path); if (!value) throw { code: 404 }; return [value]; },
  async delete(options: { ifGenerationMatch: string }) {
    assert.match(path, /^products\/[a-f0-9]{64}\/(?:thumb|detail)\.webp$/);
    if (onDelete) { const callback = onDelete; onDelete = null; await callback(); }
    if (path === failPath) { failPath = null; throw { code: 503 }; }
    const value = objects.get(path);
    if (!value) throw { code: 404 };
    assert.equal(options.ifGenerationMatch, value.generation);
    objects.delete(path); deletions.push(path);
  },
}; } } as unknown as ImageBucket;
const lifecycle = new ProductImageLifecycle(() => db, () => bucket, () => time);
const repo = new FirestoreAdminCatalogRepository(() => db, () => new Date(time), lifecycle);
const identity = { uid: 'management-test', email: 'test@solar.dumaget.me', emailVerified: true, storeAdmin: true };
function uploadFixture(letter: string): ProductImage {
  const image = imageDescriptor(letter.repeat(64), 120, 80);
  for (const variant of ['thumb', 'detail']) objects.set('products/' + image.id + '/' + variant + '.webp', {
    generation: '123', metadata: { pipelineVersion: '1', width: '120', height: '80' }, contentType: 'image/webp',
  });
  return image;
}
const command = (version: number) => ({ requestId: randomUUID(), expectedVersion: version });
try {
  const supplierInput = { requestId: randomUUID(), name: 'Management ' + randomUUID(), region: '', description: '', website: '', email: '', phone: '' };
  let supplier = await repo.createSupplier(identity, supplierInput);
  const productInput = (sku: string, images: ProductImage[] = []): ProductInput => ({
    requestId: randomUUID(), sku, name: sku, brand: 'Fixture', category: 'Panels', unitCode: 'panel', description: 'Fixture details',
    amountMinor: 0, supplierId: supplier.id, images,
  });
  const imageA = uploadFixture('a');
  await lifecycle.beginUpload(imageA); await lifecycle.finishUpload(imageA);
  const inputA = productInput('IMAGE-A', [imageA]), inputB = productInput('IMAGE-B', [imageA]);
  let a = await repo.createProduct(identity, inputA), b = await repo.createProduct(identity, inputB);
  a = await repo.publishProduct(identity, a.id, command(a.version));
  const clearA = { ...inputA, images: [], ...command(a.version) };
  a = await repo.updateProduct(identity, a.id, clearA);
  assert.equal(objects.size, 2, 'Shared and published references retain both variants after a successful private Save.');
  assert.deepEqual((await repo.publishedProduct(a.id)).images, [imageA]);
  b = await repo.updateProduct(identity, b.id, { ...inputB, images: [], ...command(b.version) });
  assert.equal(objects.size, 2, 'Public projection retains the removed private photo.');
  await assert.rejects(repo.updateProduct(identity, a.id, { ...inputA, images: [], ...command(a.version - 1) }), { statusCode: 409 });
  assert.equal(objects.size, 2, 'Rejected Save cannot trigger deletion.');
  a = await repo.unpublishProduct(identity, a.id, command(a.version));
  assert.equal(objects.size, 0, 'Last projection removal deletes both stored variants after commit.');
  assert.equal((await db.collection('productImageAssets').doc(imageA.id).get()).get('state'), 'deleted');
  await assert.rejects(repo.updateProduct(identity, b.id, { ...inputB, ...command(b.version) }), { code: 'IMAGE_CLEANUP_BUSY' });

  const imageC = uploadFixture('c');
  await lifecycle.beginUpload(imageC); await lifecycle.finishUpload(imageC);
  const inputC = productInput('IMAGE-C', [imageC]);
  let c = await repo.createProduct(identity, inputC);
  await db.collection('productImageRetentions').doc(imageC.id).set({ reason: 'synthetic locked PO hold' });
  c = await repo.updateProduct(identity, c.id, { ...inputC, images: [], ...command(c.version) });
  assert.equal(objects.size, 2, 'Historical image hold prevents deletion.');
  // Local fixture hold only; no live PO exists or is deleted here.
  await db.collection('productImageRetentions').doc(imageC.id).delete();

  const imageD = uploadFixture('d');
  await lifecycle.beginUpload(imageD); await lifecycle.finishUpload(imageD);
  const inputD = productInput('IMAGE-D', [imageD]);
  let d = await repo.createProduct(identity, inputD);
  failPath = 'products/' + imageD.id + '/detail.webp';
  d = await repo.updateProduct(identity, d.id, { ...inputD, images: [], ...command(d.version) });
  assert.equal(d.version, 2, 'Partial GCS failure must not report a committed Save as failed.');
  assert.equal((await db.collection('productImageAssets').doc(imageD.id).get()).get('state'), 'deleting');
  await assert.rejects(lifecycle.beginUpload(imageD), { code: 'IMAGE_CLEANUP_BUSY' });
  time += 5 * 60 * 1000 + 1;
  await lifecycle.sweep();
  assert.equal(objects.has('products/' + imageD.id + '/detail.webp'), false, 'Retries finish partial deletion safely.');

  const imageE = uploadFixture('e');
  await lifecycle.beginUpload(imageE); await lifecycle.finishUpload(imageE);
  await lifecycle.sweep();
  assert.equal(objects.has('products/' + imageE.id + '/detail.webp'), true, 'Fresh unattached uploads survive grace period.');
  time += 24 * 60 * 60 * 1000 + 1; await lifecycle.sweep();
  assert.equal(objects.has('products/' + imageE.id + '/detail.webp'), false, 'Abandoned upload cleaned after 24-hour grace.');

  const imageF = uploadFixture('f');
  await lifecycle.beginUpload(imageF); await lifecycle.finishUpload(imageF);
  const inputF = productInput('IMAGE-F', [imageF]);
  let f = await repo.createProduct(identity, inputF);
  onDelete = async () => {
    assert.equal((await repo.product(f.id)).images?.length, 0, 'Catalog commit precedes physical deletion.');
    await assert.rejects(repo.updateProduct(identity, f.id, { ...inputF, ...command(f.version + 1) }), { code: 'IMAGE_CLEANUP_BUSY' });
  };
  f = await repo.updateProduct(identity, f.id, { ...inputF, images: [], ...command(f.version) });
  assert.equal(objects.has('products/' + imageF.id + '/detail.webp'), false, 'Concurrent attach cannot race the deletion claim.');

  const renamed = { ...supplierInput, name: supplier.name + ' renamed', ...command(supplier.version) };
  supplier = await repo.updateSupplier(identity, supplier.id, renamed);
  assert.deepEqual(await repo.updateSupplier(identity, supplier.id, renamed), supplier, 'Edit retry is idempotent.');
  await repo.createSupplier(identity, { ...supplierInput, requestId: randomUUID() }); // Old name released atomically.
  await assert.rejects(repo.createSupplier(identity, { ...supplierInput, name: supplier.name, requestId: randomUUID() }), { code: 'DUPLICATE_SUPPLIER' });
  const imageB = uploadFixture('b');
  await lifecycle.beginUpload(imageB); await lifecycle.finishUpload(imageB);
  let visible = await repo.createProduct(identity, productInput('SUPPLIER-PUBLIC', [imageB]));
  visible = await repo.publishProduct(identity, visible.id, command(visible.version));
  const deactivate = { ...command(supplier.version), status: 'inactive' as const };
  supplier = await repo.setSupplierStatus(identity, supplier.id, deactivate);
  assert.deepEqual((await repo.publishedProduct(visible.id)).images, [imageB], 'Deactivation must not implicitly unpublish existing products.');
  assert.deepEqual(await repo.setSupplierStatus(identity, supplier.id, deactivate), supplier);
  await assert.rejects(repo.createProduct(identity, productInput('INACTIVE-NEW')), { code: 'INVALID_SUPPLIER' });
  await assert.rejects(repo.publishProduct(identity, f.id, command(f.version)), { code: 'INVALID_SUPPLIER' });
  await repo.updateProduct(identity, f.id, { ...inputF, images: [], ...command(f.version) }); // Private edits keep unchanged inactive source.
  await assert.rejects(repo.setSupplierStatus(identity, supplier.id, { ...command(supplier.version - 1), status: 'active' }), { code: 'SUPPLIER_CHANGED' });
  supplier = await repo.setSupplierStatus(identity, supplier.id, { ...command(supplier.version), status: 'active' });

  for (let n = 0; n < 55; n++) await repo.createProduct(identity, { ...productInput('PAGE-' + String(n).padStart(3, '0')),
    brand: n === 54 ? 'Beyond first page' : 'Fixture' });
  const page = await repo.products(null, { skuPrefix: 'PAGE-', category: 'Panels', supplierId: supplier.id });
  assert.equal(page.items.length, 50); assert.ok(page.nextCursor);
  const next = await repo.products(page.nextCursor, { skuPrefix: 'PAGE-', category: 'Panels', supplierId: supplier.id });
  assert.equal(next.items.length, 5); assert.equal(next.nextCursor, null);
  assert.equal(new Set([...page.items, ...next.items].map(item => item.id)).size, 55);
  assert.equal((await repo.products(null, { brand: 'Beyond first page', category: 'Panels', supplierId: supplier.id, skuPrefix: 'PAGE-' })).items[0]?.sku, 'PAGE-054');
  await assert.rejects(repo.products(page.nextCursor, { brand: 'Fixture' }), { code: 'INVALID_CURSOR' });
  const brands: string[] = [];
  let cursor: string | null = null;
  do { const result = await repo.productBrands(cursor); brands.push(...result.items); cursor = result.nextCursor; } while (cursor);
  assert.ok(brands.includes('Beyond first page'));
  console.log('PASS post-commit deletion, shared/public/hold retention, failed Save, tombstone/retry/race, orphan grace, supplier edit/status/idempotency, API filters/pagination/brands. Emulator + synthetic bucket only.');
} finally { await db.terminate(); await deleteApp(app); }
