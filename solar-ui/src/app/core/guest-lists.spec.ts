import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { signal } from '@angular/core';
import { createNewProjectDraft } from './models';
import { PRODUCTS } from './demo-data';
import { pendingProduct } from './project-bom';
import { ProjectService, LOCAL_PROJECTS_KEY } from './project.service';
import { guestListFingerprint, LEGACY_DRAFT_KEY, validGuestHistory } from './guest-lists';
const input = (name = 'Local roof') => ({ ...createNewProjectDraft(), name, classification: 'residential' as const, configuration: 'hybrid' as const, workScope: 'new-installation' as const });
const reviewed = (s: ProjectService) => ({ listId: s.currentGuestList()!.id, fingerprint: guestListFingerprint(s.currentGuestList()!) });
const source = () => {
  const service = new ProjectService(signal(PRODUCTS)); service.ensureGuestLists();
  service.setGuestQuantity('osda-620', 200); service.setGuestQuantity('rail-6', 8);
  return service;
};
describe('local guest list identity, one-time copying and history', () => {
  beforeEach(() => { const values = new Map<string, string>(); vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) }); });
  afterEach(() => vi.unstubAllGlobals());
  it('migrates lazily, retains missing/above-stock rows and raw recovery backup, persists stable IDs', async () => {
    const legacy = JSON.stringify([{ productId: 'osda-620', quantity: 200 }, { productId: 'deleted', quantity: 42 }, { productId: 'osda-620', quantity: 999 }, null]);
    localStorage.setItem(LEGACY_DRAFT_KEY, legacy);
    const service = new ProjectService(signal(PRODUCTS)); service.ensureGuestLists();
    expect(localStorage.getItem(LOCAL_PROJECTS_KEY)).toBeNull();
    expect(service.currentGuestList()!.items.map(i => i.quantity)).toEqual([999, 42]);
    service.setGuestQuantity('rail-6', 2);
    expect(localStorage.getItem(LEGACY_DRAFT_KEY)).toBe(legacy);
    expect(new ProjectService(signal(PRODUCTS)).currentGuestList()).toEqual(service.currentGuestList());
    expect(validGuestHistory(service.guestHistory())).toBe(true);
  });
  it('copies all rows as separate lines without merging, and records receipt atomically without changing active', async () => {
    const service = source(); (await service.create(input('Active'), 'active')); (await service.create(input('Other'), 'other', pendingProduct(PRODUCTS[0], 1))); (await service.setActive('preview-active'));
    const pending = reviewed(service); const sourceItems = service.currentGuestList()!.items;
    const write = vi.spyOn(localStorage, 'setItem');
    expect((await service.copyGuestList('preview-other', pending, 'copy-one')).ok).toBe(true);
    expect(write).toHaveBeenCalledTimes(1);
    const project = service.projects()[1]; const list = service.currentGuestList()!;
    expect(project.bom.items.map(i => i.quantity)).toEqual([1, 200, 8]);
    expect(list.items).toEqual(sourceItems); expect(list.state).toBe('linked');
    expect(list.copyReceipt?.itemMappings.map(m => m.destinationBomItemId)).toEqual(project.bom.items.slice(1).map(i => i.id));
    expect(service.activeProject()?.id).toBe('preview-active');
    expect((await service.copyGuestList('preview-other', pending, 'copy-one')).ok).toBe(true);
    expect((await service.copyGuestList('preview-active', pending, 'different-copy')).ok).toBe(false);
    expect(project.bom.items).toHaveLength(3);
    expect(new ProjectService(signal(PRODUCTS)).currentGuestList()).toEqual(list);
  });
  it('quota failure publishes neither copy nor link and same-request retry creates exactly one batch', async () => {
    const service = source(); (await service.create(input(), 'one')); const pending = reviewed(service);
    const stored = localStorage.getItem(LOCAL_PROJECTS_KEY); const list = service.currentGuestList();
    const write = vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    expect((await service.copyGuestList('preview-one', pending, 'retry')).ok).toBe(false);
    expect(service.projects()[0].bom.items).toHaveLength(0); expect(service.currentGuestList()).toBe(list); expect(localStorage.getItem(LOCAL_PROJECTS_KEY)).toBe(stored);
    write.mockRestore(); (await service.copyGuestList('preview-one', pending, 'retry')); (await service.copyGuestList('preview-one', pending, 'retry'));
    expect(service.projects()[0].bom.items).toHaveLength(2);
  });
  it('creates project plus initial batch/link in one write and safely retries after failure', async () => {
    const service = source(); const pending = reviewed(service); const stored = localStorage.getItem(LOCAL_PROJECTS_KEY);
    const write = vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    expect((await service.createFromGuestList(input(), 'wizard', pending)).ok).toBe(false);
    expect(service.projects()).toHaveLength(0); expect(service.currentGuestList()!.state).toBe('unlinked'); expect(localStorage.getItem(LOCAL_PROJECTS_KEY)).toBe(stored);
    write.mockRestore(); const spy = vi.spyOn(localStorage, 'setItem');
    const created = (await service.createFromGuestList(input(), 'wizard', pending));
    expect(created.ok).toBe(true); expect(spy).toHaveBeenCalledTimes(1);
    expect((await service.createFromGuestList(input(), 'wizard', pending))).toEqual(created);
    expect(service.projects()).toHaveLength(1); expect(service.projects()[0].bom.items).toHaveLength(2); expect(service.activeProject()).toBeNull();
  });
  it('later edits/removal do not sync; new-list confirmation retains latest edits/link and reopening cannot recopy', async () => {
    const service = source(); const pending = reviewed(service); (await service.createFromGuestList(input(), 'one', pending));
    const id = service.currentGuestList()!.id; const receipt = service.currentGuestList()!.copyReceipt;
    const bomBefore = service.projects()[0].bom;
    service.setGuestQuantity('osda-620', 201); service.removeGuestItem('rail-6'); service.setGuestQuantity('srne-6200', 3);
    expect(service.projects()[0].bom).toEqual(bomBefore); expect(service.currentGuestList()!.copyReceipt).toEqual(receipt);
    service.startNewGuestList('fresh'); service.startNewGuestList('fresh');
    expect(service.guestHistory()!.lists).toHaveLength(2); expect(service.currentGuestList()!.id).not.toBe(id); expect(service.currentGuestList()!.state).toBe('unlinked'); expect(service.currentGuestList()!.items).toHaveLength(0);
    service.setGuestQuantity('rail-6', 10); service.reopenGuestList(id);
    expect(service.currentGuestList()!.items.map(i => i.quantity)).toEqual([201, 3]); expect((await service.copyGuestList('preview-one', reviewed(service), 'another')).ok).toBe(false);
    expect(service.guestHistory()!.lists[1].items[0].quantity).toBe(10);
    expect(validGuestHistory(service.guestHistory())).toBe(true);
    expect(new ProjectService(signal(PRODUCTS)).currentGuestList()).toEqual(service.currentGuestList());
  });
  it('empty lists, changed reviews, archived destinations and unavailable products block whole-copy with no orphan/link', async () => {
    const service = new ProjectService(signal(PRODUCTS)); service.ensureGuestLists();
    expect((await service.createFromGuestList(input(), 'empty', reviewed(service))).ok).toBe(false);
    service.setGuestQuantity('osda-620', 1); const pending = reviewed(service); service.setGuestQuantity('osda-620', 2);
    expect((await service.createFromGuestList(input(), 'changed', pending)).ok).toBe(false);
    (await service.create(input(), 'archive')); const stored = JSON.parse(localStorage.getItem(LOCAL_PROJECTS_KEY)!);
    stored.projects[0].status = 'archived'; stored.projects[0].archivedAt = new Date().toISOString();
    stored.guestHistory.lists[0].items.push({ id: 'missing', kind: 'store-product', product: { productId: 'removed', variantId: null, unitCode: 'unknown' }, quantity: 42 });
    localStorage.setItem(LOCAL_PROJECTS_KEY, JSON.stringify(stored)); const restored = new ProjectService(signal(PRODUCTS));
    expect((await restored.copyGuestList('preview-archive', reviewed(restored), 'archived')).ok).toBe(false);
    expect((await restored.createFromGuestList(input(), 'missing', reviewed(restored))).ok).toBe(false);
    expect(restored.currentGuestList()!.items).toHaveLength(2); expect(restored.currentGuestList()!.state).toBe('unlinked'); expect(restored.projects()).toHaveLength(1);
  });
  it('failed new/reopen writes retain current/list history and successful retry does not duplicate', async () => {
    const service = source(); (await service.createFromGuestList(input(), 'one', reviewed(service))); const old = service.currentGuestList()!.id;
    const before = service.guestHistory(); const write = vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    expect(service.startNewGuestList('new').ok).toBe(false); expect(service.guestHistory()).toBe(before);
    write.mockRestore(); service.startNewGuestList('new'); const fresh = service.guestHistory();
    const reopenWrite = vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    expect(service.reopenGuestList(old).ok).toBe(false); expect(service.guestHistory()).toBe(fresh);
    reopenWrite.mockRestore(); expect(service.reopenGuestList(old).ok).toBe(true); expect(service.guestHistory()!.lists).toHaveLength(2);
  });
  it('stale state and legacy-tab edits are detected without overwriting either saved record', async () => {
    const first = source(); const stale = new ProjectService(signal(PRODUCTS)); (await first.createFromGuestList(input(), 'one', reviewed(first)));
    const stored = localStorage.getItem(LOCAL_PROJECTS_KEY);
    expect((await stale.createFromGuestList(input(), 'two', reviewed(stale))).ok).toBe(false); expect(localStorage.getItem(LOCAL_PROJECTS_KEY)).toBe(stored);
    localStorage.setItem(LOCAL_PROJECTS_KEY, JSON.stringify({ schemaVersion: 1, customerId: 'local-preview', projects: [], activeProjectId: null }));
    const migrating = new ProjectService(signal(PRODUCTS)); migrating.ensureGuestLists(); localStorage.setItem(LEGACY_DRAFT_KEY, '[{"productId":"rail-6","quantity":9}]');
    expect(migrating.setGuestQuantity('osda-620', 1).ok).toBe(false); expect(migrating.error()).toContain('legacy');
  });
  it('linked foreign/missing customer project details cannot authorize a second copy, and malformed history is preserved', async () => {
    const service = source(); (await service.createFromGuestList(input('Private title'), 'one', reviewed(service)));
    const stored = JSON.parse(localStorage.getItem(LOCAL_PROJECTS_KEY)!); stored.guestHistory.lists[0].copyReceipt.customerId = 'another-account';
    localStorage.setItem(LOCAL_PROJECTS_KEY, JSON.stringify(stored)); const restored = new ProjectService(signal(PRODUCTS));
    expect((await restored.copyGuestList('preview-one', reviewed(restored), 'one')).ok).toBe(false);
    stored.guestHistory.lists[0].copyReceipt = null; const malformed = JSON.stringify(stored); localStorage.setItem(LOCAL_PROJECTS_KEY, malformed);
    const blocked = new ProjectService(signal(PRODUCTS)); blocked.ensureGuestLists(); expect(blocked.setGuestQuantity('rail-6', 1).ok).toBe(false); expect(localStorage.getItem(LOCAL_PROJECTS_KEY)).toBe(malformed);
  });
});
