import type { ApiConfig } from './config.js';
import { ApiError } from './errors.js';

export interface VerifiedIdentity {
  readonly uid: string;
  readonly displayName?: string;
  readonly email: string | null;
  readonly emailVerified: boolean;
  readonly storeAdmin: boolean;
}

export interface IdentityVerifier {
  verify(token: string): Promise<VerifiedIdentity>;
  close(): Promise<void>;
}

/** Presentation only; never use a name for authorization or actor identity. */
export function actorDisplayName(value: unknown, uid: string): string | undefined {
  if (typeof value !== 'string' || value.length > 160 || /[\u0000-\u001f\u007f\ud800-\udfff]/u.test(value)) return undefined;
  const name = value.trim();
  return name && name !== uid ? name : undefined;
}

export function bearerToken(header: string | undefined): string {
  const match = header?.match(/^Bearer ([^\s,]+)$/i);
  if (!match?.[1] || match[1].length > 8192) {
    throw new ApiError(401, 'UNAUTHENTICATED', 'A valid bearer ID token is required.');
  }
  return match[1];
}

export function isAdminEligible(identity: VerifiedIdentity, domains: readonly string[]): boolean {
  if (!identity.emailVerified || !identity.email || domains.length === 0) return false;
  const parts = identity.email.split('@');
  const domain = parts[1];
  return parts.length === 2 && Boolean(parts[0]) && Boolean(domain)
    && !/\s/.test(identity.email) && domains.includes(domain!.toLowerCase());
}

export function isAdminAuthorized(identity: VerifiedIdentity, config: ApiConfig): boolean {
  // A trusted store-specific claim AND eligible verified email are required.
  // Browser helper results and a matching domain alone cannot grant a role.
  return identity.storeAdmin === true && isAdminEligible(identity, config.adminEmailDomains);
}

export function requireAdmin(identity: VerifiedIdentity, config: ApiConfig): void {
  if (!isAdminAuthorized(identity, config)) throw new ApiError(403, 'FORBIDDEN', 'Administrator access is required.');
}
