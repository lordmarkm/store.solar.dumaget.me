import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { signal } from '@angular/core';
import { PRODUCTS } from './demo-data';
import { createNewProjectDraft, NewProjectDraft } from './models';
import { LOCAL_PROJECTS_KEY, ProjectService, validateProjectInput } from './project.service';

const input = (name = 'Roof installation'): NewProjectDraft => ({ ...createNewProjectDraft(), name, classification: 'residential', configuration: 'hybrid', workScope: 'new-installation' });

describe('browser-local projects prototype', () => {
  beforeEach(() => {
    const values = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('requires explicit classifications, configuration, and scope, with only Rooftop defaulted', async () => {
    expect(Object.keys(validateProjectInput(createNewProjectDraft())).sort()).toEqual(['classification', 'configuration', 'name', 'workScope']);
    const projects = new ProjectService(signal(PRODUCTS));
    expect((await projects.create(createNewProjectDraft(), 'invalid')).ok).toBe(false);
    expect(projects.projects()).toHaveLength(0);
    expect(localStorage.getItem(LOCAL_PROJECTS_KEY)).toBeNull();
  });

  it('persists valid metadata and initializes independent empty BOMs without silently making a project active', async () => {
    const projects = new ProjectService(signal(PRODUCTS));
    const first = await projects.create({ ...input(' Home '), location: ' Bagacay ', notes: ' Keep notes ', installation: 'carport' }, 'first');
    const second = await projects.create(input('Office'), 'second');
    expect(first.ok && first.project.name).toBe('Home');
    expect(first.ok && first.project.installation).toBe('carport');
    expect(first.ok && first.project.location).toBe('Bagacay');
    expect(second.ok).toBe(true);
    expect(projects.projects()[0].bom.items).toEqual([]);
    expect(projects.projects()[1].bom.items).toEqual([]);
    expect(projects.projects()[0].bom.id).not.toBe(projects.projects()[1].bom.id);
    expect(projects.projects()[0].bom.projectId).toBe(projects.projects()[0].id);
    expect(projects.activeProject()).toBeNull();
    const restored = new ProjectService(signal(PRODUCTS));
    expect(restored.projects()).toEqual(projects.projects());
  });

  it('makes active selection explicit, persisted, and independent of subsequent creation', async () => {
    const projects = new ProjectService(signal(PRODUCTS));
    await projects.create(input('One'), 'one');
    const id = projects.projects()[0].id;
    expect((await projects.setActive(id)).ok).toBe(true);
    await projects.create(input('Two'), 'two');
    expect(projects.activeProject()?.id).toBe(id);
    expect(new ProjectService(signal(PRODUCTS)).activeProject()?.id).toBe(id);
    expect((await projects.setActive('unknown')).ok).toBe(false);
    expect(projects.activeProject()?.id).toBe(id);
    expect((await projects.setActive(null)).ok).toBe(true);
    expect(new ProjectService(signal(PRODUCTS)).activeProject()).toBeNull();
  });

  it('deduplicates repeated confirmation from one wizard request while allowing independently named projects', async () => {
    const projects = new ProjectService(signal(PRODUCTS));
    const first = await projects.create(input(), 'same-request');
    expect(await projects.create(input(), 'same-request')).toEqual(first);
    expect(projects.projects()).toHaveLength(1);
    await projects.create(input(), 'separate-request');
    expect(projects.projects()).toHaveLength(2);
  });

  it('does not publish a project or change prior records on storage failure, and safely retries', async () => {
    const projects = new ProjectService(signal(PRODUCTS));
    await projects.create(input('Existing'), 'existing');
    const before = localStorage.getItem(LOCAL_PROJECTS_KEY);
    const write = vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new Error('Quota exceeded'); });
    expect((await projects.create(input('New'), 'new')).ok).toBe(false);
    expect(projects.projects()).toHaveLength(1);
    expect(localStorage.getItem(LOCAL_PROJECTS_KEY)).toBe(before);
    expect(projects.error()).toContain('Could not save');
    write.mockRestore();
    expect((await projects.create(input('New'), 'new')).ok).toBe(true);
    expect(projects.projects()).toHaveLength(2);
    expect(projects.error()).toBeNull();
  });

  it('preserves corrupt or foreign stored data instead of replacing it with an empty list', async () => {
    for (const stored of ['{bad json', JSON.stringify({ schemaVersion: 1, customerId: 'real-user', projects: [], activeProjectId: null })]) {
      localStorage.setItem(LOCAL_PROJECTS_KEY, stored);
      const projects = new ProjectService(signal(PRODUCTS));
      expect(projects.error()).toContain('preserved');
      expect((await projects.create(input(), 'blocked')).ok).toBe(false);
      expect(localStorage.getItem(LOCAL_PROJECTS_KEY)).toBe(stored);
    }
  });

  it('rejects a stale-tab write without losing the other tab’s saved project', async () => {
    const firstTab = new ProjectService(signal(PRODUCTS));
    const staleTab = new ProjectService(signal(PRODUCTS));
    await firstTab.create(input('First tab'), 'first-tab');
    const saved = localStorage.getItem(LOCAL_PROJECTS_KEY);
    expect((await staleTab.create(input('Second tab'), 'second-tab')).ok).toBe(false);
    expect(staleTab.error()).toContain('another tab');
    expect(localStorage.getItem(LOCAL_PROJECTS_KEY)).toBe(saved);
  });

  it('retains explicit Other descriptions and strips stale Other text from unrelated choices', async () => {
    const projects = new ProjectService(signal(PRODUCTS));
    await projects.create({ ...input(), classification: 'other', classificationOther: ' Community center ', installation: 'other', installationOther: ' Mixed mounting ' }, 'other');
    expect(projects.projects()[0].classificationOther).toBe('Community center');
    await projects.create({ ...input(), classificationOther: 'Stale', installationOther: 'Stale' }, 'normal');
    expect(projects.projects()[1].classificationOther).toBeUndefined();
    expect(projects.projects()[1].installationOther).toBeUndefined();
  });

  it('rejects invalid metadata, duplicate BOM IDs, and dangling project references without data loss', async () => {
    const projects = new ProjectService(signal(PRODUCTS));
    await projects.create(input('One'), 'one');
    await projects.create(input('Two'), 'two');
    const original = JSON.parse(localStorage.getItem(LOCAL_PROJECTS_KEY)!);
    for (const mutation of [
      (data: typeof original) => { data.projects[0].classification = 'unsupported'; },
      (data: typeof original) => { data.projects[1].bom.id = data.projects[0].bom.id; },
      (data: typeof original) => { data.projects[0].bom.projectId = 'different-project'; },
    ]) {
      const data = structuredClone(original);
      mutation(data);
      const encoded = JSON.stringify(data);
      localStorage.setItem(LOCAL_PROJECTS_KEY, encoded);
      expect(new ProjectService(signal(PRODUCTS)).error()).toContain('preserved');
      expect(localStorage.getItem(LOCAL_PROJECTS_KEY)).toBe(encoded);
    }
  });
});
