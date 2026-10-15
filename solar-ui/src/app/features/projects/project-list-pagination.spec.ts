import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CustomerAccessService } from '../../core/customer-access.service';
import type { Project, ProjectClassification, ProjectStatus, SystemConfiguration, WorkScope } from '../../core/models';
import type { ProjectListQuery } from '../../core/account-project.service';
import { ProjectService } from '../../core/project.service';
import { Projects } from './projects';

const at = '2026-10-08T00:00:00.000Z';
const page = (items: readonly Project[], nextCursor: string | null = null, activeProjectId: string | null = null) => ({
  items, nextCursor, activeProjectId, preferencesVersion: 1,
});
const project = (id: string, name: string, customerId = 'local-preview'): Project => ({
  id, schemaVersion: 1, customerId, name, classification: 'residential', installation: 'rooftop',
  configuration: 'hybrid', workScope: 'new-installation', status: 'draft', archivedAt: null,
  createdAt: at, updatedAt: at, bom: { id: `bom-${id}`, projectId: id, items: [], updatedAt: at },
});

describe('My projects list pagination', () => {
  let fixture: ComponentFixture<Projects>;
  let fetchPage: ReturnType<typeof vi.fn<(query: ProjectListQuery, cursor: string | null) => Promise<ReturnType<typeof page>>>>;
  let sessionKey: ReturnType<typeof signal<string>>;
  let customerId: ReturnType<typeof signal<string | null>>;

  beforeEach(async () => {
    sessionKey = signal('preview-session');
    customerId = signal<string | null>('local-preview');
    const allowed = signal(true);
    const pending = signal(null);
    const access = {
      projectSessionKey: sessionKey.asReadonly(), canAccessProjects: allowed.asReadonly(),
      customerId: customerId.asReadonly(), pending: pending.asReadonly(), requestSignIn: vi.fn(),
    } as unknown as CustomerAccessService;
    fetchPage = vi.fn(async () => page([]));
    const service = {
      accountBacked: signal(true).asReadonly(), projects: signal<readonly Project[]>([]).asReadonly(),
      activeProject: signal<Project | null>(null).asReadonly(), error: signal<string | null>(null).asReadonly(),
      loading: signal(false).asReadonly(), fetchPage, setActive: vi.fn(async () => ({ ok: true as const })),
    } as unknown as ProjectService;
    await TestBed.configureTestingModule({
      imports: [Projects], providers: [provideRouter([]), { provide: CustomerAccessService, useValue: access },
        { provide: ProjectService, useValue: service }],
    }).compileComponents();
    fixture = TestBed.createComponent(Projects);
    fixture.detectChanges();
    await settle();
  });

  afterEach(() => { TestBed.resetTestingModule(); vi.useRealTimers(); });

  async function settle(): Promise<void> {
    await Promise.resolve();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('requests ten rows and traverses cursors with Previous and Next', async () => {
    // The initial page is controlled after setup so later calls can return distinct records.
    const first = project('preview-1', 'First page project');
    const second = project('preview-2', 'Second page project');
    fetchPage.mockReset();
    fetchPage.mockResolvedValueOnce(page([first], 'cursor-one'))
      .mockResolvedValueOnce(page([second]))
      .mockResolvedValueOnce(page([first], 'cursor-one'));

    fixture.componentInstance.refresh();
    await settle();
    expect(fetchPage).toHaveBeenLastCalledWith({ limit: 10 }, null);
    expect(fixture.nativeElement.textContent).toContain('First page project');

    fixture.componentInstance.nextPage();
    await settle();
    expect(fetchPage).toHaveBeenLastCalledWith({ limit: 10 }, 'cursor-one');
    expect(fixture.nativeElement.textContent).toContain('Second page project');
    expect(fixture.componentInstance.pageNumber()).toBe(2);

    fixture.componentInstance.previousPage();
    await settle();
    expect(fetchPage).toHaveBeenLastCalledWith({ limit: 10 }, null);
    expect(fixture.componentInstance.pageNumber()).toBe(1);
  });

  it('sends exact server filter vocabulary and resets to the first cursor', async () => {
    fetchPage.mockReset(); fetchPage.mockResolvedValue(page([]));
    fixture.componentInstance.nextCursor.set('cursor-old');
    fixture.componentInstance.cursorStack.set([null, 'cursor-old']);
    fixture.componentInstance.setSearch('  Dumaguete  ');
    fixture.componentInstance.setStatus('archived' satisfies ProjectStatus);
    fixture.componentInstance.setClassification('commercial' satisfies ProjectClassification);
    fixture.componentInstance.setConfiguration('off-grid' satisfies SystemConfiguration);
    fixture.componentInstance.setWorkScope('retrofit' satisfies WorkScope);
    await settle();

    expect(fetchPage).toHaveBeenLastCalledWith({ search: 'Dumaguete', status: 'archived', classification: 'commercial',
      configuration: 'off-grid', workScope: 'retrofit', limit: 10 }, null);
    expect(fixture.componentInstance.pageNumber()).toBe(1);
  });

  it('debounces name/location search for 250ms', async () => {
    fetchPage.mockClear();
    vi.useFakeTimers();
    fixture.componentInstance.setSearch('Old query');
    fixture.componentInstance.setSearch('Roof');
    await vi.advanceTimersByTimeAsync(249);
    expect(fetchPage).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await Promise.resolve();
    expect(fetchPage).toHaveBeenCalledTimes(1);
    expect(fetchPage).toHaveBeenCalledWith({ search: 'Roof', limit: 10 }, null);
  });

  it('keeps New project available and describes empty later pages without a global no-match claim', () => {
    const root = fixture.nativeElement as HTMLElement;
    expect([...root.querySelectorAll('button')].some(button => button.textContent?.trim() === 'New project')).toBe(true);

    fixture.componentInstance.cursorStack.set([null, 'cursor-one']);
    fixture.detectChanges();
    expect(root.textContent).toContain('No projects on this page');
    expect(root.textContent).not.toContain('No matching projects');
    expect([...root.querySelectorAll('button')].find(button => button.textContent?.trim() === 'Previous')?.disabled).toBe(false);
  });

  it('describes an empty bounded segment as continuing when the API returns a cursor', () => {
    fixture.componentInstance.nextCursor.set('cursor-next');
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.textContent).toContain('No matches in this segment');
    expect(root.textContent).toContain('The bounded search continues');
    expect(root.textContent).not.toContain('No matching projects');
    expect([...root.querySelectorAll('button')].find(button => button.textContent?.trim() === 'Next')?.disabled).toBe(false);
  });

  it('ignores a response from a previous customer session and rejects foreign page rows', async () => {
    let resolveOld!: (value: ReturnType<typeof page>) => void;
    fetchPage.mockReset();
    fetchPage.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }))
      .mockResolvedValueOnce(page([project('account-b-project', 'Current customer project', 'customer-b') ]));

    // Replace the setup request with a pending fetch, then change the identity key.
    fixture.componentInstance.refresh();
    await Promise.resolve();
    customerId.set('customer-b'); sessionKey.set('customer-b-session');
    await settle();
    resolveOld(page([project('account-a-project', 'Stale customer project', 'local-preview')]));
    await settle();
    expect(fixture.nativeElement.textContent).toContain('Current customer project');
    expect(fixture.nativeElement.textContent).not.toContain('Stale customer project');

    fetchPage.mockResolvedValueOnce(page([project('foreign-project', 'Foreign project', 'customer-a')]));
    await fixture.componentInstance.refresh();
    await settle();
    expect(fixture.nativeElement.textContent).not.toContain('Foreign project');
    expect(fixture.nativeElement.textContent).toContain('Unable to load projects');
  });
});
