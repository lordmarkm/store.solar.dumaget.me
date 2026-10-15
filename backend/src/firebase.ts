import { applicationDefault, deleteApp, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getStorage } from 'firebase-admin/storage';
import { IMAGE_BUCKET } from './product-images.js';
import type { ImageBucket } from './product-images.js';
import { getFirestore } from 'firebase-admin/firestore';
import type { Firestore } from 'firebase-admin/firestore';
import { randomUUID } from 'node:crypto';
import type { ApiConfig } from './config.js';
import type { IdentityVerifier, VerifiedIdentity } from './auth.js';
import { actorDisplayName } from './auth.js';
import { ApiError } from './errors.js';

interface AdminServices {
  verify(token: string): Promise<VerifiedIdentity>;
  firestore(): Firestore;
  imageBucket?(): ImageBucket;
  checkAuth?(): Promise<void>;
  actorNames?(uids: readonly string[]): Promise<ReadonlyMap<string, string>>;
  close(): Promise<void>;
}
export type AdminServicesFactory = (config: ApiConfig) => AdminServices;

const invalidTokenCodes = new Set([
  'auth/argument-error', 'auth/invalid-argument', 'auth/invalid-id-token',
  'auth/id-token-expired', 'auth/id-token-revoked', 'auth/user-disabled', 'auth/user-not-found',
]);

const createAdminServices: AdminServicesFactory = (config) => {
  // ADC is consulted only after explicitly approved activation and a protected request.
  // No credential JSON is bundled, copied, logged or loaded by the default process.
  const app = initializeApp({ projectId: config.projectId, credential: applicationDefault() }, `solar-store-api-${randomUUID()}`);
  let database: Firestore | undefined;
  return {
    async actorNames(uids) {
      const result = await getAuth(app).getUsers(uids.map(uid => ({ uid })));
      const names = new Map<string, string>();
      for (const user of result.users) {
        const name = actorDisplayName(user.displayName, user.uid);
        if (name) names.set(user.uid, name);
      }
      return names;
    },
    async checkAuth() {
      // Fixed reserved lookup, not a user listing, token mint, or account write.
      // A not-found response proves Auth is reachable with read permission.
      try { await getAuth(app).getUser('solar-store-readiness-probe'); }
      catch (error) {
        if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'auth/user-not-found') return;
        throw error;
      }
    },
    async verify(token) {
      try {
        const decoded = await getAuth(app).verifyIdToken(token, true);
        return Object.freeze({
          uid: decoded.uid, email: decoded.email ?? null,
          ...(actorDisplayName(decoded['name'], decoded.uid) ? { displayName: actorDisplayName(decoded['name'], decoded.uid)! } : {}),
          emailVerified: decoded.email_verified === true, storeAdmin: decoded['storeAdmin'] === true,
        });
      } catch (error) {
        const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
        if (invalidTokenCodes.has(code)) throw new ApiError(401, 'UNAUTHENTICATED', 'The ID token is invalid or no longer valid.');
        throw new ApiError(503, 'AUTH_UNAVAILABLE', 'Authentication is temporarily unavailable.');
      }
    },
    firestore: () => database ??= getFirestore(app, config.databaseId),
    imageBucket: () => getStorage(app).bucket(IMAGE_BUCKET),
    async close() {
      try { await database?.terminate(); }
      finally { await deleteApp(app); }
    },
  };
};

export class FirebaseGateway implements IdentityVerifier {
  private services: AdminServices | undefined;
  private readonly actorNameCache = new Map<string, { name: string | undefined; expires: number }>();
  constructor(private readonly config: ApiConfig, private readonly factory: AdminServicesFactory = createAdminServices) {}

  private client(): AdminServices {
    if (!this.config.firebaseEnabled || !this.config.authSetupApproved) {
      throw new ApiError(503, 'BACKEND_DISABLED', 'Firebase backend activation is pending.');
    }
    if (!this.services) {
      try { this.services = this.factory(this.config); }
      catch { throw new ApiError(503, 'BACKEND_UNAVAILABLE', 'Firebase backend is temporarily unavailable.'); }
    }
    return this.services;
  }

  verify(token: string): Promise<VerifiedIdentity> { return this.client().verify(token); }
  /** Exact legacy-history IDs only, max five per page; no account listing. */
  async actorNames(uids: readonly string[]): Promise<ReadonlyMap<string, string>> {
    if (uids.length > 5 || uids.some(uid => !uid || uid.length > 128 || /[\u0000-\u001f\u007f]/.test(uid))) {
      throw new ApiError(400, 'INVALID_ACTOR_LOOKUP', 'Invalid actor references.');
    }
    const service = this.client(), ids = [...new Set(uids)], now = Date.now();
    const names = new Map<string, string>(), missing: string[] = [];
    for (const uid of ids) {
      const cached = this.actorNameCache.get(uid);
      if (!cached || cached.expires <= now) missing.push(uid);
      else if (cached.name) names.set(uid, cached.name);
    }
    if (missing.length && service.actorNames) {
      try {
        const resolved = await service.actorNames(missing);
        for (const uid of missing) {
          const name = actorDisplayName(resolved.get(uid), uid);
          this.actorNameCache.delete(uid);
          this.actorNameCache.set(uid, { name, expires: now + (name ? 300_000 : 60_000) });
          if (name) names.set(uid, name);
        }
        while (this.actorNameCache.size > 200) this.actorNameCache.delete(this.actorNameCache.keys().next().value!);
      } catch { /* Name lookup must not hide an otherwise valid audit ledger. */ }
    }
    return names;
  }
  // Future repositories receive this explicitly named client; no default-database overload.
  firestore(): Firestore { return this.client().firestore(); }
  imageBucket(): ImageBucket {
    const bucket = this.client().imageBucket;
    if (!bucket) throw new ApiError(503, 'IMAGE_STORAGE_UNAVAILABLE', 'Picture storage is unavailable.');
    return bucket();
  }
  async checkReadiness(): Promise<void> {
    const services = this.client();
    if (!services.checkAuth || !services.imageBucket) throw new ApiError(503, 'BACKEND_NOT_READY', 'Connected services are unavailable.');
    // One fixed document read in the explicitly named database; no probe writes.
    // allSettled holds the single-flight gate until every dependency has settled.
    const results = await Promise.allSettled([
      Promise.resolve().then(() => services.firestore().collection('_health').doc('readiness').get()),
      Promise.resolve().then(() => services.checkAuth!()),
      Promise.resolve().then(() => services.imageBucket!().getMetadata()),
    ]);
    if (results.some(result => result.status === 'rejected')) throw new ApiError(503, 'BACKEND_NOT_READY', 'Connected services are unavailable.');
  }
  async close(): Promise<void> {
    const services = this.services;
    this.services = undefined;
    this.actorNameCache.clear();
    await services?.close();
  }
}
