import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Component, ElementRef, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CustomerAccessService } from '../../core/customer-access.service';
import { NewProjectDraft, Project, ProjectDetails, PROJECT_CLASSIFICATIONS, INSTALLATION_TYPES, SYSTEM_CONFIGURATIONS, WORK_SCOPES } from '../../core/models';
import { ProjectService, validateProjectInput } from '../../core/project.service';
import { ToastService } from '../../core/toast.service';
import { projectUiRequest, projectUiSession } from '../../shared/project-ui-session';
import { CONFIGURATION_LABELS, INSTALLATION_LABELS, PROJECT_LABELS, WORK_SCOPE_LABELS } from './project-labels';

@Component({ selector: 'app-project-details-dialog', standalone: true, imports: [FormsModule], templateUrl: './project-details-dialog.html' })
export class ProjectDetailsDialog {
  private readonly access = inject(CustomerAccessService);
  readonly data = inject<{ project: Project & { readonly version?: number } }>(DIALOG_DATA);
  readonly ref = inject<DialogRef<boolean>>(DialogRef);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly service = inject(ProjectService);
  private readonly toast = inject(ToastService);
  private readonly owner = this.access.projectSessionKey();
  private readonly session = projectUiSession(() => this.ref.close(), { cleanupOnDestroy: false });
  private readonly requestId = projectUiRequest();

  readonly classifications = PROJECT_CLASSIFICATIONS;
  readonly installations = INSTALLATION_TYPES;
  readonly configurations = SYSTEM_CONFIGURATIONS;
  readonly scopes = WORK_SCOPES;
  readonly classificationLabels = PROJECT_LABELS;
  readonly installationLabels = INSTALLATION_LABELS;
  readonly configurationLabels = CONFIGURATION_LABELS;
  readonly scopeLabels = WORK_SCOPE_LABELS;
  readonly draft = signal<NewProjectDraft>(this.seed(this.data.project));
  readonly attempted = signal(false);
  readonly saving = signal(false);
  readonly saveError = signal<string | null>(null);

  update<K extends keyof NewProjectDraft>(key: K, value: NewProjectDraft[K]): void {
    if (this.saving() || !this.session.current(this.owner)) return;
    this.draft.update(current => ({ ...current, [key]: value }));
    this.saveError.set(null);
  }
  error(field: keyof NewProjectDraft): string | null {
    return this.attempted() ? validateProjectInput(this.draft())[field] ?? null : null;
  }
  async save(): Promise<void> {
    if (!this.session.current(this.owner) || this.saving()) return;
    this.attempted.set(true);
    const draft = this.normalizedDraft();
    if (Object.keys(validateProjectInput(draft)).length) {
      this.saveError.set('Review the highlighted fields before saving.');
      if (this.session.current(this.owner)) this.toast.error('Review the highlighted fields before saving.');
      queueMicrotask(() => this.host.nativeElement.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return;
    }
    this.saving.set(true);
    this.ref.disableClose = true;
    try {
      const result = await this.service.updateProject(this.data.project.id, draft, this.requestId([this.data.project.id, this.data.project.version, draft]), this.data.project.version);
      if (!this.session.current(this.owner)) return;
      if (result.ok) this.ref.close(true);
      else {
        const message = this.withReload(result.message);
        this.saveError.set(message);
        this.toast.error(message);
      }
    } catch {
      if (this.session.current(this.owner)) {
        const message = 'Unable to save project details. Your edits are retained; retry unchanged details or reload this project if it changed elsewhere.';
        this.saveError.set(message);
        this.toast.error(message);
      }
    } finally {
      if (this.session.current(this.owner)) { this.saving.set(false); this.ref.disableClose = false; }
    }
  }
  cancel(): void { if (!this.saving()) this.ref.close(false); }
  private seed(project: Project): NewProjectDraft {
    return {
      name: project.name, classification: project.classification, installation: project.installation,
      configuration: project.configuration, workScope: project.workScope,
      ...(project.classificationOther !== undefined ? { classificationOther: project.classificationOther } : {}),
      ...(project.installationOther !== undefined ? { installationOther: project.installationOther } : {}),
      ...(project.location !== undefined ? { location: project.location } : {}),
      ...(project.description !== undefined ? { description: project.description } : {}),
      ...(project.notes !== undefined ? { notes: project.notes } : {}),
    };
  }
  private normalizedDraft(): NewProjectDraft {
    const value = this.draft();
    const clean = (text?: string) => text?.trim() || undefined;
    const details: ProjectDetails = {
      name: value.name.trim(), classification: value.classification!, installation: value.installation,
      configuration: value.configuration!, workScope: value.workScope!,
      ...(value.classification === 'other' && clean(value.classificationOther) ? { classificationOther: clean(value.classificationOther) } : {}),
      ...(value.installation === 'other' && clean(value.installationOther) ? { installationOther: clean(value.installationOther) } : {}),
      ...(clean(value.location) ? { location: clean(value.location) } : {}),
      ...(clean(value.description) ? { description: clean(value.description) } : {}),
      ...(clean(value.notes) ? { notes: clean(value.notes) } : {}),
    };
    return details;
  }
  private withReload(message: string): string {
    return /conflict|changed|version/i.test(message) ? `${message} Your edits are retained; reload this project before retrying.` : message;
  }
}
