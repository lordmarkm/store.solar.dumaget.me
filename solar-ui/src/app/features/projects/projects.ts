import { Dialog, DialogModule, DialogRef } from '@angular/cdk/dialog';
import { CommonModule } from '@angular/common';
import { Component, computed, DestroyRef, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { PROJECT_CLASSIFICATIONS, SYSTEM_CONFIGURATIONS, WORK_SCOPES } from '../../core/models';
import type { Project, ProjectClassification, ProjectStatus, SystemConfiguration, WorkScope } from '../../core/models';
import type { ProjectListQuery } from '../../core/account-project.service';
import { ProjectService } from '../../core/project.service';
import { CustomerAccessService } from '../../core/customer-access.service';
import { NewProjectWizard } from '../../shared/new-project-wizard';
import { CONFIGURATION_LABELS, INSTALLATION_LABELS, PROJECT_LABELS, WORK_SCOPE_LABELS } from './project-labels';
import { projectUiSession } from '../../shared/project-ui-session';
import { AddToProjectDialog } from '../../shared/add-to-project-dialog';
import { Tooltip } from '../../shared/tooltip';

@Component({
  selector: 'app-projects',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, DialogModule, Tooltip],
  templateUrl: './projects.html',
})
export class Projects {
  readonly access = inject(CustomerAccessService);
  private readonly dialog = inject(Dialog);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  readonly service = inject(ProjectService);
  readonly search = signal('');
  readonly status = signal<ProjectStatus | ''>('');
  readonly classificationFilter = signal<ProjectClassification | ''>('');
  readonly configurationFilter = signal<SystemConfiguration | ''>('');
  readonly workScopeFilter = signal<WorkScope | ''>('');
  readonly pageItems = signal<readonly Project[]>([]);
  readonly nextCursor = signal<string | null>(null);
  readonly cursorStack = signal<readonly (string | null)[]>([null]);
  readonly activeProjectId = signal<string | null>(null);
  readonly listLoading = signal(false);
  readonly listError = signal<string | null>(null);
  readonly searchPending = signal(false);
  readonly pageNumber = computed(() => this.cursorStack().length);
  readonly hasFilters = computed(() => !!(this.search().trim() || this.status() || this.classificationFilter() || this.configurationFilter() || this.workScopeFilter()));
  readonly previewMode = computed(() => !this.service.accountBacked());
  readonly projectClassifications = PROJECT_CLASSIFICATIONS;
  readonly configurations = SYSTEM_CONFIGURATIONS;
  readonly workScopes = WORK_SCOPES;
  readonly PROJECT_LABELS = PROJECT_LABELS;
  readonly CONFIGURATION_LABELS = CONFIGURATION_LABELS;
  readonly WORK_SCOPE_LABELS = WORK_SCOPE_LABELS;
  private readonly actionError = signal<string | null>(null);
  readonly error = computed(() => this.actionError() ?? this.listError() ?? this.service.error());
  readonly projects = computed(() => {
    if (!this.access.canAccessProjects()) return [];
    if (this.service.accountBacked()) return this.pageItems();
    const search = this.search().trim().toLocaleLowerCase();
    const filtered = this.service.projects().filter(project => project.customerId === this.access.customerId()
      && (!search || [project.name, project.location ?? ''].some(value => value.toLocaleLowerCase().includes(search)))
      && (!this.status() || project.status === this.status())
      && (!this.classificationFilter() || project.classification === this.classificationFilter())
      && (!this.configurationFilter() || project.configuration === this.configurationFilter())
      && (!this.workScopeFilter() || project.workScope === this.workScopeFilter()));
    const cursor = this.cursorStack().at(-1);
    const start = cursor ? Math.max(0, filtered.findIndex(project => project.id === cursor) + 1) : 0;
    return filtered.slice(start, start + this.pageSize);
  });
  readonly activeProject = computed(() => this.pageItems().find(project => project.id === this.activeProjectId()) ?? null);
  private wizardRef?: DialogRef<Project>;
  readonly busy = signal(false);
  private readonly pageSize = 10;
  private requestSequence = 0;
  private queryGeneration = 0;
  private destroyed = false;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private retryTarget: { cursor: string | null; action: 'reset' | 'next' | 'previous' | 'replace' } = { cursor: null, action: 'reset' };
  private readonly session = projectUiSession(() => {
    this.cancelDebounce(); this.queryGeneration++; this.requestSequence++;
    this.wizardRef?.close(); this.wizardRef = undefined; this.busy.set(false); this.actionError.set(null);
    this.search.set(''); this.status.set(''); this.classificationFilter.set(''); this.configurationFilter.set(''); this.workScopeFilter.set('');
    this.pageItems.set([]); this.nextCursor.set(null); this.cursorStack.set([null]); this.activeProjectId.set(null);
    this.listLoading.set(false); this.listError.set(null); this.searchPending.set(false);
  });

  constructor() {
    this.destroyRef.onDestroy(() => { this.destroyed = true; this.cancelDebounce(); this.requestSequence++; this.wizardRef?.close(); });
    effect(() => {
      this.access.projectSessionKey();
      const allowed = this.access.canAccessProjects();
      this.service.accountBacked();
      if (allowed) untracked(() => { void this.loadPage(null, 'reset'); });
    });
  }

  projectQuery(): ProjectListQuery {
    const search = this.search().trim();
    const status = this.status();
    const classification = this.classificationFilter();
    const configuration = this.configurationFilter();
    const workScope = this.workScopeFilter();
    return {
      limit: this.pageSize,
      ...(search ? { search } : {}),
      ...(status ? { status } : {}),
      ...(classification ? { classification } : {}),
      ...(configuration ? { configuration } : {}),
      ...(workScope ? { workScope } : {}),
    };
  }

  setSearch(value: string): void {
    this.cancelDebounce();
    this.search.set(value.slice(0, 120));
    const generation = this.resetQueryState();
    if (!this.access.canAccessProjects()) return;
    this.searchPending.set(true);
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null; this.searchPending.set(false);
      if (generation === this.queryGeneration) void this.loadPage(null, 'reset', generation);
    }, 250);
  }

  setStatus(value: ProjectStatus | ''): void { this.status.set(value); this.applyImmediateFilter(); }
  setClassification(value: ProjectClassification | ''): void { this.classificationFilter.set(value); this.applyImmediateFilter(); }
  setConfiguration(value: SystemConfiguration | ''): void { this.configurationFilter.set(value); this.applyImmediateFilter(); }
  setWorkScope(value: WorkScope | ''): void { this.workScopeFilter.set(value); this.applyImmediateFilter(); }

  clearFilters(): void {
    this.cancelDebounce(); this.search.set(''); this.status.set(''); this.classificationFilter.set('');
    this.configurationFilter.set(''); this.workScopeFilter.set('');
    const generation = this.resetQueryState();
    if (this.access.canAccessProjects()) void this.loadPage(null, 'reset', generation);
  }

  private applyImmediateFilter(): void {
    this.cancelDebounce();
    const generation = this.resetQueryState();
    if (this.access.canAccessProjects()) void this.loadPage(null, 'reset', generation);
  }

  private resetQueryState(): number {
    this.queryGeneration++; this.requestSequence++;
    this.cursorStack.set([null]); this.nextCursor.set(null); this.pageItems.set([]); this.listError.set(null);
    this.activeProjectId.set(null); this.listLoading.set(false);
    return this.queryGeneration;
  }

  private cancelDebounce(): void {
    if (this.debounceTimer !== null) clearTimeout(this.debounceTimer);
    this.debounceTimer = null; this.searchPending.set(false);
  }

  private async loadPage(cursor: string | null, action: 'reset' | 'next' | 'previous' | 'replace', generation = this.queryGeneration): Promise<void> {
    if (!this.access.canAccessProjects() || this.destroyed || generation !== this.queryGeneration || this.listLoading()) return;
    const sequence = ++this.requestSequence;
    const owner = this.session.capture();
    const customerId = this.access.customerId();
    const accountBacked = this.service.accountBacked();
    const query = this.projectQuery();
    const isCurrent = () => !this.destroyed && sequence === this.requestSequence && generation === this.queryGeneration
      && this.session.current(owner) && this.access.customerId() === customerId && this.service.accountBacked() === accountBacked;
    this.retryTarget = { cursor, action };
    this.listLoading.set(true); this.listError.set(null);
    try {
      const page = await this.service.fetchPage(query, cursor);
      if (!isCurrent()) return;
      if (page.items.length > this.pageSize || page.items.some(project => project.customerId !== customerId)) throw new Error('The project page did not match the current customer.');
      this.pageItems.set(page.items);
      this.nextCursor.set(page.nextCursor);
      this.activeProjectId.set(page.activeProjectId);
      if (action === 'reset') this.cursorStack.set([null]);
      else if (action === 'next') this.cursorStack.update(stack => [...stack, cursor]);
      else if (action === 'previous') this.cursorStack.update(stack => stack.slice(0, -1));
    } catch {
      if (isCurrent()) this.listError.set('Unable to load projects for these filters. Retry to continue your search.');
    } finally { if (isCurrent()) this.listLoading.set(false); }
  }

  retry(): void {
    if (this.listLoading()) return;
    const { cursor, action } = this.retryTarget;
    void this.loadPage(cursor, action);
  }

  refresh(): Promise<void> {
    if (!this.access.canAccessProjects() || this.listLoading()) return Promise.resolve();
    return this.loadPage(this.cursorStack().at(-1) ?? null, 'replace');
  }

  private refreshFirstPage(): Promise<void> {
    this.requestSequence++; this.listLoading.set(false);
    return this.loadPage(null, 'reset');
  }

  nextPage(): void {
    const cursor = this.nextCursor();
    if (cursor && !this.listLoading()) void this.loadPage(cursor, 'next');
  }

  previousPage(): void {
    const stack = this.cursorStack();
    if (stack.length > 1 && !this.listLoading()) void this.loadPage(stack[stack.length - 2]!, 'previous');
  }

  newProject(): void {
    if (!this.access.canAccessProjects()) { void this.access.requestSignIn(); return; }
    if (this.wizardRef) return;
    const owner = this.session.capture();
    const ref = this.dialog.open<Project>(NewProjectWizard, {
      width: '640px', maxWidth: 'calc(100vw - 32px)', ariaLabelledBy: 'new-project-wizard-title',
      panelClass: 'solar-dialog-panel', backdropClass: 'solar-dialog-backdrop',
    });
    this.wizardRef = ref;
    ref.closed.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(project => {
      if (this.wizardRef === ref) this.wizardRef = undefined;
      if (project && this.session.current(owner) && project.customerId === this.access.customerId()) {
        void (async () => { await this.refreshFirstPage(); if (this.session.current(owner)) await this.router.navigate(['/my/projects', project.id]); })();
      }
    });
  }

  async setActive(id: string | null): Promise<void> {
    if (!this.access.canAccessProjects() || this.busy()) return;
    const owner = this.session.capture();
    this.busy.set(true);
    try {
      const result = await this.service.setActive(id);
      if (this.session.current(owner)) {
        this.actionError.set(result.ok ? null : result.message);
        if (result.ok) await this.refresh();
      }
    } catch { if (this.session.current(owner)) this.actionError.set('Unable to update your active project. Review and retry.'); }
    finally { if (this.session.current(owner)) this.busy.set(false); }
  }

  reviewPending(): void {
    const pending = this.access.pending();
    if (!pending || pending.kind === 'route' || !this.access.canAccessProjects() || this.wizardRef) return;
    const ref = this.dialog.open<Project>(AddToProjectDialog, {
      data: pending.kind === 'guest-list' ? { guest: pending.guest } : { pending: pending.pending },
      width: '640px', maxWidth: 'calc(100vw - 32px)', ariaLabel: 'Review retained project request',
      panelClass: 'solar-dialog-panel', backdropClass: 'solar-dialog-backdrop',
    });
    this.wizardRef = ref;
    ref.closed.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => { if (this.wizardRef === ref) this.wizardRef = undefined; });
  }

  classification(project: Project): string {
    return project.classification === 'other' && project.classificationOther?.trim()
      ? `Other · ${project.classificationOther}` : PROJECT_LABELS[project.classification];
  }

  installation(project: Project): string {
    return project.installation === 'other' && project.installationOther?.trim()
      ? `Other · ${project.installationOther}` : INSTALLATION_LABELS[project.installation];
  }
}
