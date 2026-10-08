/** Explicitly invoked emulator integration; never part of live server startup. */
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
const appId = 'customer-project-integration-' + randomUUID();
const firebase = initializeApp({ projectId: 'demo-store-provisioning' }, appId);
const db = getFirestore(firebase, 'store-dev');
const first: VerifiedIdentity = { uid: 'project-customer-one', email: 'one@example.test', emailVerified: true, storeAdmin: false };
const second: VerifiedIdentity = { uid: 'project-customer-two', email: 'two@example.test', emailVerified: true, storeAdmin: false };
const identities: Record<string, VerifiedIdentity> = { first: first, second: second };
const projects = new FirestoreAccountProjectRepository(() => db);
const app = buildApp(loadConfig({ NODE_ENV: 'test', FIREBASE_BACKEND_ENABLED: 'true', FIREBASE_AUTH_SETUP_APPROVED: 'true' }), {
  logger: false, projects,
  verifier: { verify: async token => { if (!identities[token]) throw new Error('Invalid test identity'); return identities[token]!; }, close: async () => {} },
});
const auth = (token: string) => ({ authorization: 'Bearer ' + token });
const id1 = randomUUID(); const id2 = randomUUID();
const at = new Date().toISOString();
const catalog = (id: string, sku: string) => ({ id, schemaVersion: 1, version: 1, publishedAt: at, sku, name: 'Panel ' + sku,
  brand: 'Test Solar', category: 'Panels', unitCode: 'panel', description: 'Emulator catalog fixture', amountMinor: 10000, currency: 'PHP' });
const projectDetails = { name: 'Emulator roof', classification: 'residential', installation: 'rooftop', configuration: 'hybrid', workScope: 'new-installation' };
const item1 = { product: { productId: id1, variantId: null, unitCode: 'panel' }, quantity: 900 };
const item2 = { product: { productId: id2, variantId: null, unitCode: 'panel' }, quantity: 2 };
const commandId = () => randomUUID();

try {
  await db.collection('publishedProducts').doc(id1).create(catalog(id1, 'EMU-ONE'));
  await db.collection('publishedProducts').doc(id2).create(catalog(id2, 'EMU-TWO'));
  const rootA = db.collection('customers').doc(customerDocumentId(first.uid));
  assert.equal((await rootA.get()).exists, false);
  const profileBefore = await app.inject({ method: 'GET', url: '/api/v1/me/profile', headers: auth('first') });
  assert.equal(profileBefore.statusCode, 200);
  assert.deepEqual(profileBefore.json(), { profile: null, version: null });

  const requestId = randomUUID(); const guestRowId = 'guest-row-' + randomUUID();
  const guestFingerprint = JSON.stringify({ id: 'guest-list-emulator', state: 'unlinked', items: [{ id: guestRowId, kind: 'store-product', ...item1 }] });
  const createPayload = { requestId, details: projectDetails, items: [item1], guest: { listId: 'guest-list-emulator', fingerprint: guestFingerprint, itemIds: [guestRowId] } };
  const created = await app.inject({ method: 'POST', url: '/api/v1/me/projects', headers: auth('first'), payload: createPayload });
  assert.equal(created.statusCode, 201);
  const project = created.json().project;
  assert.equal(project.customerId, first.uid);
  assert.equal(project.version, 1);
  assert.equal(project.bom.items.length, 1);
  assert.equal(project.bom.items[0].id, created.json().copyReceipt.itemMappings[0].destinationBomItemId);
  assert.equal(created.json().copyReceipt.itemMappings[0].guestItemId, guestRowId);
  assert.equal((await rootA.get()).exists, false, 'project persistence must not create or rewrite the profile document');

  const createReplay = await app.inject({ method: 'POST', url: '/api/v1/me/projects', headers: auth('first'), payload: createPayload });
  assert.equal(createReplay.statusCode, 201);
  assert.deepEqual(createReplay.json(), created.json());
  const guestCopyRef = rootA.collection('guestCopies').doc((await import('../src/customer-projects.js')).sha256('guest-list-emulator'));
  assert.equal((await guestCopyRef.get()).exists, true);
  const copiedElsewhere = await app.inject({ method: 'POST', url: '/api/v1/me/projects', headers: auth('first'),
    payload: { ...createPayload, requestId: randomUUID(), details: { ...projectDetails, name: 'Second destination' } } });
  assert.equal(copiedElsewhere.statusCode, 409);
  assert.equal((await rootA.collection('projects').get()).size, 1);

  const crossOwner = await app.inject({ method: 'GET', url: '/api/v1/me/projects/' + project.id, headers: auth('second') });
  assert.equal(crossOwner.statusCode, 404);
  assert.deepEqual((await app.inject({ method: 'GET', url: '/api/v1/me/projects', headers: auth('first') })).json().items.map((p: { id: string }) => p.id), [project.id]);
  assert.equal((await app.inject({ method: 'GET', url: '/api/v1/me/projects?cursor=' + randomUUID(), headers: auth('first') })).statusCode, 200);

  const addId = commandId();
  const guestAddId = 'guest-row-' + randomUUID();
  const guestAddFingerprint = JSON.stringify({ id: 'guest-list-add', state: 'unlinked', items: [{ id: guestAddId, kind: 'store-product', ...item2 }] });
  const addPayload = { requestId: addId, expectedVersion: 1, action: 'add-items', items: [item2],
    guest: { listId: 'guest-list-add', fingerprint: guestAddFingerprint, itemIds: [guestAddId] } };
  const added = await app.inject({ method: 'POST', url: '/api/v1/me/projects/' + project.id + '/commands', headers: auth('first'), payload: addPayload });
  assert.equal(added.statusCode, 200);
  assert.equal(added.json().project.version, 2);
  const addedItem = added.json().project.bom.items[1];
  assert.match(addedItem.id, /^product-[a-f0-9-]{36}$/);
  const quantityChanged = await app.inject({ method: 'POST', url: '/api/v1/me/projects/' + project.id + '/commands', headers: auth('first'),
    payload: { requestId: commandId(), expectedVersion: 2, action: 'quantity', itemId: addedItem.id, quantity: Number.MAX_SAFE_INTEGER } });
  assert.equal(quantityChanged.statusCode, 200);
  const replayCurrent = await app.inject({ method: 'POST', url: '/api/v1/me/projects/' + project.id + '/commands', headers: auth('first'),
    payload: { ...addPayload, expectedVersion: 3 } });
  assert.equal(replayCurrent.statusCode, 200);
  assert.equal(replayCurrent.json().project.version, 3);
  assert.equal(replayCurrent.json().project.bom.items.length, 2);
  assert.deepEqual(replayCurrent.json().copyReceipt, added.json().copyReceipt);
  const changedAddItem = { ...item2, quantity: 3 };
  const changedGuestFingerprint = JSON.stringify({ id: 'guest-list-add', state: 'unlinked', items: [{ id: guestAddId, kind: 'store-product', ...changedAddItem }] });
  const reusedRequest = await app.inject({ method: 'POST', url: '/api/v1/me/projects/' + project.id + '/commands', headers: auth('first'),
    payload: { ...addPayload, expectedVersion: 3, items: [changedAddItem], guest: { ...addPayload.guest, fingerprint: changedGuestFingerprint } } });
  assert.equal(reusedRequest.statusCode, 409);

  const freeText = await app.inject({ method: 'POST', url: '/api/v1/me/projects/' + project.id + '/commands', headers: auth('first'),
    payload: { requestId: commandId(), expectedVersion: 3, action: 'free-text', input: { title: 'Labor', description: '', unit: 'job', quantity: 1, notes: '' } } });
  assert.equal(freeText.statusCode, 200);
  const textItem = freeText.json().project.bom.items.find((line: { kind: string }) => line.kind === 'free-text');
  assert.equal(textItem.estimate.kind, 'unpriced');
  assert.equal('amountMinor' in textItem, false);
  const pricedText = await app.inject({ method: 'POST', url: '/api/v1/me/projects/' + project.id + '/commands', headers: auth('first'),
    payload: { requestId: commandId(), expectedVersion: 4, action: 'free-text', input: { title: 'Labor', description: '', unit: 'job', quantity: 1, notes: '', amountMinor: 1 } } });
  assert.equal(pricedText.statusCode, 400);

  const removeId = addedItem.id;
  const removed = await app.inject({ method: 'POST', url: '/api/v1/me/projects/' + project.id + '/commands', headers: auth('first'),
    payload: { requestId: commandId(), expectedVersion: 4, action: 'remove', itemId: removeId } });
  assert.equal(removed.statusCode, 200);
  assert.equal(removed.json().project.version, 5);
  const tombstoneRef = rootA.collection('projects').doc(project.id).collection('removedItems').doc(removeId);
  const tombstone = await tombstoneRef.get();
  assert.equal(tombstone.exists, true);
  assert.equal(tombstone.data()?.['customerId'], first.uid);
  const injectedUndo = await app.inject({ method: 'POST', url: '/api/v1/me/projects/' + project.id + '/commands', headers: auth('first'),
    payload: { requestId: commandId(), expectedVersion: 5, action: 'restore', itemId: removeId, index: 0, item: { amountMinor: 1 } } });
  assert.equal(injectedUndo.statusCode, 400);
  const restored = await app.inject({ method: 'POST', url: '/api/v1/me/projects/' + project.id + '/commands', headers: auth('first'),
    payload: { requestId: commandId(), expectedVersion: 5, action: 'restore', itemId: removeId, index: 0 } });
  assert.equal(restored.statusCode, 200);
  const restoredRow = restored.json().project.bom.items[0];
  assert.equal(restoredRow.id, removeId);
  assert.equal(restoredRow.quantity, Number.MAX_SAFE_INTEGER);
  assert.equal(restoredRow.createdAt, addedItem.createdAt);
  assert.equal(restoredRow.updatedAt, restored.json().project.updatedAt);
  assert.equal('amountMinor' in restoredRow, false);
  assert.equal((await tombstoneRef.get()).exists, false);
  const restoredAgain = await app.inject({ method: 'POST', url: '/api/v1/me/projects/' + project.id + '/commands', headers: auth('first'),
    payload: { requestId: commandId(), expectedVersion: 6, action: 'restore', itemId: removeId, index: 0 } });
  assert.equal(restoredAgain.statusCode, 404);

  const removedAgain = await app.inject({ method: 'POST', url: '/api/v1/me/projects/' + project.id + '/commands', headers: auth('first'),
    payload: { requestId: commandId(), expectedVersion: 6, action: 'remove', itemId: removeId } });
  assert.equal(removedAgain.statusCode, 200);
  await db.collection('publishedProducts').doc(id2).delete();
  const unavailableRestore = await app.inject({ method: 'POST', url: '/api/v1/me/projects/' + project.id + '/commands', headers: auth('first'),
    payload: { requestId: commandId(), expectedVersion: 7, action: 'restore', itemId: removeId, index: 0 } });
  assert.equal(unavailableRestore.statusCode, 400);
  assert.equal((await tombstoneRef.get()).exists, true);
  await db.collection('publishedProducts').doc(id2).create(catalog(id2, 'EMU-TWO'));
  const availableRestore = await app.inject({ method: 'POST', url: '/api/v1/me/projects/' + project.id + '/commands', headers: auth('first'),
    payload: { requestId: commandId(), expectedVersion: 7, action: 'restore', itemId: removeId, index: 0 } });
  assert.equal(availableRestore.statusCode, 200);
  assert.equal(availableRestore.json().project.version, 8);

  const activePayload = { requestId: commandId(), expectedVersion: null, activeProjectId: project.id };
  const active = await app.inject({ method: 'PUT', url: '/api/v1/me/project-active', headers: auth('first'), payload: activePayload });
  assert.equal(active.statusCode, 200);
  assert.deepEqual(active.json(), { activeProjectId: project.id, preferencesVersion: 1 });
  const cleared = await app.inject({ method: 'PUT', url: '/api/v1/me/project-active', headers: auth('first'),
    payload: { requestId: commandId(), expectedVersion: 1, activeProjectId: null } });
  assert.equal(cleared.statusCode, 200);
  const preferenceReplay = await app.inject({ method: 'PUT', url: '/api/v1/me/project-active', headers: auth('first'), payload: activePayload });
  assert.equal(preferenceReplay.statusCode, 200);
  assert.deepEqual(preferenceReplay.json(), { activeProjectId: null, preferencesVersion: 2 });
  const staleActive = await app.inject({ method: 'PUT', url: '/api/v1/me/project-active', headers: auth('first'),
    payload: { requestId: commandId(), expectedVersion: null, activeProjectId: project.id } });
  assert.equal(staleActive.statusCode, 409);
  const strangerActive = await app.inject({ method: 'PUT', url: '/api/v1/me/project-active', headers: auth('second'),
    payload: { requestId: commandId(), expectedVersion: null, activeProjectId: project.id } });
  assert.equal(strangerActive.statusCode, 404);
  const finalList = await app.inject({ method: 'GET', url: '/api/v1/me/projects', headers: auth('first') });
  assert.equal(finalList.json().activeProjectId, null);
  assert.equal(finalList.json().preferencesVersion, 2);
  const profileAfter = await app.inject({ method: 'GET', url: '/api/v1/me/profile', headers: auth('first') });
  assert.deepEqual(profileAfter.json(), { profile: null, version: null });
  console.log('PASS account project emulator: owner isolation, published catalog validation, receipts, guest-copy dedupe, BOM commands, tombstone restore, preferences, and profile separation');
} finally {
  await app.close();
  await db.terminate();
  await deleteApp(firebase);
}
