/** Explicit emulator integration only. Never uses a live Firebase project or credentials. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { FirestoreAccountProjectRepository } from '../src/project.repository.js';
import { customerDocumentId } from '../src/customer-profile.js';
import type { VerifiedIdentity } from '../src/auth.js';

if (process.env['FIRESTORE_EMULATOR_HOST'] !== '127.0.0.1:8180') throw new Error('Requires only the fixed loopback Firestore emulator on 8180.');
const appId = 'project-management-integration-' + randomUUID();
const firebase = initializeApp({ projectId: 'demo-store-provisioning' }, appId);
const db = getFirestore(firebase, 'store-dev');
const owner: VerifiedIdentity = { uid: 'project-management-owner-' + randomUUID(), email: 'owner@example.test', emailVerified: true, storeAdmin: false };
const stranger: VerifiedIdentity = { uid: 'project-management-stranger-' + randomUUID(), email: 'stranger@example.test', emailVerified: true, storeAdmin: false };
const pagingOwner: VerifiedIdentity = { uid: 'project-management-pages-' + randomUUID(), email: 'pages@example.test', emailVerified: true, storeAdmin: false };
const tokens: Record<string, VerifiedIdentity> = { owner, stranger, pages: pagingOwner };
const projects = new FirestoreAccountProjectRepository(() => db);
const app = buildApp(loadConfig({ NODE_ENV: 'test', FIREBASE_BACKEND_ENABLED: 'true', FIREBASE_AUTH_SETUP_APPROVED: 'true' }), {
  logger: false, projects,
  verifier: { verify: async token => { if (!tokens[token]) throw new Error('Invalid emulator test identity'); return tokens[token]!; }, close: async () => {} },
});
const auth = (token: string) => ({ authorization: 'Bearer ' + token });
const newRequestId = () => randomUUID();
const projectDetails = (name: string, extras: Record<string, string> = {}) => ({ name, classification: 'residential', installation: 'rooftop', configuration: 'hybrid', workScope: 'new-installation', ...extras });
const createProject = async (token: string, name: string, extras: Record<string, string> = {}) => {
  const response = await app.inject({ method: 'POST', url: '/api/v1/me/projects', headers: auth(token), payload: { requestId: newRequestId(), details: projectDetails(name, extras) } });
  assert.equal(response.statusCode, 201, response.body);
  return response.json().project as { id: string; version: number; name: string };
};
const manage = (token: string, id: string, expectedVersion: number, action: string, requestId = newRequestId(), extra: Record<string, unknown> = {}) =>
  app.inject({ method: 'POST', url: '/api/v1/me/projects/' + id + '/management', headers: auth(token), payload: { requestId, expectedVersion, action, ...extra } });
const pagingProject = (id: string, customerId: string, index: number, at: string) => {
  const isCombinedMatch = [12, 20, 59].includes(index);
  const name = index === 59 ? 'Combined Filter Marker Unique Tail Marker' : isCombinedMatch ? 'Combined Filter Marker' : 'Project ' + String(index).padStart(2, '0');
  return {
    id, schemaVersion: 1, customerId, version: 1, name,
    classification: isCombinedMatch ? 'commercial' : 'residential', installation: 'rooftop',
    configuration: isCombinedMatch ? 'off-grid' : 'hybrid', workScope: isCombinedMatch ? 'retrofit' : 'new-installation',
    status: 'draft', createdAt: at, updatedAt: at, archivedAt: null,
    bom: { id: 'bom-' + id, projectId: id, items: [], updatedAt: at },
  };
};

try {
  const headers = auth('owner');
  const created = await createProject('owner', 'Emulator source', { location: 'North Ridge', description: 'Retained detail', notes: 'Retained notes' });
  const createdAt = new Date().toISOString();
  const productId = randomUUID();
  await db.collection('publishedProducts').doc(productId).create({ id: productId, schemaVersion: 1, version: 1, publishedAt: createdAt,
    sku: 'EMU-MGMT-1', name: 'Emulator unavailable panel', brand: 'Test Solar', category: 'Panels', unitCode: 'panel',
    description: 'Management test catalog fixture', amountMinor: 12000, currency: 'PHP' });
  const productInput = { product: { productId, variantId: null, unitCode: 'panel' }, quantity: 3 };
  const added = await app.inject({ method: 'POST', url: '/api/v1/me/projects/' + created.id + '/commands', headers,
    payload: { requestId: newRequestId(), expectedVersion: 1, action: 'add-items', items: [productInput] } });
  assert.equal(added.statusCode, 200, added.body);
  const withText = await app.inject({ method: 'POST', url: '/api/v1/me/projects/' + created.id + '/commands', headers,
    payload: { requestId: newRequestId(), expectedVersion: 2, action: 'free-text', input: { title: 'Installation labor', description: '', unit: 'job', quantity: 1, notes: '' } } });
  assert.equal(withText.statusCode, 200, withText.body);
  assert.equal(withText.json().project.bom.items.length, 2);
  const sourceStoreLineId = withText.json().project.bom.items[0].id;

  const hiddenFromStranger = await app.inject({ method: 'POST', url: '/api/v1/me/projects/' + created.id + '/management', headers: auth('stranger'),
    payload: { requestId: newRequestId(), expectedVersion: 3, action: 'archive-project' } });
  assert.equal(hiddenFromStranger.statusCode, 404);
  const stale = await manage('owner', created.id, 1, 'edit-details', newRequestId(), { details: projectDetails('Stale rewrite') });
  assert.equal(stale.statusCode, 409);

  const clearable = await createProject('owner', 'Clear optional detail', { location: 'Old location', description: 'Old description', notes: 'Old notes' });
  const clearableBom = await app.inject({ method: 'POST', url: '/api/v1/me/projects/' + clearable.id + '/commands', headers,
    payload: { requestId: newRequestId(), expectedVersion: 1, action: 'free-text', input: { title: 'Keep this BOM line', description: '', unit: 'job', quantity: 1, notes: '' } } });
  assert.equal(clearableBom.statusCode, 200, clearableBom.body);
  const beforeMetadataEdit = await app.inject({ method: 'GET', url: '/api/v1/me/projects/' + clearable.id, headers });
  assert.equal(beforeMetadataEdit.statusCode, 200, beforeMetadataEdit.body);
  const bomItemsBeforeMetadataEdit = beforeMetadataEdit.json().project.bom.items;
  const cleared = await manage('owner', clearable.id, 2, 'edit-details', newRequestId(), { details: projectDetails('Cleared details') });
  assert.equal(cleared.statusCode, 200, cleared.body);
  assert.equal('location' in cleared.json().project, false);
  assert.equal('description' in cleared.json().project, false);
  assert.equal('notes' in cleared.json().project, false);
  assert.equal(cleared.json().project.version, 3);
  assert.deepEqual(cleared.json().project.bom.items, bomItemsBeforeMetadataEdit, 'metadata edits preserve the BOM lines');

  const activeSet = await app.inject({ method: 'PUT', url: '/api/v1/me/project-active', headers,
    payload: { requestId: newRequestId(), expectedVersion: null, activeProjectId: created.id } });
  assert.equal(activeSet.statusCode, 200);
  const otherActive = await createProject('owner', 'New active target');
  const archiveRequestId = newRequestId();
  const archived = await manage('owner', created.id, 3, 'archive-project', archiveRequestId);
  assert.equal(archived.statusCode, 200, archived.body);
  assert.equal(archived.json().project.status, 'archived');
  assert.equal(archived.json().project.archivedAt, archived.json().project.updatedAt);
  assert.equal(archived.json().activeProjectId, null);
  assert.equal(archived.json().preferencesVersion, 2);
  const commandWhileArchived = await app.inject({ method: 'POST', url: '/api/v1/me/projects/' + created.id + '/commands', headers,
    payload: { requestId: newRequestId(), expectedVersion: 3, action: 'free-text', input: { title: 'Rejected', description: '', unit: 'job', quantity: 1, notes: '' } } });
  assert.equal(commandWhileArchived.statusCode, 409);

  const newerActive = await app.inject({ method: 'PUT', url: '/api/v1/me/project-active', headers,
    payload: { requestId: newRequestId(), expectedVersion: 2, activeProjectId: otherActive.id } });
  assert.equal(newerActive.statusCode, 200);
  assert.equal(newerActive.json().preferencesVersion, 3);
  const archiveRetry = await manage('owner', created.id, 3, 'archive-project', archiveRequestId);
  assert.equal(archiveRetry.statusCode, 200, archiveRetry.body);
  assert.equal(archiveRetry.json().activeProjectId, otherActive.id);
  assert.equal(archiveRetry.json().preferencesVersion, 3, 'archive receipt replay must not clear a later active selection');

  await db.collection('publishedProducts').doc(productId).delete();
  const duplicateRequestId = newRequestId();
  const duplicate = await manage('owner', created.id, 4, 'duplicate-project', duplicateRequestId);
  assert.equal(duplicate.statusCode, 200, duplicate.body);
  const copy = duplicate.json().project;
  assert.notEqual(copy.id, created.id);
  assert.equal(copy.name, 'Copy of Emulator source');
  assert.equal(copy.status, 'draft');
  assert.equal(copy.version, 1);
  assert.equal(copy.bom.items.length, 2);
  assert.deepEqual(copy.bom.items.map((item: { kind: string }) => item.kind), ['store-product', 'free-text']);
  assert.equal(copy.bom.items[0].product.productId, productId, 'unavailable product references remain in the copied BOM');
  assert.notEqual(copy.bom.items[0].id, sourceStoreLineId);
  assert.equal(duplicate.json().activeProjectId, otherActive.id, 'duplication does not select the new project');
  const duplicateRetry = await manage('owner', created.id, 4, 'duplicate-project', duplicateRequestId);
  assert.equal(duplicateRetry.statusCode, 200, duplicateRetry.body);
  assert.equal(duplicateRetry.json().project.id, copy.id);
  const changedDuplicateRetry = await manage('owner', created.id, 3, 'duplicate-project', duplicateRequestId);
  assert.equal(changedDuplicateRetry.statusCode, 409);
  const restored = await manage('owner', created.id, 4, 'restore-project');
  assert.equal(restored.statusCode, 200, restored.body);
  assert.equal(restored.json().project.status, 'draft');
  assert.equal(restored.json().project.archivedAt, null);
  assert.equal(restored.json().project.version, 5);
  assert.equal(restored.json().project.bom.items.length, 2);
  const archivedAgain = await manage('owner', created.id, 5, 'archive-project', newRequestId());
  assert.equal(archivedAgain.statusCode, 200, archivedAgain.body);
  assert.equal(archivedAgain.json().project.status, 'archived');
  assert.equal(archivedAgain.json().project.version, 6);
  assert.equal(archivedAgain.json().project.bom.items.length, 2);
  assert.equal(archivedAgain.json().activeProjectId, otherActive.id);
  assert.equal(archivedAgain.json().preferencesVersion, 3);
  const nonActive = await createProject('owner', 'Archive while another project is active');
  const nonActiveArchive = await manage('owner', nonActive.id, 1, 'archive-project');
  assert.equal(nonActiveArchive.statusCode, 200, nonActiveArchive.body);
  assert.equal(nonActiveArchive.json().activeProjectId, otherActive.id);
  assert.equal(nonActiveArchive.json().preferencesVersion, 3, 'archiving a non-active project preserves the active preference version');
  const ownerList = await app.inject({ method: 'GET', url: '/api/v1/me/projects', headers });
  assert.equal(ownerList.statusCode, 200);
  assert.equal(ownerList.json().items.filter((item: { id: string }) => item.id === copy.id).length, 1);

  const pageRoot = db.collection('customers').doc(customerDocumentId(pagingOwner.uid));
  const batch = db.batch();
  const at = new Date().toISOString();
  for (let index = 1; index <= 61; index++) {
    const id = '00000000-0000-4000-8000-' + String(index).padStart(12, '0');
    batch.create(pageRoot.collection('projects').doc(id), pagingProject(id, pagingOwner.uid, index, at));
  }
  await batch.commit();

  const expectedIds = Array.from({ length: 61 }, (_, offset) => '00000000-0000-4000-8000-' + String(offset + 1).padStart(12, '0'));
  const pagedIds: string[] = [];
  let cursor: string | null = null;
  do {
    const query = new URLSearchParams({ limit: '10' });
    if (cursor) query.set('cursor', cursor);
    const page = await app.inject({ method: 'GET', url: '/api/v1/me/projects?' + query.toString(), headers: auth('pages') });
    assert.equal(page.statusCode, 200, page.body);
    const body = page.json();
    assert.ok(body.items.length <= 10);
    pagedIds.push(...body.items.map((item: { id: string }) => item.id));
    cursor = body.nextCursor;
  } while (cursor);
  assert.deepEqual(pagedIds, expectedIds, 'unfiltered 10-item pages include every project once in document-ID order');

  const singleEnum = await app.inject({ method: 'GET', url: '/api/v1/me/projects?status=draft&limit=10', headers: auth('pages') });
  assert.equal(singleEnum.statusCode, 200, singleEnum.body);
  assert.deepEqual(singleEnum.json().items.map((item: { id: string }) => item.id), expectedIds.slice(0, 10));
  assert.equal(singleEnum.json().nextCursor, expectedIds[9], 'single-enum pages continue from the last consumed matching project');

  const combined = new URLSearchParams({ limit: '10', search: 'combined filter marker', status: 'draft', classification: 'commercial', configuration: 'off-grid', workScope: 'retrofit' });
  const combinedFirst = await app.inject({ method: 'GET', url: '/api/v1/me/projects?' + combined.toString(), headers: auth('pages') });
  assert.equal(combinedFirst.statusCode, 200, combinedFirst.body);
  assert.deepEqual(combinedFirst.json().items.map((item: { id: string }) => item.id), [expectedIds[11], expectedIds[19]]);
  assert.equal(combinedFirst.json().nextCursor, expectedIds[49], 'combined filtering scans the bounded primary-enum candidate window');
  combined.set('cursor', combinedFirst.json().nextCursor);
  const combinedNext = await app.inject({ method: 'GET', url: '/api/v1/me/projects?' + combined.toString(), headers: auth('pages') });
  assert.equal(combinedNext.statusCode, 200, combinedNext.body);
  assert.deepEqual(combinedNext.json().items.map((item: { id: string }) => item.id), [expectedIds[58]]);

  const emptyQuery = new URLSearchParams({ limit: '10', search: 'unique tail marker' });
  const emptySegment = await app.inject({ method: 'GET', url: '/api/v1/me/projects?' + emptyQuery.toString(), headers: auth('pages') });
  assert.equal(emptySegment.statusCode, 200, emptySegment.body);
  assert.deepEqual(emptySegment.json().items, []);
  assert.equal(emptySegment.json().nextCursor, expectedIds[49], 'search-only empty segment advances after the 50-candidate budget');
  emptyQuery.set('cursor', emptySegment.json().nextCursor);
  const afterEmpty = await app.inject({ method: 'GET', url: '/api/v1/me/projects?' + emptyQuery.toString(), headers: auth('pages') });
  assert.equal(afterEmpty.statusCode, 200, afterEmpty.body);
  assert.deepEqual(afterEmpty.json().items.map((item: { id: string }) => item.id), [expectedIds[58]]);
  console.log('PASS project management emulator: owner isolation, stale writes, detail clearing, archive/restore state rules, receipt retries, duplicate BOM preservation, enum paging, and bounded filtered continuation');
} finally {
  await app.close();
  await db.terminate();
  await deleteApp(firebase);
}
