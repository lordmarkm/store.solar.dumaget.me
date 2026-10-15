import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { afterNextRender, Component, computed, effect, ElementRef, inject, Injector, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PendingProduct, resolveProduct } from '../core/project-bom';
import { isPlanningQuantity, Project } from '../core/models';
import { ProjectService } from '../core/project.service';
import { PendingGuestList } from '../core/guest-lists';
import { NewProjectWizard } from './new-project-wizard';
import { CustomerAccessService } from '../core/customer-access.service';
import { projectUiRequest, projectUiSession } from './project-ui-session';
import { IntegerQuantity } from './integer-quantity';

@Component({
  selector: 'app-add-to-project-dialog',
  imports: [FormsModule, NewProjectWizard, IntegerQuantity],
  templateUrl: './add-to-project-dialog.html',
})
export class AddToProjectDialog {
  private readonly access = inject(CustomerAccessService);
  readonly data = inject<{ pending?: PendingProduct; guest?: PendingGuestList }>(DIALOG_DATA);
  private readonly ref = inject<DialogRef<Project>>(DialogRef);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  readonly invalidQuantity = computed(() => !isPlanningQuantity(this.quantity()));
  readonly service = inject(ProjectService);
  get product() { return this.data.pending ? resolveProduct(this.data.pending.product, this.service.products()) : undefined; }
  readonly quantity = signal(this.data.pending?.quantity ?? 1);
  readonly guestRows = this.data.guest ? this.service.currentGuestList()?.items ?? [] : [];
  guestTitle(id: string): string { const item = this.guestRows.find(i => i.id === id); return item ? resolveProduct(item.product, this.service.products())?.name ?? 'Unavailable product' : ''; }
  readonly eligible = computed(() => this.access.canAccessProjects() ? this.service.projects().filter(project => project.status === 'draft' && project.customerId === this.access.customerId()) : []);
  readonly active = computed(() => this.access.canAccessProjects() && this.service.activeProject()?.customerId === this.access.customerId() ? this.service.activeProject() : null);
  readonly selectedId = signal('');
  readonly wizard = signal(false);
  readonly error = signal<string | null>(null);
  readonly saving = signal(false);
  private readonly requestId = projectUiRequest();
  private readonly owner = this.access.projectSessionKey();
  private readonly session = projectUiSession(() => this.ref.close(), { cleanupOnDestroy: false });
  constructor() { if (this.session.current(this.owner) && this.service.accountBacked()) void this.service.refresh(); }

  async add(id: string): Promise<void> {
    if (!this.session.current(this.owner)) return;
    if (this.saving()) return;
    if (!this.validQuantity()) return;
    this.saving.set(true);
    this.ref.disableClose = true;
    try {
      const pending = this.data.guest ?? this.pending();
      const requestId = this.requestId([id, pending]);
      const result = await (this.data.guest ? this.service.copyGuestList(id, this.data.guest, requestId) : this.service.addProduct(id, this.pending(), requestId));
      if (!this.session.current(this.owner)) return;
      if (result.ok) this.ref.close(this.service.projects().find(project => project.id === id));
      else this.error.set(result.message);
    } catch { if (this.session.current(this.owner)) this.error.set('Unable to add these items. Your cart and review are preserved; retry unchanged details.'); }
    finally { if (this.session.current(this.owner)) { this.saving.set(false); this.ref.disableClose = false; } }
  }
  createNew(): void {
    if (!this.session.current(this.owner) || this.saving()) return;
    if (!this.validQuantity()) return;
    if (!this.data.guest) this.data.pending = this.pending();
    this.wizard.set(true); // Same CDK dialog and shared wizard: never stack interactive dialogs.
  }
  cancel(): void { if (!this.saving()) this.ref.close(); }
  private pending(): PendingProduct { return { ...this.data.pending!, quantity: this.quantity() }; }
  private validQuantity(): boolean {
    if (this.data.guest || isPlanningQuantity(this.quantity())) { this.error.set(null); return true; }
    this.error.set('Enter a positive safe whole quantity. Planning is not limited by stock.');
    afterNextRender(() => this.host.nativeElement.querySelector<HTMLElement>('#project-add-quantity')?.focus(), { injector: this.injector });
    return false;
  }
}
