import type { VerifiedIdentity } from './auth.js';
import { ApiError } from './errors.js';

/** API/storage values are plain JSON; ownership and email come only from Auth. */
export interface CustomerProfile {
  readonly customerId: string;
  readonly displayName: string;
  readonly email: string;
  readonly phone?: string;
  readonly companyName?: string;
  readonly contractorDetails?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}
export interface ProfileRecord {
  readonly schemaVersion: 1;
  readonly version: number;
  readonly profile: CustomerProfile;
}
export interface ProfileInput {
  readonly expectedVersion: number | null;
  readonly displayName: string;
  readonly phone?: string;
  readonly companyName?: string;
  readonly contractorDetails?: string;
}
export interface ProfileRepository {
  get(identity: VerifiedIdentity): Promise<ProfileRecord | null>;
  save(identity: VerifiedIdentity, input: ProfileInput): Promise<ProfileRecord>;
}

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function only(value: Record<string, unknown>, fields: readonly string[]): boolean {
  return Object.keys(value).every(key => fields.includes(key));
}
function text(value: unknown, max: number, multiline = false): value is string {
  return typeof value === 'string' && value.length <= max
    && !(multiline ? /[\u0000-\u0009\u000b\u000c\u000e-\u001f\u007f]/ : /[\u0000-\u001f\u007f]/).test(value);
}
function timestamp(value: unknown): value is string {
  if (typeof value !== 'string' || value.length !== 24) return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString() === value;
}
function version(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 1 && value < Number.MAX_SAFE_INTEGER;
}

/** Full editable-field replacement with an explicit optimistic-concurrency token. */
export function parseProfileInput(value: unknown): ProfileInput {
  const invalid = () => { throw new ApiError(400, 'INVALID_PROFILE', 'Enter a valid profile and expected version.'); };
  if (!object(value) || !only(value, ['expectedVersion', 'displayName', 'phone', 'companyName', 'contractorDetails'])) return invalid();
  if (value['expectedVersion'] !== null && !version(value['expectedVersion'])) return invalid();
  if (!text(value['displayName'], 100) || !value['displayName'].trim()) return invalid();
  const optional: { phone?: string; companyName?: string; contractorDetails?: string } = {};
  for (const [key, max] of [['phone', 80], ['companyName', 120], ['contractorDetails', 2000]] as const) {
    const field = value[key];
    if (field === undefined || field === null) continue;
    if (!text(field, max, key === 'contractorDetails')) return invalid();
    if (field.trim()) optional[key] = field.trim();
  }
  return { expectedVersion: value['expectedVersion'] as number | null, displayName: value['displayName'].trim(), ...optional };
}

/** Encode even slash/dot-containing valid Auth UIDs as a single document segment. */
export function customerDocumentId(uid: string): string {
  if (typeof uid !== 'string' || !uid || uid.length > 128 || /[\u0000-\u001f\u007f]/.test(uid)
    || Buffer.from(uid, 'utf8').toString('utf8') !== uid) {
    throw new ApiError(401, 'UNAUTHENTICATED', 'A valid account identity is required.');
  }
  return Buffer.from(uid, 'utf8').toString('base64url');
}

/** Fail closed on foreign, malformed, future-schema, or over-permissive documents. */
export function parseProfileRecord(value: unknown, uid: string): ProfileRecord {
  const invalid = () => { throw new ApiError(503, 'PROFILE_DATA_INVALID', 'Stored profile data needs review.'); };
  if (!object(value) || !only(value, ['schemaVersion', 'version', 'profile']) || value['schemaVersion'] !== 1 || !version(value['version'])) return invalid();
  const profile = value['profile'];
  if (!object(profile) || !only(profile, ['customerId', 'displayName', 'email', 'phone', 'companyName', 'contractorDetails', 'createdAt', 'updatedAt'])
    || profile['customerId'] !== uid || !text(profile['displayName'], 100) || !profile['displayName'].trim()
    || !text(profile['email'], 320) || !/^[^\s@]+@[^\s@]+$/.test(profile['email'])
    || !timestamp(profile['createdAt']) || !timestamp(profile['updatedAt']) || profile['createdAt'] > profile['updatedAt']) return invalid();
  for (const [key, max] of [['phone', 80], ['companyName', 120], ['contractorDetails', 2000]] as const) {
    if (profile[key] !== undefined && !text(profile[key], max, key === 'contractorDetails')) return invalid();
  }
  return value as unknown as ProfileRecord;
}

export function nextProfileRecord(identity: VerifiedIdentity, input: ProfileInput, previous: ProfileRecord | null, now: string): ProfileRecord {
  if (!identity.emailVerified || !text(identity.email, 320) || !/^[^\s@]+@[^\s@]+$/.test(identity.email)) {
    throw new ApiError(403, 'VERIFIED_EMAIL_REQUIRED', 'A verified account email is required to save your profile.');
  }
  if (input.expectedVersion !== (previous?.version ?? null)) {
    throw new ApiError(409, 'PROFILE_CONFLICT', 'Your profile changed. Reload it before saving.');
  }
  if (!timestamp(now)) throw new ApiError(503, 'PROFILE_UNAVAILABLE', 'Profile saving is temporarily unavailable.');
  const { expectedVersion: _expectedVersion, ...fields } = input;
  const record = {
    schemaVersion: 1 as const, version: (previous?.version ?? 0) + 1,
    profile: { ...fields, customerId: identity.uid, email: identity.email, createdAt: previous?.profile.createdAt ?? now, updatedAt: now },
  };
  return parseProfileRecord(record, identity.uid);
}
