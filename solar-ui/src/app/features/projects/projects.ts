import { Dialog, DialogModule, DialogRef } from '@angular/cdk/dialog';
import { CommonModule } from '@angular/common';
import { Component, computed, DestroyRef, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import type { Project } from '../../core/models';
import { ProjectService } from '../../core/project.service';
import { CustomerAccessService } from '../../core/customer-access.service';
import { NewProjectWizard } from '../../shared/new-project-wizard';
import { CONFIGURATION_LABELS, INSTALLATION_LABELS, PROJECT_LABELS, WORK_SCOPE_LABELS } from './project-labels';
import { projectUiSession } from '../../shared/project-ui-session';
import { AddToProjectDialog } from '../../shared/add-to-project-dialog';

@Component({
  selector: 'app-projects',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, DialogModule],
  templateUrl: './projects.html',
})
export class Projects {
  readonly access = inject(CustomerAccessService);
  private readonly dialog = inject(Dialog);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  readonly service = inject(ProjectService);
  readonly search = signal('');
  readonly projects = computed(() => this.access.canAccessProjects() ? this.service.projects().filter(project => project.customerId === this.access.customerId()) : []);
  readonly activeProject = computed(() => this.access.canAccessProjects() && this.service.activeProject()?.customerId === this.access.customerId() ? this.service.activeProject() : null);
  readonly CONFIGURATION_LABELS = CONFIGURATION_LABELS;
  readonly WORK_SCOPE_LABELS = WORK_SCOPE_LABELS;
  private readonly actionError = signal<string | null>(null);
  readonly error = computed(() => this.actionError() ?? this.service.error());
  readonly filteredProjects = computed(() => {
    const query = this.search().trim().toLocaleLowerCase();
    if (!query) return this.projects();
    return this.projects().filter(project => [
      project.name, project.location ?? '', PROJECT_LABELS[project.classification],
      project.classificationOther ?? '', INSTALLATION_LABELS[project.installation],
      project.installationOther ?? '', CONFIGURATION_LABELS[project.configuration], WORK_SCOPE_LABELS[project.workScope],
    ].some(value => value.toLocaleLowerCase().includes(query)));
  });
  private wizardRef?: DialogRef<Project>;
  readonly busy = signal(false);
  private readonly session = projectUiSession(() => {
    this.wizardRef?.close(); this.wizardRef = undefined; this.busy.set(false); this.actionError.set(null); this.search.set('');
  });

  constructor() {
    this.destroyRef.onDestroy(() => this.wizardRef?.close());
    effect(() => {
      this.access.projectSessionKey();
      const allowed = this.access.canAccessProjects(), account = this.service.accountBacked();
      if (allowed && account) untracked(() => { void this.refresh(); });
    });
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
      if (project && this.session.current(owner) && project.customerId === this.access.customerId()) void this.router.navigate(['/my/projects', project.id]);
    });
  }

  async setActive(id: string | null): Promise<void> {
    if (!this.access.canAccessProjects() || this.busy()) return;
    const owner = this.session.capture();
    this.busy.set(true);
    try {
      const result = await this.service.setActive(id);
      if (this.session.current(owner)) this.actionError.set(result.ok ? null : result.message);
    } catch { if (this.session.current(owner)) this.actionError.set('Unable to update your active project. Review and retry.'); }
    finally { if (this.session.current(owner)) this.busy.set(false); }
  }

  async refresh(): Promise<void> {
    if (!this.access.canAccessProjects() || this.service.loading()) return;
    const owner = this.session.capture();
    this.actionError.set(null);
    try { await this.service.refresh(); }
    catch { if (this.session.current(owner)) this.actionError.set('Unable to load projects. Retry when the service is available.'); }
  }
  async loadMore(): Promise<void> {
    if (!this.access.canAccessProjects() || this.service.loading()) return;
    const owner = this.session.capture();
    try { await this.service.loadMore(); }
    catch { if (this.session.current(owner)) this.actionError.set('Unable to load more projects. Your loaded records are preserved.'); }
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
