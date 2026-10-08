import type { Firestore } from 'firebase-admin/firestore';
import type { VerifiedIdentity } from './auth.js';
import { ApiError } from './errors.js';
import { customerDocumentId, nextProfileRecord, parseProfileInput, parseProfileRecord } from './customer-profile.js';
import type { ProfileInput, ProfileRecord, ProfileRepository } from './customer-profile.js';

/** API-only access: no browser Firestore SDK, collection scans, or realtime listeners. */
export class FirestoreProfileRepository implements ProfileRepository {
  constructor(private readonly database: () => Firestore, private readonly now = () => new Date()) {}

  async get(identity: VerifiedIdentity): Promise<ProfileRecord | null> {
    const id = customerDocumentId(identity.uid);
    try {
      const document = await this.database().collection('customers').doc(id).get();
      return document.exists ? parseProfileRecord(document.data(), identity.uid) : null;
    } catch (error) { throw this.sanitize(error); }
  }

  async save(identity: VerifiedIdentity, input: ProfileInput): Promise<ProfileRecord> {
    const id = customerDocumentId(identity.uid);
    const validated = parseProfileInput(input);
    // Validate identity/email before initializing credentials or opening a transaction.
    nextProfileRecord(identity, { ...validated, expectedVersion: null }, null, this.now().toISOString());
    try {
      const database = this.database();
      const reference = database.collection('customers').doc(id);
      return await database.runTransaction(async transaction => {
        const document = await transaction.get(reference);
        const previous = document.exists ? parseProfileRecord(document.data(), identity.uid) : null;
        const record = nextProfileRecord(identity, validated, previous, this.now().toISOString());
        // This document stores only profile data. Never merge client roles/claims/preferences.
        transaction.set(reference, record);
        return record;
      }, { maxAttempts: 3 });
    } catch (error) { throw this.sanitize(error); }
  }

  private sanitize(error: unknown): ApiError {
    return error instanceof ApiError ? error : new ApiError(503, 'PROFILE_UNAVAILABLE', 'Profile storage is temporarily unavailable.');
  }
}
