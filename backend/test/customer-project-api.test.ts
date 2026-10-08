import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { ApiError } from '../src/errors.js';
import type { IdentityVerifier, VerifiedIdentity } from '../src/auth.js';
import type { AccountProjectRepository } from '../src/project.repository.js';
import type { AccountProject } from '../src/customer-projects.js';

const config = loadConfig({ NODE_ENV: 'test', FIREBASE_BACKEND_ENABLED: 'true', FIREBASE_AUTH_SETUP_APPROVED: 'true' });
const identity: VerifiedIdentity = { uid: 'account-api-one', email: 'one@example.test', emailVerified: true, storeAdmin: false };
const project: AccountProject = {
  id: '11111111-1111-4111-8111-111111111111', schemaVersion: 1, customerId: identity.uid, version: 1, name: 'Roof',
  classification: 'residential', installation: 'rooftop', configuration: 'hybrid', workScope: 'new-installation',
  status: 'draft', createdAt: '2026-10-08T00:00:00.000Z', updatedAt: '2026-10-08T00:00:00.000Z', archivedAt: null,
  bom: { id: 'bom-11111111-1111-4111-8111-111111111111', projectId: '11111111-1111-4111-8111-111111111111', items: [], updatedAt: '2026-10-08T00:00:00.000Z' },
};

test('account project routes authenticate before parsing or repository access', async () => {
  let calls = 0;
  const never = async (): Promise<never> => { calls++; throw new Error('repository should not run'); };
  const projects: AccountProjectRepository = { list: never, get: never, create: never, command: never, setActive: never };
  const verifier: IdentityVerifier = { verify: async token => { if (token === 'invalid') throw new ApiError(401, 'UNAUTHENTICATED', 'Rejected.'); return identity; }, close: async () => {} };
  const app = buildApp(config, { logger: false, verifier, projects });
  try {
    const routes = [
      { method: 'GET' as const, url: '/api/v1/me/projects?unexpected=1' },
      { method: 'GET' as const, url: '/api/v1/me/projects/not-a-uuid' },
      { method: 'POST' as const, url: '/api/v1/me/projects', payload: {} },
      { method: 'POST' as const, url: '/api/v1/me/projects/not-a-uuid/commands', payload: {} },
      { method: 'PUT' as const, url: '/api/v1/me/project-active', payload: {} },
    ];
    for (const route of routes) {
      assert.equal((await app.inject(route)).statusCode, 401);
      assert.equal((await app.inject({ ...route, headers: { authorization: 'Bearer invalid' } })).statusCode, 401);
    }
    assert.equal(calls, 0);
    assert.equal((await app.inject({ method: 'GET', url: '/api/v1/me/projects', headers: { authorization: 'Bearer accepted' } })).statusCode, 500);
    assert.equal(calls, 1);
  } finally { await app.close(); }
});

test('account project routes pass verified identity and exact cursors through the repository', async () => {
  const seen: string[] = [];
  const projects: AccountProjectRepository = {
    async list(owner, cursor) { seen.push('list:' + owner.uid + ':' + cursor); return { items: [project], nextCursor: null, activeProjectId: null, preferencesVersion: null }; },
    async get(owner, id) { seen.push('get:' + owner.uid + ':' + id); return project; },
    async create(owner, input) { seen.push('create:' + owner.uid + ':' + input.requestId); return { project, copyReceipt: null }; },
    async command(owner, id, input) { seen.push('command:' + owner.uid + ':' + id + ':' + input.action); return { project, copyReceipt: null }; },
    async setActive(owner, input) { seen.push('active:' + owner.uid + ':' + input.requestId); return { activeProjectId: input.activeProjectId, preferencesVersion: 1 }; },
  };
  const app = buildApp(config, { logger: false, projects, verifier: { verify: async () => identity, close: async () => {} } });
  const headers = { authorization: 'Bearer accepted' };
  const requestId = '22222222-2222-4222-8222-222222222222';
  const details = { name: 'Roof', classification: 'residential', installation: 'rooftop', configuration: 'hybrid', workScope: 'new-installation' };
  try {
    assert.deepEqual((await app.inject({ method: 'GET', url: '/api/v1/me/projects', headers })).json(), { items: [project], nextCursor: null, activeProjectId: null, preferencesVersion: null });
    assert.equal((await app.inject({ method: 'GET', url: '/api/v1/me/projects/11111111-1111-4111-8111-111111111111', headers })).statusCode, 200);
    assert.equal((await app.inject({ method: 'POST', url: '/api/v1/me/projects', headers, payload: { requestId, details } })).statusCode, 201);
    assert.equal((await app.inject({ method: 'POST', url: '/api/v1/me/projects/11111111-1111-4111-8111-111111111111/commands', headers,
      payload: { requestId, expectedVersion: 1, action: 'free-text', input: { title: 'Work', description: '', unit: 'job', quantity: 1, notes: '' } } })).statusCode, 200);
    assert.deepEqual((await app.inject({ method: 'PUT', url: '/api/v1/me/project-active', headers, payload: { requestId, expectedVersion: null, activeProjectId: project.id } })).json(),
      { activeProjectId: project.id, preferencesVersion: 1 });
    assert.deepEqual(seen, [
      'list:' + identity.uid + ':null', 'get:' + identity.uid + ':' + project.id,
      'create:' + identity.uid + ':' + requestId, 'command:' + identity.uid + ':' + project.id + ':free-text',
      'active:' + identity.uid + ':' + requestId,
    ]);
    const invalidCursor = await app.inject({ method: 'GET', url: '/api/v1/me/projects?cursor=nope', headers });
    assert.equal(invalidCursor.statusCode, 400);
    assert.equal(seen.length, 5);
  } finally { await app.close(); }
});
