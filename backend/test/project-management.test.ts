import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { ApiError } from '../src/errors.js';
import { matchesProjectQuery, parseProjectListQuery, parseProjectManagement } from '../src/customer-projects.js';
import type { AccountProject, ProjectListQuery } from '../src/customer-projects.js';
import type { IdentityVerifier, VerifiedIdentity } from '../src/auth.js';
import type { AccountProjectRepository } from '../src/project.repository.js';

const id = '11111111-1111-4111-8111-111111111111';
const requestId = '22222222-2222-4222-8222-222222222222';
const details = { name: 'Roof', classification: 'residential', installation: 'rooftop', configuration: 'hybrid', workScope: 'new-installation' } as const;
const now = '2026-10-08T00:00:00.000Z';
const project: AccountProject = {
  ...details, id, schemaVersion: 1, customerId: 'project-management-unit', version: 1, status: 'draft',
  createdAt: now, updatedAt: now, archivedAt: null,
  bom: { id: 'bom-' + id, projectId: id, items: [], updatedAt: now },
};

test('project management parser accepts only the four exact lifecycle shapes', () => {
  for (const action of ['archive-project', 'restore-project', 'duplicate-project'] as const) {
    assert.deepEqual(parseProjectManagement({ requestId, expectedVersion: 1, action }), { requestId, expectedVersion: 1, action });
  }
  assert.deepEqual(parseProjectManagement({ requestId: requestId.toUpperCase(), expectedVersion: 2, action: 'edit-details', details }),
    { requestId, expectedVersion: 2, action: 'edit-details', details });
  for (const value of [
    { requestId, expectedVersion: 0, action: 'archive-project' },
    { requestId, expectedVersion: Number.MAX_SAFE_INTEGER, action: 'archive-project' },
    { requestId: 'not-a-uuid', expectedVersion: 1, action: 'archive-project' },
    { requestId, expectedVersion: 1, action: 'archive-project', details },
    { requestId, expectedVersion: 1, action: 'edit-details' },
    { requestId, expectedVersion: 1, action: 'edit-details', details, customerId: 'forged' },
    { requestId, expectedVersion: 1, action: 'archive' },
  ]) assert.throws(() => parseProjectManagement(value));
});

test('project list parser enforces cursor, search length, allowlists, and string page sizes', () => {
  const upperCursor = 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA';
  assert.deepEqual(parseProjectListQuery({ cursor: upperCursor, search: '  Solar  ', status: 'draft', classification: 'commercial',
    configuration: 'off-grid', workScope: 'retrofit', limit: '10' }), {
    cursor: upperCursor.toLowerCase(), filters: { limit: 10, search: 'solar', status: 'draft', classification: 'commercial', configuration: 'off-grid', workScope: 'retrofit' },
  });
  assert.deepEqual(parseProjectListQuery({}).filters, { limit: 50 });
  assert.equal(parseProjectListQuery({ search: 'x'.repeat(120) }).filters.search?.length, 120);
  for (const query of [
    { cursor: 'not-a-uuid' }, { search: 'x'.repeat(121) }, { unexpected: 'value' },
    { status: 'deleted' }, { classification: 'public' }, { configuration: 'battery' }, { workScope: 'purchase' },
    { limit: 10 }, { limit: '25' }, { limit: '010' },
  ]) assert.throws(() => parseProjectListQuery(query));
});

test('project matching searches name and location case-insensitively and applies every exact filter', () => {
  const base: ProjectListQuery = { limit: 10, search: 'north ridge', status: 'draft', classification: 'residential', configuration: 'hybrid', workScope: 'new-installation' };
  assert.equal(matchesProjectQuery({ ...project, name: 'North Ridge Array' }, base), true);
  assert.equal(matchesProjectQuery({ ...project, name: 'South Array', location: 'NORTH RIDGE' }, base), true);
  for (const changed of [
    { name: 'South Array' }, { status: 'archived' as const }, { classification: 'commercial' as const },
    { configuration: 'off-grid' as const }, { workScope: 'retrofit' as const },
  ]) assert.equal(matchesProjectQuery({ ...project, name: 'South Array', ...changed }, base), false);
});

test('management route authenticates before parsing and forwards identity, path id, and strict input', async () => {
  const owner: VerifiedIdentity = { uid: 'project-management-route-owner', email: 'owner@example.test', emailVerified: true, storeAdmin: false };
  const seen: unknown[] = [];
  const result = { project, activeProjectId: null, preferencesVersion: null };
  const repository: AccountProjectRepository = {
    async list(_identity, _cursor, filters) {
      seen.push(['list', filters]);
      return { items: [project], nextCursor: null, activeProjectId: null, preferencesVersion: null };
    },
    async get() { return project; },
    async create() { return { project, copyReceipt: null }; },
    async command() { return { project, copyReceipt: null }; },
    async setActive() { return { activeProjectId: null, preferencesVersion: null }; },
    async manage(identity, projectId, input) { seen.push(['manage', identity.uid, projectId, input]); return result; },
  };
  const verifier: IdentityVerifier = {
    async verify(token) { if (token !== 'ok') throw new ApiError(401, 'UNAUTHENTICATED', 'Rejected.'); return owner; },
    async close() {},
  };
  const app = buildApp(loadConfig({ NODE_ENV: 'test', FIREBASE_BACKEND_ENABLED: 'true', FIREBASE_AUTH_SETUP_APPROVED: 'true' }),
    { logger: false, projects: repository, verifier });
  const url = '/api/v1/me/projects/' + id + '/management';
  const body = { requestId, expectedVersion: 1, action: 'archive-project' };
  try {
    assert.equal((await app.inject({ method: 'POST', url, payload: {} })).statusCode, 401);
    assert.equal((await app.inject({ method: 'POST', url, headers: { authorization: 'Bearer invalid' }, payload: {} })).statusCode, 401);
    assert.equal(seen.length, 0);
    assert.equal((await app.inject({ method: 'POST', url, headers: { authorization: 'Bearer ok' }, payload: { ...body, extra: true } })).statusCode, 400);
    assert.equal(seen.length, 0);
    const response = await app.inject({ method: 'POST', url, headers: { authorization: 'Bearer ok' }, payload: body });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), result);
    assert.deepEqual(seen, [['manage', owner.uid, id, body]]);
    const listing = await app.inject({ method: 'GET', url: '/api/v1/me/projects?search=solar&status=draft&classification=commercial&configuration=off-grid&workScope=retrofit&limit=10', headers: { authorization: 'Bearer ok' } });
    assert.equal(listing.statusCode, 200);
    assert.deepEqual(seen[1], ['list', { limit: 10, search: 'solar', status: 'draft', classification: 'commercial', configuration: 'off-grid', workScope: 'retrofit' }]);
  } finally { await app.close(); }
});
