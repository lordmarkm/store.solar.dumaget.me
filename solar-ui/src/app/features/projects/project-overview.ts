import { CommonModule } from '@angular/common';
import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { ProjectService } from '../../core/project.service';
import { CustomerAccessService } from '../../core/customer-access.service';
import { CONFIGURATION_LABELS, INSTALLATION_LABELS, PROJECT_LABELS, WORK_SCOPE_LABELS } from './project-labels';
import { projectUiSession } from '../../shared/project-ui-session';

@Component({
  selector: 'app-project-overview',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div>
      <a routerLink="/my/projects" class="kt-btn kt-btn-sm kt-btn-light mb-5"><i class="ki-outline ki-arrow-right rotate-180" aria-hidden="true"></i>Back to projects</a>
      @if (error()) { <div class="mb-5 border border-border bg-card px-4 py-3 text-sm text-foreground" role="alert">{{ error() }}</div> }
      @if (loading()) { <p class="kt-card mb-5 p-4 text-sm" role="status">Loading project…</p> }
      @if (service.accountBacked()) { <button type="button" class="kt-btn kt-btn-light mb-5" [disabled]="loading() || busy()" (click)="reload()">Reload / retry project</button> }
      @if (project(); as item) {
        <header class="kt-card mb-5 p-6 sm:p-8">
          <p class="eyebrow mb-2">Project overview</p>
          <div class="flex flex-wrap items-start justify-between gap-4">
            <div class="min-w-0"><h1 class="page-title break-words">{{ item.name }}</h1>@if (item.location) { <p class="mt-2 break-words text-sm text-secondary-foreground">{{ item.location }}</p> }</div>
            @if (activeProject()?.id === item.id) { <span class="kt-badge kt-badge-success shrink-0">Active project</span> }
          </div>
          <div class="mt-5 flex flex-wrap gap-3">
            @if (activeProject()?.id !== item.id && item.status === 'draft') { <button type="button" class="kt-btn kt-btn-primary" [disabled]="busy() || loading()" (click)="setActive(item.id)"><i class="ki-outline ki-check" aria-hidden="true"></i>Make active</button> }
            @else if (activeProject()?.id === item.id) { <button type="button" class="kt-btn kt-btn-light" [disabled]="busy() || loading()" (click)="setActive(null)"><i class="ki-outline ki-cross" aria-hidden="true"></i>Clear active</button> }
            <a routerLink="/catalog" class="kt-btn kt-btn-light">Browse equipment<i class="ki-outline ki-arrow-right" aria-hidden="true"></i></a>
          </div>
          @if (!activeProject()) { <p class="mt-4 text-sm text-secondary-foreground" role="status">No active project selected.</p> }
        </header>

        <section class="kt-card p-5 sm:p-6" aria-labelledby="project-details-title">
          <h2 id="project-details-title" class="text-lg font-semibold">Project details</h2>
          <dl class="mt-4 grid gap-x-6 gap-y-5 sm:grid-cols-2">
            <div><dt class="public-label text-xs text-secondary-foreground">Classification</dt><dd class="mt-1 break-words text-sm">{{ item.classification === 'other' && item.classificationOther ? 'Other · ' + item.classificationOther : classificationLabels[item.classification] }}</dd></div>
            <div><dt class="public-label text-xs text-secondary-foreground">Installation</dt><dd class="mt-1 break-words text-sm">{{ item.installation === 'other' && item.installationOther ? 'Other · ' + item.installationOther : installationLabels[item.installation] }}</dd></div>
            <div><dt class="public-label text-xs text-secondary-foreground">System configuration</dt><dd class="mt-1 break-words text-sm">{{ configurationLabels[item.configuration] }}</dd></div>
            <div><dt class="public-label text-xs text-secondary-foreground">Work scope</dt><dd class="mt-1 break-words text-sm">{{ workScopeLabels[item.workScope] }}</dd></div>
            <div><dt class="public-label text-xs text-secondary-foreground">Status</dt><dd class="mt-1 text-sm">{{ item.status === 'archived' ? 'Archived' : 'Draft' }}</dd></div>
            <div><dt class="public-label text-xs text-secondary-foreground">Equipment lines</dt><dd class="mt-1 text-sm">{{ item.bom.items.length }}</dd></div>
            @if (item.description) { <div class="sm:col-span-2"><dt class="public-label text-xs text-secondary-foreground">Description</dt><dd class="mt-1 whitespace-pre-line break-words text-sm leading-6">{{ item.description }}</dd></div> }
            @if (item.notes) { <div class="sm:col-span-2"><dt class="public-label text-xs text-secondary-foreground">Notes</dt><dd class="mt-1 whitespace-pre-line break-words text-sm leading-6">{{ item.notes }}</dd></div> }
          </dl>
        </section>
        <aside class="kt-card mt-5 border-s-2 border-primary p-5 sm:p-6" aria-labelledby="bom-next-title">
          <h2 id="bom-next-title" class="text-base font-semibold">Equipment list</h2>
          @if (item.bom.items.length === 0) { <p class="mt-2 text-sm text-secondary-foreground">This project’s equipment list is empty.</p> }
          @else { <p class="mt-2 text-sm text-secondary-foreground">{{ item.bom.items.length }} {{ item.bom.items.length === 1 ? 'equipment line' : 'equipment lines' }} in this project.</p> }
          <p class="mt-3 text-sm leading-6 text-secondary-foreground">Refine this project's store equipment and free-text requirements. {{ service.accountBacked() ? 'This planning BOM is saved to your account, not an order.' : 'This is a browser-local planning BOM, not an order.' }}</p>
          <a [routerLink]="['/my/projects', item.id, 'bom']" class="kt-btn kt-btn-primary mt-4"><i class="ki-outline ki-clipboard" aria-hidden="true"></i>Open project BOM</a>
        </aside>
      } @else if (!loading()) {
        <section class="kt-card p-8 text-center" role="status" aria-labelledby="project-not-found-title">
          <h1 id="project-not-found-title" class="text-xl font-semibold">Project not found</h1>
          <p class="mt-2 text-sm text-secondary-foreground">{{ service.accountBacked() ? 'This project may have been removed or is not available to this account. Retry its load to check.' : 'This project may have been removed or is not available in this browser.' }}</p>
          <a routerLink="/my/projects" class="kt-btn kt-btn-primary mx-auto mt-5"><i class="ki-outline ki-arrow-right rotate-180" aria-hidden="true"></i>Back to projects</a>
        </section>
      }
    </div>
  `,
})
export class ProjectOverview {
  private readonly access = inject(CustomerAccessService);
  private readonly route = inject(ActivatedRoute);
  readonly service = inject(ProjectService);
  readonly projectId = toSignal(this.route.paramMap.pipe(map(params => params.get('projectId'))), { initialValue: null });
  readonly project = computed(() => this.access.canAccessProjects() ? this.service.projects().find(item => item.id === this.projectId() && item.customerId === this.access.customerId()) ?? null : null);
  readonly activeProject = this.service.activeProject;
  private readonly actionError = signal<string | null>(null);
  readonly error = computed(() => this.actionError() ?? this.service.error());
  readonly classificationLabels = PROJECT_LABELS;
  readonly installationLabels = INSTALLATION_LABELS;
  readonly configurationLabels = CONFIGURATION_LABELS;
  readonly workScopeLabels = WORK_SCOPE_LABELS;
  readonly busy = signal(false);
  readonly loading = signal(false);
  private loadSequence = 0;
  private readonly session = projectUiSession(() => { this.loadSequence++; this.busy.set(false); this.loading.set(false); this.actionError.set(null); });

  constructor() {
    effect(() => {
      const id = this.projectId(), allowed = this.access.canAccessProjects(), account = this.service.accountBacked();
      this.access.projectSessionKey();
      if (id && allowed && account) untracked(() => {
        this.loadSequence++; this.loading.set(false); this.busy.set(false); this.actionError.set(null); void this.reload();
      });
    });
  }
  async reload(): Promise<void> {
    const id = this.projectId();
    if (!id || !this.access.canAccessProjects() || this.loading() || this.busy()) return;
    const owner = this.session.capture(), sequence = ++this.loadSequence;
    this.loading.set(true); this.actionError.set(null);
    try { await this.service.loadProject(id); }
    catch { if (this.session.current(owner) && sequence === this.loadSequence && id === this.projectId()) this.actionError.set('Unable to load this project. Review your access and retry.'); }
    finally { if (this.session.current(owner) && sequence === this.loadSequence) this.loading.set(false); }
  }
  async setActive(id: string | null): Promise<void> {
    if (!this.access.canAccessProjects() || this.busy()) return;
    const owner = this.session.capture(), projectId = this.projectId();
    this.busy.set(true);
    try {
      const result = await this.service.setActive(id);
      if (this.session.current(owner) && projectId === this.projectId()) this.actionError.set(result.ok ? null : result.message);
    } catch { if (this.session.current(owner) && projectId === this.projectId()) this.actionError.set('Unable to update the active project. Review and retry.'); }
    finally { if (this.session.current(owner) && projectId === this.projectId()) this.busy.set(false); }
  }
}
