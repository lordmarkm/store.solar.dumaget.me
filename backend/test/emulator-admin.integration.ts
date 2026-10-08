/** Explicitly invoked emulator integration; never part of live server startup. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { FirestoreAdminCatalogRepository } from '../src/admin-catalog.repository.js';
import type { SupplierInput, ProductInput } from '../src/admin-catalog.js';

if (process.env['FIRESTORE_EMULATOR_HOST'] !== '127.0.0.1:8180') {
  throw new Error('This test requires only the fixed loopback Firestore emulator on 8180.');
}
const firebase = initializeApp({ projectId: 'demo-store-provisioning' }, `admin-integration-${randomUUID()}`);
const db = getFirestore(firebase, 'store-dev');
const identity = { uid: 'integration-admin', email: 'admin@solar.dumaget.me', emailVerified: true, storeAdmin: true };
const repository = new FirestoreAdminCatalogRepository(() => db);
// Isolated injected verifier, not a runtime authentication mode or live token.
const app = buildApp(loadConfig({ NODE_ENV: 'test', FIREBASE_BACKEND_ENABLED: 'true', FIREBASE_AUTH_SETUP_APPROVED: 'true' }), {
  logger: false, catalog: repository,
  verifier: { verify: async token => token === 'admin' ? identity : { ...identity, storeAdmin: false }, close: async () => {} },
});
const headers = { authorization: 'Bearer admin' };
const supplierInput = (name: string): SupplierInput => ({ requestId: randomUUID(), name, region: '', description: '', website: '', email: '', phone: '' });
try {
  const supplier = supplierInput(`Integration supplier ${randomUUID()}`);
  const created = await app.inject({ method: 'POST', url: '/api/v1/admin/suppliers', headers, payload: supplier });
  assert.equal(created.statusCode, 201);
  const record = created.json().supplier;
  assert.equal(record.createdBy, identity.uid);
  assert.equal(record.status, 'active');
  const replay = await app.inject({ method: 'POST', url: '/api/v1/admin/suppliers', headers, payload: supplier });
  assert.equal(replay.statusCode, 201);
  assert.deepEqual(replay.json(), created.json());
  const changed = await app.inject({ method: 'POST', url: '/api/v1/admin/suppliers', headers, payload: { ...supplier, name: 'Changed payload' } });
  assert.equal(changed.statusCode, 409);
  const duplicate = await app.inject({ method: 'POST', url: '/api/v1/admin/suppliers', headers, payload: supplierInput(supplier.name.toUpperCase()) });
  assert.equal(duplicate.statusCode, 409);
  console.log('PASS supplier persistence, replay, changed-request conflict and normalized-name uniqueness');

  const product: ProductInput = { requestId: randomUUID(), sku: `QA-${randomUUID()}`, name: 'Private integration draft',
    brand: '', category: null, unitCode: null, description: '', amountMinor: 0, supplierId: record.id };
  const productResponse = await app.inject({ method: 'POST', url: '/api/v1/admin/products', headers, payload: product });
  assert.equal(productResponse.statusCode, 201);
  assert.equal(productResponse.json().product.state, 'draft');
  assert.equal(productResponse.json().product.amountMinor, 0);
  const savedProductId = productResponse.json().product.id;
  const productReplay = await app.inject({ method: 'POST', url: '/api/v1/admin/products', headers, payload: product });
  assert.equal(productReplay.json().product.id, savedProductId);
  const competing = await Promise.all([1, 2].map(() => app.inject({ method: 'POST', url: '/api/v1/admin/products', headers,
    payload: { ...product, requestId: randomUUID(), sku: 'RACE-SKU' } })));
  assert.deepEqual(competing.map(response => response.statusCode).sort(), [201, 409]);
  const missing = await app.inject({ method: 'POST', url: '/api/v1/admin/products', headers,
    payload: { ...product, requestId: randomUUID(), sku: 'MISSING-SUPPLIER', supplierId: randomUUID() } });
  assert.equal(missing.statusCode, 400);
  assert.equal((await db.collection('products').where('sku', '==', 'MISSING-SUPPLIER').get()).empty, true);
  assert.equal((await db.collection('adminCatalogAudit').doc(`product-${savedProductId}`).get()).data()?.['actorUid'], identity.uid);
  console.log('PASS product persistence, idempotent replay, concurrent SKU uniqueness, supplier integrity and atomic audit');

  for (const path of ['/api/v1/admin/suppliers', '/api/v1/admin/products']) {
    assert.equal((await app.inject({ method: 'GET', url: path })).statusCode, 401);
    assert.equal((await app.inject({ method: 'GET', url: path, headers: { authorization: 'Bearer customer' } })).statusCode, 403);
  }
  const freshRepository = new FirestoreAdminCatalogRepository(() => db);
  assert.equal((await freshRepository.products(null)).items.some(item => item.id === savedProductId), true);
  const batch = db.batch();
  for (let index = 0; index < 52; index++) {
    const id = randomUUID();
    batch.create(db.collection('suppliers').doc(id), { ...record, id, name: `Pagination fixture ${index}` });
  }
  await batch.commit();
  const first = await freshRepository.suppliers(null);
  assert.equal(first.items.length, 50);
  assert.ok(first.nextCursor);
  const second = await freshRepository.suppliers(first.nextCursor);
  assert.equal(second.items.length, 3);
  assert.equal(second.nextCursor, null);
  assert.equal(new Set([...first.items, ...second.items].map(item => item.id)).size, 53);
  console.log('PASS unauthorized private reads, fresh-repository persistence and bounded non-overlapping cursor pages');
  console.log('Admin Firestore emulator integration passed; no live project/credentials used.');
} finally {
  await app.close();
  await db.terminate();
  await deleteApp(firebase);
}
