import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountProject, AccountProjectService } from './account-project.service';
import { FreeTextInput } from './project-bom';
import { AuthSessionService } from './auth-session.service';
import { PublicCatalogService } from './public-catalog.service';
import { StoreApiService } from './store-api.service';

const id = '11111111-1111-4111-8111-111111111111';
const requestId = '22222222-2222-4222-8222-222222222222';
const at = '2026-10-09T00:00:00.000Z';
const project: AccountProject = { id, customerId: 'a', schemaVersion: 1, version: 1, name: 'Roof',
  classification: 'residential', installation: 'rooftop', configuration: 'hybrid', workScope: 'new-installation',
  status: 'draft', archivedAt: null, createdAt: at, updatedAt: at,
  bom: { id: 'bom-' + id, projectId: id, items: [], updatedAt: at } };
describe('account project management and query fencing', () => {
  let service: AccountProjectService;
  let request: ReturnType<typeof vi.fn>;
  let session: ReturnType<typeof signal<{ customerId: string; source: 'firebase' } | null>>;
  let revision: ReturnType<typeof signal<number>>;
  const page = { items: [project], nextCursor: null, activeProjectId: id, preferencesVersion: 1 };
  beforeEach(async () => {
    session = signal({ customerId: 'a', source: 'firebase' }); revision = signal(1);
    request = vi.fn(async (_path: string, _method: string, _body: unknown, parse: (value: unknown) => unknown) => parse(page));
    TestBed.configureTestingModule({ providers: [
      { provide: AuthSessionService, useValue: { session, sessionRevision: revision, status: signal('signed-in'), busy: signal(false) } },
      { provide: StoreApiService, useValue: { projectRequest: request } },
      { provide: PublicCatalogService, useValue: { hydrate: vi.fn(async () => {}) } },
    ] });
    service = TestBed.inject(AccountProjectService);
    TestBed.tick(); await service.refresh(); await Promise.resolve();
    request.mockClear();
  });
  afterEach(() => TestBed.resetTestingModule());

  it('sends filters to the API, returns only that page, and retains known cache records for chooser/detail', async () => {
    request.mockImplementation(async (_path, _method, _body, parse) => parse({ ...page, items: [] }));
    const result = await service.queryPage({ search: 'Cebu', status: 'archived', configuration: 'hybrid', workScope: 'expansion', classification: 'commercial', limit: 10 }, id);
    expect(result.items).toEqual([]);
    expect(service.projects()).toEqual([project]);
    expect(request.mock.calls[0]?.[4]).toBe(id);
    expect(request.mock.calls[0]?.[5]).toEqual({ search: 'Cebu', status: 'archived', configuration: 'hybrid', workScope: 'expansion', classification: 'commercial', limit: '10' });
  });
  it('freezes the expected version on a failed-write retry and accepts server atomic active clearing', async () => {
    let body: unknown;
    request.mockImplementationOnce(async (_path, _method, input) => { body = input; throw new Error('network'); });
    await expect(service.manageProject(id, requestId, { action: 'archive-project' })).rejects.toThrow('network');
    request.mockImplementation(async (_path, _method, input, parse) => {
      expect(input).toEqual(body);
      return parse({ project: { ...project, version: 2, status: 'archived', archivedAt: at }, activeProjectId: null, preferencesVersion: 2 });
    });
    await service.manageProject(id, requestId, { action: 'archive-project' });
    expect(body).toEqual({ requestId, expectedVersion: 1, action: 'archive-project' });
    expect(service.activeProject()).toBeNull();
    expect(service.preferencesVersion()).toBe(2);
  });
  it('sends ATS metadata and parses the persisted subtype and decimal amperage', async () => {
    const input: FreeTextInput = { title: 'ATS', description: '', unit: 'piece', quantity: 1, notes: '',
      componentCategory: 'Protection', componentProtectionType: 'ATS', amperage: 63.5 };
    const item = { id: 'text-33333333-3333-4333-8333-333333333333', kind: 'free-text', ...input,
      estimate: { kind: 'unpriced' }, createdAt: at, updatedAt: at };
    request.mockImplementationOnce(async (_path, _method, body, parse) => {
      expect(body).toMatchObject({ action: 'free-text', input });
      return parse({ project: { ...project, version: 2, bom: { ...project.bom, items: [item] } }, copyReceipt: null });
    });
    const saved = await service.command(id, '33333333-3333-4333-8333-333333333333', { action: 'free-text', input });
    expect(saved.project.bom.items[0]).toMatchObject({ componentCategory: 'Protection', componentProtectionType: 'ATS', amperage: 63.5 });
    expect(request.mock.calls[0]?.[0]).toBe(`/api/v1/me/projects/${id}/commands`);
  });
  it('uses the editor reviewed version instead of rebasing to a newer cached project', async () => {
    request.mockImplementationOnce(async (_path, _method, _body, parse) => parse({ ...page, items: [{ ...project, version: 2 }] }));
    await service.queryPage({ limit: 10 });
    request.mockImplementationOnce(async (_path, _method, body) => {
      expect(body.expectedVersion).toBe(1);
      throw new Error('conflict from stale review');
    });
    await expect(service.manageProject(id, requestId, { action: 'archive-project' }, 1)).rejects.toThrow('conflict from stale review');
    expect(service.projects()[0]?.version).toBe(2);
  });
  it('suppresses an older query even if it resolves after the new page', async () => {
    let finish!: (value: unknown) => void;
    request.mockImplementationOnce((_path, _method, _body, parse) => new Promise(resolve => { finish = value => resolve(parse(value)); }));
    const old = service.queryPage({ search: 'old', limit: 10 });
    const rejected = expect(old).rejects.toMatchObject({ code: 'session-changed' });
    request.mockImplementationOnce(async (_path, _method, _body, parse) => parse({ ...page, items: [] }));
    expect((await service.queryPage({ search: 'new', limit: 10 })).items).toEqual([]);
    finish({ ...page, items: [{ ...project, name: 'Stale name' }] });
    await rejected;
    expect(service.projects()[0]?.name).toBe('Roof');
  });
  it('rejects a late lifecycle result on account switch without exposing the old record', async () => {
    let finish!: (value: unknown) => void;
    request.mockImplementationOnce((_path, _method, _body, parse) => new Promise(resolve => { finish = value => resolve(parse(value)); }));
    const pending = service.manageProject(id, requestId, { action: 'restore-project' });
    const rejected = expect(pending).rejects.toMatchObject({ code: 'session-changed' });
    session.set(null); revision.set(2);
    finish({ project: { ...project, version: 2 }, activeProjectId: id, preferencesVersion: 1 });
    await rejected;
    expect(service.projects()).toEqual([]);
    expect(service.activeProject()).toBeNull();
  });
});
