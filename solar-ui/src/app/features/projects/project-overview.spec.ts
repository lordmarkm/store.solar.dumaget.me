import { Dialog } from '@angular/cdk/dialog';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CustomerAccessService } from '../../core/customer-access.service';
import { Project } from '../../core/models';
import { ProjectService } from '../../core/project.service';
import { ToastService } from '../../core/toast.service';
import { ProjectOverview } from './project-overview';

const project: Project & { version: number } = {
  id: 'project-1', schemaVersion: 1, customerId: 'customer-1', version: 4, name: 'School solar',
  classification: 'institutional-public', installation: 'rooftop', configuration: 'hybrid', workScope: 'new-installation',
  location: 'Dumaguete', description: 'Roof project', notes: 'Coordinate access', status: 'draft', archivedAt: null,
  createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-02T00:00:00.000Z',
  bom: { id: 'bom-1', projectId: 'project-1', items: [], updatedAt: '2026-10-02T00:00:00.000Z' },
};

describe('ProjectOverview account management actions', () => {
  let harness: RouterTestingHarness;
  let rows: ReturnType<typeof signal<Project[]>>;
  let access: { projectSessionKey: ReturnType<typeof signal<string>>; canAccessProjects: ReturnType<typeof signal<boolean>>; customerId: ReturnType<typeof signal<string | null>> };
  let service: Record<string, any>;
  let toast: { success: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };
  let dialog: { open: ReturnType<typeof vi.fn> };
  let decisions: Subject<boolean | undefined>[];
  let dialogCloses: ReturnType<typeof vi.fn>[];

  beforeEach(async () => {
    rows = signal<Project[]>([project]);
    access = { projectSessionKey: signal('customer-1'), canAccessProjects: signal(true), customerId: signal<string | null>('customer-1') };
    decisions = [];
    dialogCloses = [];
    dialog = { open: vi.fn(() => {
      const decision = new Subject<boolean | undefined>(); decisions.push(decision);
      const close = vi.fn((value?: boolean) => { decision.next(value); decision.complete(); }); dialogCloses.push(close);
      return { closed: decision.asObservable(), close };
    }) };
    toast = { success: vi.fn(), error: vi.fn() };
    service = {
      accountBacked: signal(true), projects: rows, activeProject: signal<Project | null>(null), error: signal<string | null>(null),
      loadProject: vi.fn(async () => project), setActive: vi.fn(async () => ({ ok: true })),
      archiveProject: vi.fn(async () => { rows.update(items => items.map(item => item.id === project.id ? { ...item, status: 'archived', archivedAt: '2026-10-03T00:00:00.000Z', version: 5 } : item)); return { ok: true }; }),
      restoreProject: vi.fn(async () => { rows.update(items => items.map(item => item.id === project.id ? { ...item, status: 'draft', archivedAt: null, version: 6 } : item)); return { ok: true }; }),
      duplicateProject: vi.fn(async () => ({ ok: true, project: { ...project, id: 'project-copy', name: 'School solar (copy)', version: 1, bom: { ...project.bom, id: 'bom-copy', projectId: 'project-copy' } } })),
    };
    TestBed.configureTestingModule({ providers: [
      provideRouter([{ path: 'my/projects/:projectId', component: ProjectOverview }]),
      { provide: CustomerAccessService, useValue: access }, { provide: ProjectService, useValue: service },
      { provide: ToastService, useValue: toast }, { provide: Dialog, useValue: dialog },
    ] });
    harness = await RouterTestingHarness.create('/my/projects/project-1');
    await harness.fixture.whenStable();
    harness.detectChanges();
  });
  afterEach(() => TestBed.resetTestingModule());

  const button = (root: Element, label: string) => [...root.querySelectorAll<HTMLButtonElement>('button')].find(value => value.textContent?.trim() === label);

  it('shows edit and archive on drafts, and asks before archiving', async () => {
    expect(button(harness.routeNativeElement!, 'Edit project details')).toBeTruthy();
    button(harness.routeNativeElement!, 'Archive project')!.click();
    await harness.fixture.whenStable();
    expect(dialog.open).toHaveBeenCalledOnce();
    expect(dialog.open.mock.calls[0][1].data.message).toContain('read-only');
    decisions.at(-1)!.next(true); decisions.at(-1)!.complete();
    await vi.waitFor(() => expect(service['archiveProject']).toHaveBeenCalledOnce());
    await harness.fixture.whenStable();
    expect(toast.success).toHaveBeenCalledWith('Project archived.');
  });

  it('does not expose management actions for a browser-local project', async () => {
    service['accountBacked'].set(false);
    harness.detectChanges();
    expect(button(harness.routeNativeElement!, 'Edit project details')).toBeUndefined();
    expect(button(harness.routeNativeElement!, 'Archive project')).toBeUndefined();
    expect(button(harness.routeNativeElement!, 'Duplicate project')).toBeUndefined();
  });

  it('shows archived projects as read-only with restore and duplicate actions', async () => {
    rows.set([{ ...project, status: 'archived', archivedAt: '2026-10-03T00:00:00.000Z' }]);
    harness.detectChanges();
    expect(button(harness.routeNativeElement!, 'Edit project details')).toBeUndefined();
    expect(button(harness.routeNativeElement!, 'Archive project')).toBeUndefined();
    expect(button(harness.routeNativeElement!, 'Restore archived project')).toBeTruthy();
    expect(button(harness.routeNativeElement!, 'Duplicate project')).toBeTruthy();
    expect(harness.routeNativeElement!.textContent).toContain('Archived · read-only');
  });

  it('confirms duplicate scope, preserves the active selection, and opens the copied project', async () => {
    button(harness.routeNativeElement!, 'Duplicate project')!.click();
    await harness.fixture.whenStable();
    const message = dialog.open.mock.calls[0][1].data.message as string;
    expect(message).toContain('project details and BOM');
    expect(message).toContain('Purchase orders are not copied');
    expect(message).toContain('active-project selection stay unchanged');
    decisions.at(-1)!.next(true); decisions.at(-1)!.complete();
    await vi.waitFor(() => expect(service['duplicateProject']).toHaveBeenCalledOnce());
    await harness.fixture.whenStable();
    expect(service['setActive']).not.toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith('Project duplicated with its details and equipment list. Purchase orders were not copied.');
    expect(TestBed.inject(Router).url).toBe('/my/projects/project-copy');
  });

  it('suppresses mutation feedback when the account changes before completion', async () => {
    let finish!: (result: { ok: true }) => void;
    service['archiveProject'] = vi.fn(() => new Promise(resolve => { finish = resolve; }));
    button(harness.routeNativeElement!, 'Archive project')!.click();
    await harness.fixture.whenStable();
    decisions.at(-1)!.next(true); decisions.at(-1)!.complete();
    await vi.waitFor(() => expect(service['archiveProject']).toHaveBeenCalledOnce());
    await harness.fixture.whenStable();
    access.projectSessionKey.set('customer-2');
    harness.detectChanges();
    finish({ ok: true });
    await harness.fixture.whenStable();
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('closes an open editor on same-component project route changes without feedback', async () => {
    const second = { ...project, id: 'project-2', name: 'Second solar', bom: { ...project.bom, id: 'bom-2', projectId: 'project-2' } };
    rows.set([project, second]);
    button(harness.routeNativeElement!, 'Edit project details')!.click();
    await vi.waitFor(() => expect(dialog.open).toHaveBeenCalledOnce());
    expect(dialogCloses[0]).not.toHaveBeenCalled();

    await harness.navigateByUrl('/my/projects/project-2');
    expect(dialogCloses[0]).toHaveBeenCalledWith(false);
    await harness.fixture.whenStable();
    expect(harness.routeNativeElement!.querySelector('h1')?.textContent).toContain('Second solar');
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('keys management retries and archive cycles to the captured project version', async () => {
    button(harness.routeNativeElement!, 'Archive project')!.click();
    await harness.fixture.whenStable();
    decisions.at(-1)!.next(true); decisions.at(-1)!.complete();
    await vi.waitFor(() => expect(service['archiveProject']).toHaveBeenCalledOnce());
    expect(service['archiveProject'].mock.calls[0][2]).toBe(4);
    const firstArchiveRequest = service['archiveProject'].mock.calls[0][1];
    harness.detectChanges();

    button(harness.routeNativeElement!, 'Restore archived project')!.click();
    await vi.waitFor(() => expect(service['restoreProject']).toHaveBeenCalledOnce());
    expect(service['restoreProject'].mock.calls[0][2]).toBe(5);
    harness.detectChanges();

    button(harness.routeNativeElement!, 'Archive project')!.click();
    await harness.fixture.whenStable();
    decisions.at(-1)!.next(true); decisions.at(-1)!.complete();
    await vi.waitFor(() => expect(service['archiveProject']).toHaveBeenCalledTimes(2));
    expect(service['archiveProject'].mock.calls[1][2]).toBe(6);
    expect(service['archiveProject'].mock.calls[1][1]).not.toBe(firstArchiveRequest);
  });
});
