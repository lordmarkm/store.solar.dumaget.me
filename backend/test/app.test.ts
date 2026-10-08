import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import type { IdentityVerifier, VerifiedIdentity } from '../src/auth.js';
import { ApiError } from '../src/errors.js';

const disabledConfig = loadConfig({ NODE_ENV: 'test' });
const enabledConfig = loadConfig({
  NODE_ENV: 'test',
  FIREBASE_BACKEND_ENABLED: 'true',
  FIREBASE_AUTH_SETUP_APPROVED: 'true',
});

function fakeVerifier(
  verify: (token: string) => Promise<VerifiedIdentity>,
): IdentityVerifier & { calls: string[]; closeCalls: number } {
  const calls: string[] = [];
  let closeCalls = 0;
  return {
    calls,
    get closeCalls() { return closeCalls; },
    async verify(token) {
      calls.push(token);
      return verify(token);
    },
    async close() { closeCalls += 1; },
  };
}

function identity(overrides: Partial<VerifiedIdentity> = {}): VerifiedIdentity {
  return {
    uid: 'user-123',
    email: 'person@example.com',
    emailVerified: true,
    storeAdmin: false,
    ...overrides,
  };
}

function track(app: FastifyInstance): FastifyInstance {
  after(async () => { await app.close(); });
  return app;
}

describe('backend app bootstrap', () => {
  describe('disabled defaults', () => {
    const verifier = fakeVerifier(async () => {
      throw new Error('disabled verifier must never run');
    });
    const app = track(buildApp(disabledConfig, { verifier, logger: false }));

    it('reports process health without implying backend readiness', async () => {
      const health = await app.inject({ method: 'GET', url: '/health' });
      assert.equal(health.statusCode, 200);
      assert.deepEqual(health.json(), { status: 'ok', service: 'solar-store-api' });

      const ready = await app.inject({ method: 'GET', url: '/ready' });
      assert.equal(ready.statusCode, 503);
    });

    it('keeps the identity route disabled even with an injected verifier', async () => {
      const response = await app.inject({
        method: 'GET', url: '/api/v1/me', headers: { authorization: 'Bearer token' },
      });
      assert.equal(response.statusCode, 503);
      assert.equal(response.json().error.code, 'BACKEND_DISABLED');
      assert.deepEqual(verifier.calls, []);
    });
  });

  describe('enabled identity route', () => {
    const verifier = fakeVerifier(async (token) => {
      if (token === 'invalid') throw new ApiError(401, 'UNAUTHENTICATED', 'Token is invalid.');
      if (token === 'explode') throw new Error('secret verifier details');
      if (token === 'eligible') return identity({ email: 'person@solar.dumaget.me' });
      if (token === 'admin') return identity({
        email: 'admin@solar.dumaget.me', storeAdmin: true,
      });
      if (token === 'domain-admin') return identity({ email: 'person@solar.dumaget.me' });
      return identity();
    });
    const app = track(buildApp(enabledConfig, { verifier, logger: false }));

    it('rejects missing and malformed bearer headers without verifying', async () => {
      for (const authorization of [undefined, 'Basic token', 'Bearer two words', 'Bearer token,other']) {
        const response = await app.inject({
          method: 'GET', url: '/api/v1/me',
          headers: authorization ? { authorization } : {},
        });
        assert.equal(response.statusCode, 401);
        assert.equal(response.json().error.code, 'UNAUTHENTICATED');
      }
      assert.deepEqual(verifier.calls, []);
    });

    it('returns verified self identity and distinguishes eligibility from authorization', async () => {
      const ordinary = await app.inject({
        method: 'GET', url: '/api/v1/me', headers: { authorization: 'Bearer ordinary' },
      });
      assert.equal(ordinary.statusCode, 200);
      assert.deepEqual(ordinary.json(), {
        uid: 'user-123', email: 'person@example.com', emailVerified: true,
        adminEligible: false, adminAuthorized: false,
      });

      const eligible = await app.inject({
        method: 'GET', url: '/api/v1/me', headers: { authorization: 'Bearer eligible' },
      });
      assert.equal(eligible.statusCode, 200);
      assert.equal(eligible.json().adminEligible, true);
      assert.equal(eligible.json().adminAuthorized, false);

      const authorized = await app.inject({
        method: 'GET', url: '/api/v1/me', headers: { authorization: 'Bearer admin' },
      });
      assert.equal(authorized.statusCode, 200);
      assert.equal(authorized.json().adminEligible, true);
      assert.equal(authorized.json().adminAuthorized, true);

      const domainOnly = await app.inject({
        method: 'GET', url: '/api/v1/me', headers: { authorization: 'Bearer domain-admin' },
      });
      assert.equal(domainOnly.statusCode, 200);
      assert.equal(domainOnly.json().adminEligible, true);
      assert.equal(domainOnly.json().adminAuthorized, false);
    });

    it('sanitizes verifier authentication and unexpected errors', async () => {
      const invalid = await app.inject({
        method: 'GET', url: '/api/v1/me', headers: { authorization: 'Bearer invalid' },
      });
      assert.equal(invalid.statusCode, 401);
      assert.equal(invalid.json().error.code, 'UNAUTHENTICATED');
      assert.doesNotMatch(invalid.body, /secret verifier details|Bearer invalid/);

      const unexpected = await app.inject({
        method: 'GET', url: '/api/v1/me', headers: { authorization: 'Bearer explode' },
      });
      assert.equal(unexpected.statusCode, 500);
      assert.equal(unexpected.json().error.code, 'INTERNAL_ERROR');
      assert.doesNotMatch(unexpected.body, /secret verifier details|explode/);
    });

    it('does not expose connected readiness while enabled', async () => {
      const response = await app.inject({ method: 'GET', url: '/ready' });
      assert.equal(response.statusCode, 503);
    });
  });

  describe('HTTP hardening and routing', () => {
    const app = track(buildApp(disabledConfig, { logger: false }));

    it('allows configured local CORS and omits allow-origin for unconfigured origins', async () => {
      const allowed = await app.inject({
        method: 'GET', url: '/health', headers: { origin: 'http://127.0.0.1:4300' },
      });
      assert.equal(allowed.headers['access-control-allow-origin'], 'http://127.0.0.1:4300');

      const disallowed = await app.inject({
        method: 'GET', url: '/health', headers: { origin: 'https://attacker.example' },
      });
      assert.equal(disallowed.headers['access-control-allow-origin'], undefined);
    });

    it('sets Helmet security headers', async () => {
      const response = await app.inject({ method: 'GET', url: '/health' });
      assert.equal(response.headers['x-content-type-options'], 'nosniff');
      assert.equal(response.headers['x-frame-options'], 'SAMEORIGIN');
      assert.ok(response.headers['content-security-policy']);
      assert.equal(response.headers['cache-control'], 'no-store');
    });

    it('returns a consistent not-found error without echoing URL secrets', async () => {
      const response = await app.inject({ method: 'GET', url: '/missing/path?secret=do-not-echo' });
      assert.equal(response.statusCode, 404);
      assert.deepEqual(response.json().error && {
        code: response.json().error.code,
        message: response.json().error.message,
      }, { code: 'NOT_FOUND', message: 'Route not found.' });
      assert.doesNotMatch(response.body, /missing\/path|do-not-echo/);
    });
  });

  it('limits registered requests per IP without trusting spoofed proxy headers', async () => {
    const app = track(buildApp(disabledConfig, { logger: false }));
    for (let index = 0; index < 60; index++) {
      const response = await app.inject({ method: 'GET', url: '/health', headers: { 'x-forwarded-for': `192.0.2.${index}` } });
      assert.equal(response.statusCode, 200);
    }
    const response = await app.inject({ method: 'GET', url: '/health' });
    assert.equal(response.statusCode, 429);
    assert.equal(response.json().error.code, 'RATE_LIMITED');
    assert.ok(response.headers['retry-after']);
  });
});
