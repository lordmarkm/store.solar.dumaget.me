import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Firestore } from 'firebase-admin/firestore';
import type { VerifiedIdentity } from '../src/auth.js';
import { ApiError } from '../src/errors.js';
import { customerDocumentId, nextProfileRecord, parseProfileInput, parseProfileRecord } from '../src/customer-profile.js';
import { FirestoreProfileRepository } from '../src/profile.repository.js';

const now = '2026-10-07T05:00:00.000Z';
const identity: VerifiedIdentity = { uid: 'user/one', email: 'one@example.test', emailVerified: true, storeAdmin: false };
const input = { expectedVersion: null, displayName: ' Customer ', phone: null, companyName: ' Company ' };
const errorCode = (code: string) => (error: unknown) => error instanceof ApiError && error.code === code;

test('profile input accepts only editable fields and an explicit concurrency token', () => {
  assert.deepEqual(parseProfileInput(input), { expectedVersion: null, displayName: 'Customer', companyName: 'Company' });
  for (const body of [null, [], {}, { ...input, role: 'admin' }, { ...input, customerId: 'other' },
    { ...input, email: 'attacker@example.test' }, { ...input, createdAt: now }, { ...input, expectedVersion: 0 },
    { ...input, expectedVersion: 1.5 }, { ...input, displayName: ' ' }, { ...input, displayName: 'x'.repeat(101) },
    { ...input, phone: 123 }, { ...input, contractorDetails: 'x'.repeat(2001) }, { ...input, displayName: 'bad\u0000' }]) {
    assert.throws(() => parseProfileInput(body), errorCode('INVALID_PROFILE'));
  }
  assert.equal(parseProfileInput({ ...input, contractorDetails: 'Two\nlines' }).contractorDetails, 'Two\nlines');
});

test('record creation/updates take ownership, email and timestamps from trusted server values', () => {
  const first = nextProfileRecord(identity, parseProfileInput(input), null, now);
  assert.equal(first.profile.customerId, identity.uid);
  assert.equal(first.profile.email, identity.email);
  assert.equal(first.version, 1);
  const updated = nextProfileRecord(identity, parseProfileInput({ expectedVersion: 1, displayName: 'New' }), first, '2026-10-07T05:01:00.000Z');
  assert.equal(updated.profile.createdAt, now);
  assert.equal(updated.version, 2);
  assert.equal(updated.profile.phone, undefined);
  assert.equal(updated.profile.companyName, undefined);
  assert.throws(() => nextProfileRecord(identity, parseProfileInput(input), first, now), errorCode('PROFILE_CONFLICT'));
  assert.throws(() => nextProfileRecord({ ...identity, emailVerified: false }, parseProfileInput(input), null, now), errorCode('VERIFIED_EMAIL_REQUIRED'));
});

test('foreign ownership, corrupt/future schemas, timestamps and unexpected privilege fields fail closed', () => {
  const record = nextProfileRecord(identity, parseProfileInput(input), null, now);
  for (const value of [{ ...record, schemaVersion: 2 }, { ...record, role: 'admin' }, { ...record, version: 0 },
    { ...record, profile: { ...record.profile, customerId: 'other' } },
    { ...record, profile: { ...record.profile, createdAt: 'not-a-date' } },
    { ...record, profile: { ...record.profile, updatedAt: '2026-10-06T00:00:00.000Z' } },
    { ...record, profile: { ...record.profile, storeAdmin: true } }]) {
    assert.throws(() => parseProfileRecord(value, identity.uid), errorCode('PROFILE_DATA_INVALID'));
  }
});

test('UID encoding always selects one safe document segment without path traversal or collisions', () => {
  const values = ['a/b', '..', '日本語', 'user', 'a%2Fb'];
  const ids = values.map(customerDocumentId);
  assert.equal(new Set(ids).size, values.length);
  for (const id of ids) assert.match(id, /^[A-Za-z0-9_-]+$/);
  assert.throws(() => customerDocumentId(''), errorCode('UNAUTHENTICATED'));
  assert.throws(() => customerDocumentId('x'.repeat(129)), errorCode('UNAUTHENTICATED'));
  assert.throws(() => customerDocumentId('\ud800'), errorCode('UNAUTHENTICATED'));
});

function fakeDatabase() {
  const documents = new Map<string, unknown>();
  const reads: string[] = [];
  let transactions = 0;
  let failure = false;
  const snapshot = (id: string) => {
    if (failure) throw new Error('secret-sdk-detail');
    reads.push(id);
    return { exists: documents.has(id), data: () => structuredClone(documents.get(id)) };
  };
  const database = {
    collection(name: string) {
      assert.equal(name, 'customers');
      return { doc(id: string) { return { id, get: async () => snapshot(id) }; } };
    },
    async runTransaction<T>(callback: (transaction: unknown) => Promise<T>, options: { maxAttempts: number }) {
      transactions++;
      assert.equal(options.maxAttempts, 3);
      const pending = new Map<string, unknown>();
      const result = await callback({
        get: async (reference: { id: string }) => snapshot(reference.id),
        set: (reference: { id: string }, value: unknown) => pending.set(reference.id, structuredClone(value)),
      });
      for (const [id, value] of pending) documents.set(id, value);
      return result;
    },
  } as unknown as Firestore;
  return { database, documents, reads, fail: () => { failure = true; }, transactions: () => transactions };
}

test('Firestore adapter performs one self-document read and transactional versioned writes, isolated by UID', async () => {
  const fake = fakeDatabase();
  const repository = new FirestoreProfileRepository(() => fake.database, () => new Date(now));
  assert.equal(await repository.get(identity), null);
  assert.equal(fake.documents.size, 0); // Reads/sign-in do not create a profile.
  const first = await repository.save(identity, parseProfileInput(input));
  assert.equal(first.version, 1);
  assert.deepEqual(await repository.get(identity), first);
  const other = { ...identity, uid: 'other', email: 'other@example.test' };
  assert.equal(await repository.get(other), null);
  await assert.rejects(repository.save(identity, parseProfileInput(input)), errorCode('PROFILE_CONFLICT'));
  assert.deepEqual(fake.documents.get(customerDocumentId(identity.uid)), first);
  const second = await repository.save(identity, parseProfileInput({ expectedVersion: 1, displayName: 'Updated' }));
  assert.equal(second.version, 2);
  assert.equal(fake.documents.size, 1);
  assert.ok(fake.reads.every(id => !id.includes('/')));
  assert.equal(fake.transactions(), 3);
});

test('Firestore adapter rejects invalid writes before opening storage and sanitizes SDK failures', async () => {
  let clients = 0;
  const fake = fakeDatabase();
  const repository = new FirestoreProfileRepository(() => { clients++; return fake.database; }, () => new Date(now));
  await assert.rejects(repository.save({ ...identity, emailVerified: false }, parseProfileInput(input)), errorCode('VERIFIED_EMAIL_REQUIRED'));
  assert.equal(clients, 0);
  fake.fail();
  for (const promise of [repository.get(identity), repository.save(identity, parseProfileInput(input))]) {
    await assert.rejects(promise, (error: unknown) => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.code, 'PROFILE_UNAVAILABLE');
      assert.doesNotMatch(error.message, /secret/);
      return true;
    });
  }
});
