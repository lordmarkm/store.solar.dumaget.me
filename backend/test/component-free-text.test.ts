import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Firestore } from 'firebase-admin/firestore';
import type { VerifiedIdentity } from '../src/auth.js';
import { parseBomItem, parseCreateProject, parseProjectCommand } from '../src/customer-projects.js';
import type { FreeTextCommand } from '../src/customer-projects.js';
import { FirestoreAccountProjectRepository } from '../src/project.repository.js';

const categories = ['Inverters', 'Panels', 'Batteries', 'Mounting', 'Circuit breakers', 'Surge Protection Device', 'ATS', 'PV Isolator', 'MCCB'] as const;
const requestId = '22222222-2222-4222-8222-222222222222';
const identity: VerifiedIdentity = { uid: 'component-test-customer', email: 'component@example.test', emailVerified: true, storeAdmin: false };
const at = '2026-10-10T00:00:00.000Z';
const details = { name: 'Roof', classification: 'residential', installation: 'rooftop', configuration: 'hybrid', workScope: 'new-installation' };
const freeTextInput = { title: 'Solar panel', description: '', unit: 'piece', quantity: 2, notes: '' };

function item(category?: string): Record<string, unknown> {
  return { id: 'text-44444444-4444-4444-8444-444444444444', kind: 'free-text', title: 'Solar panel', description: '', unit: 'piece', quantity: 2,
    createdAt: at, updatedAt: at, estimate: { kind: 'unpriced' }, ...(category !== undefined ? { componentCategory: category } : {}) };
}
function freeTextCommand(input: Record<string, unknown>, itemId?: string, id = requestId, expectedVersion = 1): FreeTextCommand {
  return parseProjectCommand({ requestId: id, expectedVersion, action: 'free-text', ...(itemId ? { itemId } : {}), input }) as FreeTextCommand;
}
function throwsInvalid(run: () => unknown) {
  assert.throws(run, error => typeof error === 'object' && error !== null && 'code' in error && error.code === 'INVALID_PROJECT_INPUT');
}

test('free-text parsing allows current categories and keeps undefined categories absent', () => {
  for (const componentCategory of categories) {
    const metadata = componentCategory === 'ATS' ? { componentProtectionType: 'ATS', amperage: 63 } : {};
    assert.equal((parseBomItem({ ...item(componentCategory), ...metadata }) as { componentCategory?: string }).componentCategory, componentCategory);
    assert.equal((freeTextCommand({ ...freeTextInput, componentCategory, ...metadata }).input as { componentCategory?: string }).componentCategory, componentCategory);
  }
  assert.equal(Object.hasOwn(parseBomItem(item()), 'componentCategory'), false);
  assert.equal(Object.hasOwn((freeTextCommand(freeTextInput).input), 'componentCategory'), false);
  assert.equal(Object.hasOwn(parseBomItem({ ...item(), componentCategory: undefined }), 'componentCategory'), false);
  assert.equal(Object.hasOwn(freeTextCommand({ ...freeTextInput, componentCategory: undefined }).input, 'componentCategory'), false);
  for (const invalid of [null, 'other', 1, {}]) {
    throwsInvalid(() => parseBomItem({ ...item(), componentCategory: invalid }));
    throwsInvalid(() => freeTextCommand({ ...freeTextInput, componentCategory: invalid }));
  }
  throwsInvalid(() => freeTextCommand({ ...freeTextInput, componentCategory: 'Protection' }));
  throwsInvalid(() => parseBomItem({ ...item(), unexpected: true }));
  throwsInvalid(() => freeTextCommand({ ...freeTextInput, unexpected: true }));
});

test('ATS metadata requires its explicit category and finite positive safe amperage', () => {
  const valid = { componentCategory: 'ATS', componentProtectionType: 'ATS', amperage: 63.5 };
  assert.deepEqual(freeTextCommand({ ...freeTextInput, ...valid }).input, { ...freeTextInput, ...valid });
  assert.equal((parseBomItem({ ...item('ATS'), componentProtectionType: 'ATS', amperage: Number.MAX_SAFE_INTEGER }) as { amperage?: number }).amperage, Number.MAX_SAFE_INTEGER);
  for (const metadata of [
    { componentProtectionType: 'ATS', amperage: 40 },
    { componentCategory: 'Panels', componentProtectionType: 'ATS', amperage: 40 },
    { componentCategory: 'Circuit breakers', componentProtectionType: 'MCB', amperage: 40 },
    { componentCategory: 'ATS' },
    { componentCategory: 'ATS', amperage: 40 },
    { componentCategory: 'ATS', componentProtectionType: 'ATS', amperage: 0 },
    { componentCategory: 'ATS', componentProtectionType: 'ATS', amperage: -1 },
    { componentCategory: 'ATS', componentProtectionType: 'ATS', amperage: Infinity },
    { componentCategory: 'ATS', componentProtectionType: 'ATS', amperage: Number.MAX_SAFE_INTEGER + 1 },
  ]) {
    throwsInvalid(() => freeTextCommand({ ...freeTextInput, ...metadata }));
    throwsInvalid(() => parseBomItem({ ...item(), ...metadata }));
  }
  // Untyped legacy Protection is readable as Other without guessing a subtype.
  assert.equal((parseBomItem(item('Protection')) as { componentCategory?: string }).componentCategory, 'Other');
  assert.equal((parseBomItem({ ...item('Protection'), componentProtectionType: 'ATS', amperage: 63 }) as { componentCategory?: string }).componentCategory, 'ATS');
});

test('repository saves and reloads PV Isolator and MCCB free-text categories', async () => {
  const memory = new MemoryFirestore();
  const repository = new FirestoreAccountProjectRepository(() => memory as unknown as Firestore, () => new Date(at));
  const created = await repository.create(identity, parseCreateProject({ requestId, details }));
  for (const [index, category] of ['PV Isolator', 'MCCB'].entries()) {
    const result = await repository.command(identity, created.project.id,
      freeTextCommand({ ...freeTextInput, componentCategory: category }, undefined,
        index === 0 ? '33333333-3333-4333-8333-333333333333' : '44444444-4444-4444-8444-444444444444', index + 1));
    assert.equal(result.project.bom.items.at(-1)?.kind, 'free-text');
    assert.equal((result.project.bom.items.at(-1) as { componentCategory?: string }).componentCategory, category);
    const reloaded = await repository.get(identity, created.project.id);
    assert.equal((reloaded.bom.items.at(-1) as { componentCategory?: string }).componentCategory, category);
  }
});

test('store-product parsing rejects componentCategory and preserves strict legacy fields', () => {
  const storeItem = { id: 'product-44444444-4444-4444-8444-444444444444', kind: 'store-product', quantity: 1, createdAt: at, updatedAt: at,
    product: { productId: '55555555-5555-4555-8555-555555555555', variantId: null, unitCode: 'piece' } };
  assert.equal(parseBomItem(storeItem).kind, 'store-product');
  throwsInvalid(() => parseBomItem({ ...storeItem, componentCategory: 'Panels' }));
  throwsInvalid(() => parseBomItem({ ...storeItem, componentCategory: undefined }));
});

class MemoryFirestore {
  readonly records = new Map<string, unknown>();
  collection(name: string) { return new MemoryCollection(this, name); }
  async runTransaction<T>(work: (transaction: MemoryTransaction) => Promise<T>): Promise<T> {
    return work(new MemoryTransaction(this));
  }
}
class MemoryCollection {
  constructor(private readonly db: MemoryFirestore, private readonly path: string) {}
  doc(id: string) { return new MemoryReference(this.db, `${this.path}/${id}`, id); }
}
class MemoryReference {
  constructor(private readonly db: MemoryFirestore, readonly path: string, readonly id: string) {}
  collection(name: string) { return new MemoryCollection(this.db, `${this.path}/${name}`); }
  async get() { return new MemorySnapshot(this.db.records.has(this.path), this.db.records.get(this.path)); }
}
class MemorySnapshot {
  constructor(readonly exists: boolean, private readonly value: unknown) {}
  data() { return this.value; }
}
class MemoryTransaction {
  constructor(private readonly db: MemoryFirestore) {}
  async get(reference: MemoryReference) { return reference.get(); }
  async getAll(...references: MemoryReference[]) { return Promise.all(references.map(reference => reference.get())); }
  set(reference: MemoryReference, value: unknown) { this.db.records.set(reference.path, value); return this; }
  create(reference: MemoryReference, value: unknown) {
    if (this.db.records.has(reference.path)) throw new Error('already exists');
    this.db.records.set(reference.path, value); return this;
  }
  delete(reference: MemoryReference) { this.db.records.delete(reference.path); return this; }
}

test('repository persists, retries, duplicates, edits, removes and restores component categories and ATS metadata', async () => {
  const memory = new MemoryFirestore(); let timestamp = Date.parse(at);
  const repository = new FirestoreAccountProjectRepository(() => memory as unknown as Firestore, () => new Date(timestamp++));
  const created = await repository.create(identity, parseCreateProject({ requestId, details }));
  const createdItem = await repository.command(identity, created.project.id,
    freeTextCommand({ ...freeTextInput, componentCategory: 'Panels' }, undefined, '33333333-3333-4333-8333-333333333333'));
  const component = createdItem.project.bom.items[0]!;
  assert.equal(component.kind, 'free-text');
  if (component.kind !== 'free-text') assert.fail('expected free-text item');
  assert.equal(component.componentCategory, 'Panels');

  const editRequest = '66666666-6666-4666-8666-666666666666';
  const legacyEdit = freeTextCommand({ ...freeTextInput, title: 'Updated panel' }, component.id, editRequest, 2);
  const edited = await repository.command(identity, created.project.id, legacyEdit);
  assert.equal(edited.project.bom.items[0]?.kind, 'free-text');
  assert.equal((edited.project.bom.items[0] as { componentCategory?: string }).componentCategory, 'Panels');
  const retried = await repository.command(identity, created.project.id, legacyEdit);
  assert.deepEqual(retried.project, edited.project);
  const explicitlyChanged = await repository.command(identity, created.project.id,
    freeTextCommand({ ...freeTextInput, componentCategory: 'Batteries' }, component.id, '77777777-7777-4777-8777-777777777777', 3));
  assert.equal((explicitlyChanged.project.bom.items[0] as { componentCategory?: string }).componentCategory, 'Batteries');

  const duplicate = await repository.manage(identity, created.project.id,
    { requestId: '88888888-8888-4888-8888-888888888888', expectedVersion: explicitlyChanged.project.version, action: 'duplicate-project' });
  assert.equal((duplicate.project.bom.items[0] as { componentCategory?: string }).componentCategory, 'Batteries');
  const duplicatedItemId = duplicate.project.bom.items[0]!.id;
  const removed = await repository.command(identity, duplicate.project.id,
    parseProjectCommand({ requestId: '99999999-9999-4999-8999-999999999999', expectedVersion: 1, action: 'remove', itemId: duplicatedItemId }));
  assert.equal(removed.project.bom.items.length, 0);
  const restored = await repository.command(identity, duplicate.project.id,
    parseProjectCommand({ requestId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', expectedVersion: 2, action: 'restore', itemId: duplicatedItemId, index: 0 }));
  assert.equal((restored.project.bom.items[0] as { componentCategory?: string }).componentCategory, 'Batteries');

  const ats = await repository.command(identity, created.project.id,
    freeTextCommand({ ...freeTextInput, componentCategory: 'ATS', componentProtectionType: 'ATS', amperage: 63.5 }, undefined, 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 4));
  assert.equal((ats.project.bom.items[1] as { amperage?: number }).amperage, 63.5);
  const atsItem = ats.project.bom.items[1]!;
  await assert.rejects(() => repository.command(identity, created.project.id,
    freeTextCommand({ ...freeTextInput, componentCategory: 'Panels' }, atsItem.id, 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 5)),
    (error: unknown) => typeof error === 'object' && error !== null && 'code' in error && error.code === 'INVALID_PROJECT_INPUT');
  const atsEdit = await repository.command(identity, created.project.id,
    freeTextCommand({ ...freeTextInput, title: 'Updated ATS' }, atsItem.id, 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 5));
  assert.equal((atsEdit.project.bom.items[1] as { componentProtectionType?: string }).componentProtectionType, 'ATS');
  assert.equal((atsEdit.project.bom.items[1] as { amperage?: number }).amperage, 63.5);

  const noExtra = await repository.create(identity, parseCreateProject({ requestId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', details }));
  assert.equal(noExtra.project.bom.items.length, 0);
  assert.equal(created.project.bom.items.length, 0);
});
