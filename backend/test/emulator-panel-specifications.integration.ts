/** Explicit local emulator verification; never performs live project writes. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { FirestoreAdminCatalogRepository } from '../src/admin-catalog.repository.js';
import type { ProductInput } from '../src/admin-catalog.js';
import { imageDescriptor } from '../src/product-images.js';

if (process.env['FIRESTORE_EMULATOR_HOST'] !== '127.0.0.1:8180') throw new Error('Requires fixed loopback Firestore emulator on 8180.');
const firebase = initializeApp({ projectId: 'demo-store-provisioning' }, `panel-specs-${randomUUID()}`);
const db = getFirestore(firebase, 'store-dev');
const identity = { uid: 'panel-test-admin', email: 'test@solar.dumaget.me', emailVerified: true, storeAdmin: true };
const repository = new FirestoreAdminCatalogRepository(() => db);
try {
  const supplier = await repository.createSupplier(identity, { requestId: randomUUID(), name: `Panel test ${randomUUID()}`, region: '', description: '', website: '', email: '', phone: '' });
  const input: ProductInput = { requestId: randomUUID(), sku: `PANEL-${randomUUID()}`, name: 'Emulator panel', brand: 'Test', category: 'Panels', unitCode: 'panel', description: 'Test only', amountMinor: 100, supplierId: supplier.id,
    images: [imageDescriptor('c'.repeat(64), 120, 80)], panelSpecifications: { eanCode: '0123456789012', ratedMaximumPower: '620 Wp', warranty: '15 years\n30 years / 85%' } };
  const created = await repository.createProduct(identity, input);
  const fresh = new FirestoreAdminCatalogRepository(() => db);
  assert.deepEqual((await fresh.product(created.id)).panelSpecifications, input.panelSpecifications);
  assert.deepEqual(await fresh.createProduct(identity, input), created);
  const published = await repository.publishProduct(identity, created.id, { requestId: randomUUID(), expectedVersion: created.version });
  assert.deepEqual((await fresh.publishedProduct(created.id)).panelSpecifications, input.panelSpecifications);
  const changedSpecs = { ...input.panelSpecifications, ratedMaximumPower: '630 Wp' };
  const update = { ...input, requestId: randomUUID(), panelSpecifications: changedSpecs, expectedVersion: published.version };
  const edited = await repository.updateProduct(identity, created.id, update);
  assert.deepEqual((await fresh.product(created.id)).panelSpecifications, changedSpecs);
  assert.deepEqual((await fresh.publishedProduct(created.id)).panelSpecifications, input.panelSpecifications);
  assert.deepEqual(await repository.updateProduct(identity, created.id, update), edited);
  await assert.rejects(repository.updateProduct(identity, created.id, { ...update, panelSpecifications: { ...changedSpecs, ratedMaximumPower: '640 Wp' } }), { code: 'IDEMPOTENCY_CONFLICT' });
  const republished = await repository.publishProduct(identity, created.id, { requestId: randomUUID(), expectedVersion: edited.version });
  assert.deepEqual((await fresh.publishedProduct(created.id)).panelSpecifications, changedSpecs);
  const cleared = await repository.updateProduct(identity, created.id, { ...input, requestId: randomUUID(), category: 'Inverters', unitCode: 'unit', panelSpecifications: null, expectedVersion: republished.version });
  assert.equal((await fresh.product(created.id)).panelSpecifications, null);
  assert.deepEqual((await fresh.publishedProduct(created.id)).panelSpecifications, changedSpecs);
  await repository.publishProduct(identity, created.id, { requestId: randomUUID(), expectedVersion: cleared.version });
  assert.equal((await fresh.publishedProduct(created.id)).panelSpecifications, null);
  console.log('PASS panel specification persistence, reload, replay/conflict, private edits, republish and category clear. Emulator only.');
} finally {
  await db.terminate(); await deleteApp(firebase);
}
