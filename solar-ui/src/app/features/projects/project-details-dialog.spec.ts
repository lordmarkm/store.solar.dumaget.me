import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import { CustomerAccessService } from '../../core/customer-access.service';
import { Project } from '../../core/models';
import { ProjectService } from '../../core/project.service';
import { ToastService } from '../../core/toast.service';
import { ProjectDetailsDialog } from './project-details-dialog';

const record: Project & { version: number } = {
  id: 'project-1', schemaVersion: 1, customerId: 'customer-1', version: 4, name: 'School solar',
  classification: 'other', classificationOther: 'Community facility', installation: 'other', installationOther: 'Canopy',
  configuration: 'hybrid', workScope: 'retrofit', location: 'Dumaguete', description: 'Existing roof', notes: 'Coordinate access',
  status: 'draft', archivedAt: null, createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-02T00:00:00.000Z',
  bom: { id: 'bom-1', projectId: 'project-1', items: [], updatedAt: '2026-10-02T00:00:00.000Z' },
};

describe('ProjectDetailsDialog', () => {
  function setup(updateProject = vi.fn().mockResolvedValue({ ok: true })) {
    const access = { projectSessionKey: signal('customer-1'), canAccessProjects: signal(true), customerId: signal('customer-1') };
    const ref = { close: vi.fn(), disableClose: false };
    const toast = { success: vi.fn(), error: vi.fn() };
    const service = { updateProject };
    TestBed.configureTestingModule({ imports: [ProjectDetailsDialog], providers: [
      { provide: DIALOG_DATA, useValue: { project: record } },
      { provide: DialogRef, useValue: ref },
      { provide: CustomerAccessService, useValue: access },
      { provide: ProjectService, useValue: service },
      { provide: ToastService, useValue: toast },
    ] });
    const fixture = TestBed.createComponent(ProjectDetailsDialog);
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance, access, ref, updateProject, toast };
  }

  it('seeds every project field, validates required input, and saves a normalized update', async () => {
    const state = setup();
    const { fixture, component, updateProject, ref } = state;
    expect(component.draft()).toMatchObject({ name: record.name, classificationOther: 'Community facility', installationOther: 'Canopy', location: 'Dumaguete', description: 'Existing roof', notes: 'Coordinate access' });
    for (const id of ['project-edit-name', 'project-edit-classification', 'project-edit-classification-other', 'project-edit-installation', 'project-edit-installation-other', 'project-edit-configuration', 'project-edit-work-scope', 'project-edit-location', 'project-edit-description', 'project-edit-notes']) {
      expect(fixture.nativeElement.querySelector('#' + id)).toBeTruthy();
    }
    component.update('name', '  School solar phase 2  ');
    await component.save();
    expect(updateProject).toHaveBeenCalledOnce();
    expect(updateProject.mock.calls[0][0]).toBe(record.id);
    expect(updateProject.mock.calls[0][1]).toMatchObject({ name: 'School solar phase 2', classificationOther: 'Community facility', installationOther: 'Canopy', notes: 'Coordinate access' });
    expect(updateProject.mock.calls[0][2]).toMatch(/^[0-9a-f-]{36}$/i);
    expect(updateProject.mock.calls[0][3]).toBe(4);
    expect(ref.close).toHaveBeenCalledWith(true);
  });

  it('keeps invalid input local and leaves validation messages on the required field', async () => {
    const { fixture, component, updateProject, ref, toast } = setup();
    component.update('name', '   ');
    await component.save();
    fixture.detectChanges();
    expect(updateProject).not.toHaveBeenCalled();
    expect(component.draft().name).toBe('   ');
    expect(fixture.nativeElement.querySelector('#project-edit-name-error')?.textContent).toContain('Enter a project name');
    expect(toast.error).toHaveBeenCalledWith('Review the highlighted fields before saving.');
    expect(ref.close).not.toHaveBeenCalled();
  });

  it('retains edits and reuses the same request ID when an unchanged save is retried', async () => {
    const updateProject = vi.fn()
      .mockResolvedValueOnce({ ok: false, message: 'The project changed elsewhere.' })
      .mockResolvedValueOnce({ ok: true });
    const { component, fixture, toast } = setup(updateProject);
    component.update('name', 'Updated roof');
    await component.save();
    expect(component.draft().name).toBe('Updated roof');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('reload this project before retrying');
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('changed elsewhere'));
    await component.save();
    expect(updateProject.mock.calls[0][2]).toBe(updateProject.mock.calls[1][2]);
  });

  it('closes and suppresses late completion after the customer session changes', async () => {
    let finish!: (value: { ok: true }) => void;
    const updateProject = vi.fn(() => new Promise<{ ok: true }>(resolve => { finish = resolve; }));
    const { component, access, ref, fixture, toast } = setup(updateProject);
    const save = component.save();
    access.projectSessionKey.set('customer-2');
    fixture.detectChanges();
    finish({ ok: true });
    await save;
    expect(ref.close).toHaveBeenCalledOnce();
    expect(ref.close).not.toHaveBeenCalledWith(true);
    expect(toast.error).not.toHaveBeenCalled();
  });
});
