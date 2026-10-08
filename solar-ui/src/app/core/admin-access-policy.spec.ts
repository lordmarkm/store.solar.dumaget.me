import { describe, expect, it } from 'vitest';
import { AdminAccessPolicy, DEFAULT_ADMIN_ACCESS_POLICY, matchesAdminEmailPolicy } from './admin-access-policy';

describe('configurable admin email eligibility, not authorization', () => {
  const matches = (email: string | null, verified = true, policy: AdminAccessPolicy | null | undefined = DEFAULT_ADMIN_ACCESS_POLICY) => matchesAdminEmailPolicy({ email, emailVerified: verified }, policy);

  it('defaults to the exact solar.dumaget.me domain, case-insensitively', () => {
    expect(DEFAULT_ADMIN_ACCESS_POLICY.adminEmailDomains).toEqual(['solar.dumaget.me']);
    expect(matches('admin@solar.dumaget.me')).toBe(true);
    expect(matches('Operations+Store@SOLAR.DUMAGET.ME')).toBe(true);
    expect(Object.isFrozen(DEFAULT_ADMIN_ACCESS_POLICY.adminEmailDomains)).toBe(true);
  });

  it('does not implicitly include suffix lookalikes, parent domains, or subdomains', () => {
    for (const email of ['admin@not-solar.dumaget.me', 'admin@solar.dumaget.me.evil.test', 'admin@dumaget.me', 'admin@store.solar.dumaget.me', 'admin@gmail.com']) expect(matches(email)).toBe(false);
  });

  it('requires verification and identity regardless of the matching domain', () => {
    expect(matches('admin@solar.dumaget.me', false)).toBe(false);
    expect(matches(null)).toBe(false);
    expect(matchesAdminEmailPolicy(null, DEFAULT_ADMIN_ACCESS_POLICY)).toBe(false);
    expect(matchesAdminEmailPolicy(undefined, DEFAULT_ADMIN_ACCESS_POLICY)).toBe(false);
    expect(matchesAdminEmailPolicy({ email: 'admin@solar.dumaget.me', emailVerified: 'true' } as unknown as Parameters<typeof matchesAdminEmailPolicy>[0], DEFAULT_ADMIN_ACCESS_POLICY)).toBe(false);
  });

  it('allows explicitly configured replacement/additional domains and removes old eligibility', () => {
    const policy = { adminEmailDomains: ['ADMIN.EXAMPLE.TEST', 'another.example.test'] };
    expect(matches('user@admin.example.test', true, policy)).toBe(true);
    expect(matches('user@another.example.test', true, policy)).toBe(true);
    expect(matches('user@solar.dumaget.me', true, policy)).toBe(false);
    expect(matches('user@child.admin.example.test', true, policy)).toBe(false);
  });

  it('fails closed for missing, empty, malformed or wildcard configuration without default fallback', () => {
    expect(matchesAdminEmailPolicy({ email: 'admin@solar.dumaget.me', emailVerified: true }, undefined)).toBe(false);
    expect(matches('admin@solar.dumaget.me', true, null)).toBe(false);
    for (const domain of ['', '*', '*.solar.dumaget.me', '@solar.dumaget.me', 'solar.dumaget.me.', ' solar.dumaget.me', 'https://solar.dumaget.me', '-solar.dumaget.me', 'solar..dumaget.me', `${'a'.repeat(64)}.test`]) {
      expect(matches('admin@solar.dumaget.me', true, { adminEmailDomains: ['solar.dumaget.me', domain] })).toBe(false);
    }
    expect(matches('admin@solar.dumaget.me', true, { adminEmailDomains: [] })).toBe(false);
    expect(matches('admin@solar.dumaget.me', true, { adminEmailDomains: 'solar.dumaget.me' } as unknown as AdminAccessPolicy)).toBe(false);
  });

  it('rejects malformed emails instead of interpreting suffix text as identity', () => {
    for (const email of ['', '@solar.dumaget.me', 'a@@solar.dumaget.me', ' admin@solar.dumaget.me', 'a\n@solar.dumaget.me', 'admin@solar.dumaget.me ', 'admin@solar.dumaget.me.', 'https://admin@solar.dumaget.me', '<admin>@solar.dumaget.me', '.admin@solar.dumaget.me', 'admin..ops@solar.dumaget.me', `${'a'.repeat(65)}@solar.dumaget.me`]) expect(matches(email)).toBe(false);
  });
});
