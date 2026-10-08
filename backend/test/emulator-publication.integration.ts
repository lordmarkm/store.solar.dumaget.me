/** Explicitly invoked emulator integration; never part of live server startup. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { FirestoreAdminCatalogRepository } from '../src/admin-catalog.repository.js';
import type { ProductInput, ProductCommand } from '../src/admin-catalog.js';
import { imageDescriptor } from '../src/product-images.js';

if (process.env['FIRESTORE_EMULATOR_HOST'] !== '127.0.0.1:8180') throw new Error('Requires the fixed loopback Firestore emulator on 8180.');
const firebase = initializeApp({ projectId: 'demo-store-provisioning' }, `publication-integration-${randomUUID()}`);
const db = getFirestore(firebase, 'store-dev');
const identity = { uid: 'publication-integration-admin', email: 'admin@solar.dumaget.me', emailVerified: true, storeAdmin: true };
const repository = new FirestoreAdminCatalogRepository(() => db);
const app = buildApp(loadConfig({ NODE_ENV: 'test', FIREBASE_BACKEND_ENABLED: 'true', FIREBASE_AUTH_SETUP_APPROVED: 'true' }), {
  logger: false, catalog: repository,
  images: {
    async upload() { throw new Error('publication fixture does not upload through a live image store'); },
    async validate() {},
  },
  verifier: { verify: async token => token === 'admin' ? identity : { ...identity, storeAdmin: false }, close: async () => {} },
});
const headers = { authorization: 'Bearer admin' };
const supplierId = randomUUID();
const input: ProductInput = { requestId: randomUUID(), sku: `PUB-${randomUUID()}`, name: 'Lifecycle fixture', brand: '', category: null,
  unitCode: null, description: '', amountMinor: 0, supplierId, images: [imageDescriptor('e'.repeat(64), 120, 80)] };
const command = (expectedVersion: number): ProductCommand => ({ requestId: randomUUID(), expectedVersion });
const request = async (method: 'PUT' | 'POST', url: string, payload: unknown): Promise<Awaited<ReturnType<typeof app.inject>>> =>
  app.inject({ method, url, headers: { ...headers, 'content-type': 'application/json' }, payload: JSON.stringify(payload) });

try {
  const now = new Date().toISOString();
  await db.collection('suppliers').doc(supplierId).create({ id: supplierId, schemaVersion: 1, version: 1, createdBy: identity.uid,
    createdAt: now, updatedAt: now, status: 'active', name: `Publication supplier ${randomUUID()}`, region: '', description: '', website: '', email: '', phone: '' });
  const product = await repository.createProduct(identity, input);
  const id = product.id;
  const draft = await repository.createProduct(identity, { ...input, requestId: randomUUID(), sku: `DRAFT-${randomUUID()}` });
  const missingId = randomUUID();
  const audits = () => db.collection('adminCatalogAudit').where('entityId', '==', id).get();
  assert.equal(product.state, 'draft');
  assert.equal((await repository.publishedProducts(null)).items.some(item => item.id === id), false);
  await assert.rejects(() => repository.publishedProduct(id));

  const auditCount = (await audits()).size;
  const invalid = await request('POST', `/api/v1/admin/products/${id}/publish`, command(1));
  assert.equal(invalid.statusCode, 422);
  assert.equal(invalid.json().error.code, 'PRODUCT_NOT_READY');
  assert.equal((await audits()).size, auditCount);
  assert.equal((await db.collection('adminProductRequests').get()).docs.filter(doc => doc.data()['entityId'] === id && doc.data()['actorUid'] === identity.uid).length, 0);
  assert.equal((await repository.product(id)).version, 1);
  assert.equal((await db.collection('publishedProducts').doc(id).get()).exists, false);

  const complete: ProductInput = { ...input, requestId: randomUUID(), brand: 'Sun Co', category: 'Panels', unitCode: 'panel', description: 'Public description', amountMinor: 0 };
  const updated = await request('PUT', `/api/v1/admin/products/${id}`, { ...complete, expectedVersion: 1 });
  assert.equal(updated.statusCode, 200);
  assert.equal(updated.json().product.version, 2);
  const publishCommand = command(2);
  const published = await request('POST', `/api/v1/admin/products/${id}/publish`, publishCommand);
  assert.equal(published.statusCode, 200);
  assert.equal(published.json().product.version, 3);
  assert.equal(published.json().product.publishedVersion, 3);
  const projection = await repository.publishedProduct(id);
  assert.equal(projection.amountMinor, 0);
  assert.equal(projection.description, 'Public description');
  assert.equal('supplierId' in projection, false);
  assert.equal('createdBy' in projection, false);
  const publishReceipts = (await db.collection('adminProductRequests').get()).docs.filter(doc =>
    doc.data()['entityId'] === id && doc.data()['actorUid'] === identity.uid && doc.data()['version'] === 3);
  assert.equal(publishReceipts.length, 1);
  const publishAudits = (await audits()).docs.filter(doc => doc.data()['action'] === 'product.published');
  assert.equal(publishAudits.length, 1);
  assert.deepEqual((await app.inject({ method: 'GET', url: `/api/v1/catalog/products/${id}` })).json().product, projection);
  assert.equal((await app.inject({ method: 'GET', url: '/api/v1/catalog/products' })).json().items.some((item: { id: string }) => item.id === id), true);
  const batchReferences = await app.inject({ method: 'POST', url: '/api/v1/catalog/references',
    headers: { 'content-type': 'application/json' }, payload: { ids: [id, draft.id, missingId] } });
  assert.equal(batchReferences.statusCode, 200);
  assert.deepEqual(batchReferences.json().items.map((item: { id: string }) => item.id), [id]);
  assert.equal('supplierId' in batchReferences.json().items[0], false);
  assert.equal('createdBy' in batchReferences.json().items[0], false);

  const replay = await request('POST', `/api/v1/admin/products/${id}/publish`, publishCommand);
  assert.equal(replay.statusCode, 200);
  assert.deepEqual(replay.json(), published.json());
  assert.equal((await audits()).docs.filter(doc => doc.data()['action'] === 'product.published').length, 1);
  const reused = await request('POST', `/api/v1/admin/products/${id}/publish`, { ...publishCommand, expectedVersion: 3 });
  assert.equal(reused.statusCode, 409);
  assert.equal(reused.json().error.code, 'IDEMPOTENCY_CONFLICT');
  const stale = await request('PUT', `/api/v1/admin/products/${id}`, { ...complete, requestId: randomUUID(), expectedVersion: 2 });
  assert.equal(stale.statusCode, 409);
  assert.equal(stale.json().error.code, 'PRODUCT_CHANGED');
  assert.equal((await repository.product(id)).version, 3);

  const privateEdit = { ...complete, requestId: randomUUID(), description: 'Saved privately', amountMinor: 150000 };
  const edit = await request('PUT', `/api/v1/admin/products/${id}`, { ...privateEdit, expectedVersion: 3 });
  assert.equal(edit.statusCode, 200);
  assert.equal(edit.json().product.version, 4);
  assert.equal((await repository.publishedProduct(id)).description, 'Public description');
  assert.equal((await repository.publishedProduct(id)).amountMinor, 0);
  const republish = await request('POST', `/api/v1/admin/products/${id}/publish`, command(4));
  assert.equal(republish.statusCode, 200);
  assert.equal(republish.json().product.version, 5);
  assert.equal((await repository.publishedProduct(id)).description, 'Saved privately');
  assert.equal((await repository.publishedProduct(id)).amountMinor, 150000);

  const skuChange = await request('PUT', `/api/v1/admin/products/${id}`, { ...privateEdit, sku: 'CHANGED-SKU', requestId: randomUUID(), expectedVersion: 5 });
  assert.equal(skuChange.statusCode, 400);
  assert.equal(skuChange.json().error.code, 'SKU_IMMUTABLE');
  assert.equal((await repository.product(id)).version, 5);
  const unpublishCommand = command(5);
  const unpublished = await request('POST', `/api/v1/admin/products/${id}/unpublish`, unpublishCommand);
  assert.equal(unpublished.statusCode, 200);
  assert.equal(unpublished.json().product.state, 'draft');
  assert.equal(unpublished.json().product.version, 6);
  assert.equal('publishedVersion' in unpublished.json().product, false);
  assert.equal((await db.collection('publishedProducts').doc(id).get()).exists, false);
  assert.equal((await repository.product(id)).description, 'Saved privately');
  assert.equal((await repository.publishedProducts(null)).items.some(item => item.id === id), false);
  const unpublishReplay = await request('POST', `/api/v1/admin/products/${id}/unpublish`, unpublishCommand);
  assert.equal(unpublishReplay.statusCode, 200);
  assert.deepEqual(unpublishReplay.json(), unpublished.json());
  assert.equal((await audits()).docs.filter(doc => doc.data()['action'] === 'product.unpublished').length, 1);
  const stalePublish = await request('POST', `/api/v1/admin/products/${id}/publish`, command(5));
  assert.equal(stalePublish.statusCode, 409);
  assert.equal((await repository.product(id)).state, 'draft');
  assert.equal((await repository.product(id)).version, 6);
  assert.equal((await db.collection('publishedProducts').doc(id).get()).exists, false);
  const afterUnpublishReferences = await app.inject({ method: 'POST', url: '/api/v1/catalog/references',
    headers: { 'content-type': 'application/json' }, payload: { ids: [id, draft.id, missingId] } });
  assert.equal(afterUnpublishReferences.statusCode, 200);
  assert.deepEqual(afterUnpublishReferences.json().items, []);

  const competingUpdate = { ...privateEdit, requestId: randomUUID(), description: 'Concurrent update winner' };
  const [raceUpdate, racePublish] = await Promise.all([
    request('PUT', `/api/v1/admin/products/${id}`, { ...competingUpdate, expectedVersion: 6 }),
    request('POST', `/api/v1/admin/products/${id}/publish`, command(6)),
  ]);
  assert.deepEqual([raceUpdate.statusCode, racePublish.statusCode].sort(), [200, 409]);
  const winner = await repository.product(id);
  const winnerProjection = await db.collection('publishedProducts').doc(id).get();
  assert.equal(winner.version, 7);
  if (winner.state === 'published') {
    assert.equal(winner.publishedVersion, 7);
    assert.equal(winnerProjection.exists, true);
    assert.equal(winnerProjection.data()?.['version'], winner.version);
    assert.equal(winnerProjection.data()?.['description'], winner.description);
  } else {
    assert.equal(winnerProjection.exists, false);
    assert.equal(winner.description, 'Concurrent update winner');
  }
  const beforeStaleRetry = winnerProjection.data();
  const staleRacePublish = await request('POST', `/api/v1/admin/products/${id}/publish`, command(6));
  assert.equal(staleRacePublish.statusCode, 409);
  assert.equal((await repository.product(id)).version, 7);
  assert.deepEqual((await db.collection('publishedProducts').doc(id).get()).data(), beforeStaleRetry);

  for (const route of [
    { method: 'GET' as const, url: `/api/v1/admin/products/${id}` },
    { method: 'PUT' as const, url: `/api/v1/admin/products/${id}`, payload: { ...complete, expectedVersion: 1 } },
    { method: 'POST' as const, url: `/api/v1/admin/products/${id}/publish`, payload: command(1) },
    { method: 'POST' as const, url: `/api/v1/admin/products/${id}/unpublish`, payload: command(1) },
  ]) {
    assert.equal((await app.inject(route)).statusCode, 401);
    assert.equal((await app.inject({ ...route, headers: { authorization: 'Bearer customer' } })).statusCode, 403);
  }
  const finalPublicRead = await app.inject({ method: 'GET', url: `/api/v1/catalog/products/${id}` });
  if (winner.state === 'published') {
    assert.equal(finalPublicRead.statusCode, 200);
    assert.equal(finalPublicRead.json().product.version, winner.version);
    assert.equal(finalPublicRead.json().product.description, winner.description);
  } else {
    assert.equal(finalPublicRead.statusCode, 404);
  }
  console.log('PASS product publication lifecycle, atomic failures, projection privacy, retries/conflicts, stale versions, and route authorization');
  console.log('No cloud project or credentials used; this integration requires FIRESTORE_EMULATOR_HOST=127.0.0.1:8180.');
} finally {
  await app.close();
  await db.terminate();
  await deleteApp(firebase);
}
