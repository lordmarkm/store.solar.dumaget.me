import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { PendingProduct, resolveProduct } from '../core/project-bom';
import { PendingGuestList } from '../core/guest-lists';
import { afterNextRender, Component, computed, effect, ElementRef, inject, Injector, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { createNewProjectDraft, INSTALLATION_TYPES, NewProjectDraft, Project, PROJECT_CLASSIFICATIONS, SYSTEM_CONFIGURATIONS, WORK_SCOPES } from '../core/models';
import { ProjectService, validateProjectInput } from '../core/project.service';
import { CustomerAccessService } from '../core/customer-access.service';
import { CONFIGURATION_LABELS, INSTALLATION_LABELS, PROJECT_LABELS, WORK_SCOPE_LABELS } from '../features/projects/project-labels';
import { projectUiRequest, projectUiSession } from './project-ui-session';

/** A single shared dialog. Opening, canceling, and changing steps do not persist anything. */
@Component({
  selector: 'app-new-project-wizard',
  imports: [FormsModule],
  templateUrl: './new-project-wizard.html',
})
export class NewProjectWizard {
  private readonly access = inject(CustomerAccessService);
  private readonly ref = inject<DialogRef<Project>>(DialogRef);
  readonly projects = inject(ProjectService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly requestId = projectUiRequest();
  private readonly owner = this.access.projectSessionKey();
  private readonly session = projectUiSession(() => this.ref.close(), { cleanupOnDestroy: false });
  private readonly data = inject<{ pending?: PendingProduct; guest?: PendingGuestList } | null>(DIALOG_DATA, { optional: true });
  readonly pending = this.data?.pending;
  readonly guest = this.data?.guest;
  readonly guestRows = this.guest ? this.projects.currentGuestList()?.items ?? [] : [];
  guestTitle(id: string): string { const item = this.guestRows.find(i => i.id === id); return item ? resolveProduct(item.product, this.projects.products())?.name ?? `Unavailable product · ${item.product.productId}` : ''; }
  get pendingTitle(): string { return this.pending ? resolveProduct(this.pending.product, this.projects.products())?.name ?? this.pending.product.productId : ''; }
  readonly draft = signal<NewProjectDraft>(createNewProjectDraft());
  readonly step = signal(0);
  readonly attempted = signal(false);
  readonly saving = signal(false);
  readonly saveError = signal<string | null>(null);
  readonly errors = computed(() => validateProjectInput(this.draft()));
  readonly classifications = PROJECT_CLASSIFICATIONS;
  readonly installations = INSTALLATION_TYPES;
  readonly configurations = SYSTEM_CONFIGURATIONS;
  readonly scopes = WORK_SCOPES;
  readonly classificationLabels = PROJECT_LABELS;
  readonly installationLabels = INSTALLATION_LABELS;
  readonly configurationLabels = CONFIGURATION_LABELS;
  readonly scopeLabels = WORK_SCOPE_LABELS;
  readonly steps = ['Project details', 'System and work', 'Review and create'];
  constructor() { this.focusHeading(); effect(() => { if (!this.access.canAccessProjects()) this.ref.close(); }); }

  update<K extends keyof NewProjectDraft>(key: K, value: NewProjectDraft[K]): void {
    if (this.saving() || !this.session.current(this.owner)) return;
    this.draft.update(draft => ({ ...draft, [key]: value }));
    this.saveError.set(null);
  }
  error(field: keyof NewProjectDraft): string | null { return this.attempted() ? this.errors()[field] ?? null : null; }
  back(): void { if (this.saving()) return; this.step.update(step => Math.max(0, step - 1)); this.attempted.set(false); this.focusHeading(); }
  next(): void {
    if (this.saving()) return;
    this.attempted.set(true);
    const fields: (keyof NewProjectDraft)[] = this.step() === 0
      ? ['name', 'classification', 'classificationOther', 'location', 'description']
      : ['installation', 'installationOther', 'configuration', 'workScope', 'notes'];
    if (fields.some(field => this.errors()[field])) {
      afterNextRender(() => this.host.nativeElement.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(), { injector: this.injector });
      return;
    }
    this.step.update(step => Math.min(2, step + 1));
    this.attempted.set(false);
    this.focusHeading();
  }
  async create(): Promise<void> {
    if (!this.session.current(this.owner)) return;
    if (this.saving() || this.step() !== 2) return;
    if (Object.keys(this.errors()).length) { this.saveError.set('Review the required fields before creating the project.'); return; }
    this.saving.set(true);
    this.ref.disableClose = true;
    try {
      const draft = { ...this.draft() };
      const requestId = this.requestId([draft, this.guest ?? this.pending ?? null]);
      const result = await (this.guest ? this.projects.createFromGuestList(draft, requestId, this.guest) : this.projects.create(draft, requestId, this.pending));
      if (!this.session.current(this.owner)) return;
      if (result.ok) this.ref.close(result.project);
      else this.saveError.set(result.message);
    } catch { if (this.session.current(this.owner)) this.saveError.set('Unable to save the project. Your reviewed input and cart are preserved; retry unchanged details.'); }
    finally { if (this.session.current(this.owner)) { this.saving.set(false); this.ref.disableClose = false; } }
  }
  cancel(): void { if (!this.saving()) this.ref.close(); }
  private focusHeading(): void {
    afterNextRender(() => this.host.nativeElement.querySelector<HTMLElement>('#wizard-step-heading')?.focus(), { injector: this.injector });
  }
}
