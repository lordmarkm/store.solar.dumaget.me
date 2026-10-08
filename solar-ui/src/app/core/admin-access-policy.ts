/** Planned authoritative policy is server-controlled, never customer-editable browser state. */
export interface AdminAccessPolicy {
  readonly adminEmailDomains: readonly string[];
}

export interface AdminEmailIdentity {
  readonly email: string | null;
  readonly emailVerified: boolean;
}

/** Frontend baseline only; changing this does not grant backend privileges. */
export const DEFAULT_ADMIN_ACCESS_POLICY: AdminAccessPolicy = Object.freeze({
  adminEmailDomains: Object.freeze(['solar.dumaget.me']),
});

function normalizedDomain(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 253) return null;
  const domain = value.toLowerCase();
  const labels = domain.split('.');
  return labels.length >= 2 && labels.every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)) ? domain : null;
}

/** Eligibility helper, NOT authentication or authorization. Requires an explicit valid policy.
 * Feed provider-owned identity only; the server must verify tokens and enforce this independently.
 */
export function matchesAdminEmailPolicy(identity: AdminEmailIdentity | null | undefined, policy: AdminAccessPolicy | null | undefined): boolean {
  if (!identity || identity.emailVerified !== true || typeof identity.email !== 'string' || identity.email.length > 254) return false;
  if (!policy || !Array.isArray(policy.adminEmailDomains) || !policy.adminEmailDomains.length) return false;
  const domains = Array.from(policy.adminEmailDomains, normalizedDomain);
  // An invalid configuration fails closed in its entirety, without silently falling back.
  if (domains.some(domain => domain === null)) return false;
  const parts = identity.email.split('@');
  if (parts.length !== 2) return false;
  const [local, rawDomain] = parts;
  if (!local || local.length > 64 || /[\s\x00-\x1f\x7f<>\\:/]/.test(local) || local.startsWith('.') || local.endsWith('.') || local.includes('..')) return false;
  const domain = normalizedDomain(rawDomain);
  return domain !== null && domains.includes(domain);
}
