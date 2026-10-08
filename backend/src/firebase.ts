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
import { ApiError } from './errors.js';

interface AdminServices {
  verify(token: string): Promise<VerifiedIdentity>;
  firestore(): Firestore;
  imageBucket?(): ImageBucket;
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
    async verify(token) {
      try {
        const decoded = await getAuth(app).verifyIdToken(token, true);
        return Object.freeze({
          uid: decoded.uid, email: decoded.email ?? null,
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
  // Future repositories receive this explicitly named client; no default-database overload.
  firestore(): Firestore { return this.client().firestore(); }
  imageBucket(): ImageBucket {
    const bucket = this.client().imageBucket;
    if (!bucket) throw new ApiError(503, 'IMAGE_STORAGE_UNAVAILABLE', 'Picture storage is unavailable.');
    return bucket();
  }
  async close(): Promise<void> {
    const services = this.services;
    this.services = undefined;
    await services?.close();
  }
}
