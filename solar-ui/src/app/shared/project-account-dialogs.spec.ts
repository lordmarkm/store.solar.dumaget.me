import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CustomerAccessService } from '../core/customer-access.service';
import { createNewProjectDraft } from '../core/models';
import { ProjectService } from '../core/project.service';
import { BomLineEditor } from './bom-line-editor';
import { NewProjectWizard } from './new-project-wizard';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(yes => { resolve = yes; });
  return { promise, resolve };
}
const input = { title: 'Roof work', description: '', unit: 'lot', quantity: 1, notes: '' };

describe('account project dialogs await writes and fence stale owners', () => {
  let owner: ReturnType<typeof signal<string>>;
  let ref: { close: ReturnType<typeof vi.fn>; disableClose: boolean };
  let service: { saveFreeText: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn>; accountBacked: ReturnType<typeof signal<boolean>> };
  beforeEach(() => {
    owner = signal('account-a:1');
    ref = { close: vi.fn(), disableClose: false };
    service = { saveFreeText: vi.fn(), create: vi.fn(), accountBacked: signal(true) };
    TestBed.configureTestingModule({ providers: [
      { provide: CustomerAccessService, useValue: { canAccessProjects: signal(true), projectSessionKey: owner } },
      { provide: ProjectService, useValue: service },
      { provide: DialogRef, useValue: ref },
      { provide: DIALOG_DATA, useValue: { projectId: 'project-id' } },
    ] });
  });
  afterEach(() => TestBed.resetTestingModule());

  it('blocks duplicate writes and closing during a pending free-text save, then closes only on success', async () => {
    const pending = deferred<{ ok: true }>();
    service.saveFreeText.mockReturnValue(pending.promise);
    const fixture = TestBed.createComponent(BomLineEditor);
    fixture.detectChanges(); const editor = fixture.componentInstance;
    editor.draft.set(input);
    const saving = editor.save();
    await editor.save(); editor.cancel();
    expect(service.saveFreeText).toHaveBeenCalledOnce();
    expect(editor.saving()).toBe(true); expect(ref.disableClose).toBe(true); expect(ref.close).not.toHaveBeenCalled();
    editor.update('title', 'Not accepted'); expect(editor.draft().title).toBe('Roof work');
    pending.resolve({ ok: true }); await saving;
    expect(ref.close).toHaveBeenCalledWith(true);
  });

  it('preserves failed input and retries the same reviewed payload with the same ID; changed input gets a new ID', async () => {
    service.saveFreeText.mockResolvedValue({ ok: false, message: 'Retry safely' });
    const fixture = TestBed.createComponent(BomLineEditor);
    fixture.detectChanges(); const editor = fixture.componentInstance; editor.draft.set(input);
    await editor.save(); await editor.save();
    const first = service.saveFreeText.mock.calls[0][2];
    expect(service.saveFreeText.mock.calls[1][2]).toBe(first);
    expect(editor.saveError()).toBe('Retry safely'); expect(ref.close).not.toHaveBeenCalled();
    editor.update('notes', 'Changed');
    await editor.save();
    expect(service.saveFreeText.mock.calls[2][2]).not.toBe(first);
  });

  it('closes on a true-to-true UID switch and ignores the old successful write', async () => {
    const pending = deferred<{ ok: true }>();
    service.saveFreeText.mockReturnValue(pending.promise);
    const fixture = TestBed.createComponent(BomLineEditor);
    fixture.detectChanges(); const editor = fixture.componentInstance; editor.draft.set(input);
    const saving = editor.save();
    owner.set('account-b:2'); fixture.detectChanges();
    expect(ref.close).toHaveBeenCalledOnce();
    pending.resolve({ ok: true }); await saving;
    expect(ref.close).toHaveBeenCalledOnce(); expect(ref.close).not.toHaveBeenCalledWith(true);
  });

  it('does not close or show errors from a write after its editor is destroyed', async () => {
    const pending = deferred<{ ok: false; message: string }>();
    service.saveFreeText.mockReturnValue(pending.promise);
    const fixture = TestBed.createComponent(BomLineEditor);
    fixture.detectChanges(); const editor = fixture.componentInstance; editor.draft.set(input);
    const saving = editor.save(); fixture.destroy();
    const calls = ref.close.mock.calls.length;
    pending.resolve({ ok: false, message: 'Old account error' }); await saving;
    expect(ref.close.mock.calls).toHaveLength(calls); expect(editor.saveError()).toBeNull();
  });

  it('awaits wizard creation and fences its late project result after an account switch', async () => {
    const pending = deferred<{ ok: true; project: unknown }>();
    service.create.mockReturnValue(pending.promise);
    const fixture = TestBed.createComponent(NewProjectWizard);
    fixture.detectChanges(); const wizard = fixture.componentInstance;
    wizard.draft.set({ ...createNewProjectDraft(), name: 'Roof', classification: 'residential', configuration: 'hybrid', workScope: 'new-installation' });
    wizard.step.set(2);
    const saving = wizard.create(); await wizard.create();
    expect(service.create).toHaveBeenCalledOnce(); expect(ref.close).not.toHaveBeenCalled();
    owner.set('account-b:2'); fixture.detectChanges();
    pending.resolve({ ok: true, project: { id: 'old-project', customerId: 'account-a' } }); await saving;
    expect(ref.close).toHaveBeenCalledOnce(); expect(ref.close).not.toHaveBeenCalledWith(expect.objectContaining({ id: 'old-project' }));
  });
});
