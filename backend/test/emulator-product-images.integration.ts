/** Explicit local emulator verification; product image metadata uses fixture descriptors only, never GCS. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { deleteApp, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { FirestoreAdminCatalogRepository } from '../src/admin-catalog.repository.js';
import type { ProductCommand, ProductInput } from '../src/admin-catalog.js';
import { imageDescriptor } from '../src/product-images.js';

if (process.env['FIRESTORE_EMULATOR_HOST'] !== '127.0.0.1:8180') throw new Error('Requires the fixed loopback Firestore emulator on 8180.');
const firebase = initializeApp({ projectId: 'demo-store-provisioning' }, `product-images-${randomUUID()}`);
const db = getFirestore(firebase, 'store-dev');
const identity = { uid: 'product-images-test-admin', email: 'test@solar.dumaget.me', emailVerified: true, storeAdmin: true };
const repository = new FirestoreAdminCatalogRepository(() => db);
try {
  const supplier = await repository.createSupplier(identity, {
    requestId: randomUUID(), name: `Product image test ${randomUUID()}`, region: '', description: '', website: '', email: '', phone: '',
  });
  const image = imageDescriptor('f'.repeat(64), 1200, 800);
  const input: ProductInput = { requestId: randomUUID(), sku: `IMAGE-${randomUUID()}`, name: 'Image lifecycle fixture',
    brand: 'Fixture', category: 'Panels', unitCode: 'panel', description: 'Public image fixture', amountMinor: 50000,
    supplierId: supplier.id, images: [image] };
  const created = await repository.createProduct(identity, input);
  assert.deepEqual(await repository.createProduct(identity, input), created);

  const publishCommand: ProductCommand = { requestId: randomUUID(), expectedVersion: created.version };
  const published = await repository.publishProduct(identity, created.id, publishCommand);
  assert.deepEqual((await repository.publishedProduct(created.id)).images, [image]);
  const fresh = new FirestoreAdminCatalogRepository(() => db);
  assert.deepEqual(await fresh.publishedProduct(created.id), await repository.publishedProduct(created.id));
  assert.deepEqual(await repository.publishProduct(identity, created.id, publishCommand), published);

  const privateEdit = { ...input, requestId: randomUUID(), description: 'Saved privately', expectedVersion: published.version };
  delete privateEdit.images;
  const edited = await repository.updateProduct(identity, created.id, privateEdit);
  assert.deepEqual(edited.images, [image], 'Omitted images preserve existing saved associations.');
  assert.deepEqual(await repository.updateProduct(identity, created.id, privateEdit), edited);
  assert.deepEqual((await fresh.publishedProduct(created.id)).images, [image]);
  assert.equal((await fresh.publishedProduct(created.id)).description, 'Public image fixture');

  const clearImages = { ...input, requestId: randomUUID(), images: [], expectedVersion: edited.version };
  const cleared = await repository.updateProduct(identity, created.id, clearImages);
  assert.deepEqual(cleared.images, []);
  await assert.rejects(repository.publishProduct(identity, created.id, {
    requestId: randomUUID(), expectedVersion: cleared.version,
  }), { statusCode: 422, code: 'PRODUCT_NOT_READY' });
  assert.equal((await fresh.product(created.id)).version, cleared.version);
  assert.deepEqual((await fresh.publishedProduct(created.id)).images, [image]);

  const restoreImage = { ...input, description: 'Saved privately', requestId: randomUUID(), images: [image], expectedVersion: cleared.version };
  const restored = await repository.updateProduct(identity, created.id, restoreImage);
  const republishCommand: ProductCommand = { requestId: randomUUID(), expectedVersion: restored.version };
  const republished = await repository.publishProduct(identity, created.id, republishCommand);
  assert.deepEqual((await fresh.publishedProduct(created.id)).images, [image]);
  assert.equal((await fresh.publishedProduct(created.id)).description, 'Saved privately');
  assert.deepEqual(await repository.publishProduct(identity, created.id, republishCommand), republished);
  assert.deepEqual(await fresh.publishedProduct(created.id), await repository.publishedProduct(created.id));
  console.log('PASS image descriptor persistence, publish projection, private edits, empty-image publication gate, retry, and reload. Emulator only; no GCS.');
} finally {
  await db.terminate();
  await deleteApp(firebase);
}
