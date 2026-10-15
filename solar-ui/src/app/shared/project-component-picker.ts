import { CurrencyPipe, NgComponentOutlet } from '@angular/common';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Component, inject, Injector, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ComponentDefinition } from '../core/component-bom';
import { Product, isPlanningQuantity } from '../core/models';
import { PublicCatalogService } from '../core/public-catalog.service';
import { ProjectService } from '../core/project.service';
import { CustomerAccessService } from '../core/customer-access.service';
import { pendingProduct } from '../core/project-bom';
import { projectUiRequest, projectUiSession } from './project-ui-session';
import { KtuiTable, KtuiTableColumn } from './ktui-table';
import { ProductVisualComponent } from './product-visual';
import { Tooltip } from './tooltip';
import { ToastService } from '../core/toast.service';
import { BomLineEditor } from './bom-line-editor';
import { IntegerQuantity } from './integer-quantity';
import { validAtsSpecifications } from '../core/mcb-specifications';

@Component({ selector: 'app-project-component-picker', imports: [CurrencyPipe, NgComponentOutlet, FormsModule, KtuiTable, KtuiTableColumn, ProductVisualComponent, Tooltip, IntegerQuantity], templateUrl: './project-component-picker.html' })
export class ProjectComponentPicker {
  readonly data = inject<{ projectId: string; component: ComponentDefinition }>(DIALOG_DATA);
  private readonly ref = inject<DialogRef<boolean>>(DialogRef);
  private readonly source = inject(PublicCatalogService);
  private readonly projects = inject(ProjectService);
  private readonly access = inject(CustomerAccessService);
  private readonly toast = inject(ToastService);
  readonly items = signal<readonly Product[]>([]);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly quantity = signal(1);
  readonly freeText = signal(false);
  readonly lineEditor = BomLineEditor;
  private readonly injector = inject(Injector);
  editorInjector?: Injector;
  readonly nextCursor = signal<string | null>(null);
  readonly page = signal(0);
  readonly rowKey = (product: Product) => product.id;
  private cursors: (string | null)[] = [null];
  private sequence = 0;
  private readonly requestId = projectUiRequest();
  private readonly session = projectUiSession(() => { this.sequence++; this.ref.close(); }, { cleanupOnDestroy: false });
  private readonly owner = this.session.capture();
  constructor() { void this.load(0); }
  addFreeText(): void {
    if (!this.eligible() || this.saving() || this.freeText()) return;
    this.sequence++; this.loading.set(false); this.error.set(null);
    this.editorInjector = Injector.create({ parent: this.injector, providers: [{ provide: DIALOG_DATA, useValue: {
      projectId: this.data.projectId, componentLabel: this.data.component.label, quantity: this.quantity(),
      ...(this.data.component.category ? { componentCategory: this.data.component.category } : {}),
      ...(this.data.component.protectionType ? { componentProtectionType: this.data.component.protectionType } : {}),
    } }] });
    this.freeText.set(true);
  }
  private eligible(): boolean {
    return this.session.current(this.owner) && this.projects.projects().some(p => p.id === this.data.projectId && p.customerId === this.access.customerId() && p.status === 'draft');
  }
  async load(page: number): Promise<void> {
    if (this.freeText() || this.loading() || this.saving() || !this.eligible() || !this.data.component.category || page < 0 || page >= this.cursors.length) return;
    const sequence = ++this.sequence;
    this.loading.set(true); this.error.set(null); this.items.set([]); this.nextCursor.set(null); this.page.set(page);
    try {
      const result = await (this.data.component.protectionType
        ? this.source.categoryPage(this.data.component.category, this.cursors[page], this.data.component.protectionType)
        : this.source.categoryPage(this.data.component.category, this.cursors[page]));
      if (!this.eligible() || this.freeText() || sequence !== this.sequence) return;
      this.items.set(result.items); this.nextCursor.set(result.nextCursor); this.page.set(page);
    } catch { if (this.eligible() && sequence === this.sequence) this.error.set('Unable to load equipment. Try again.'); }
    finally { if (this.eligible() && sequence === this.sequence) this.loading.set(false); }
  }
  next(): void { const cursor = this.nextCursor(); if (!cursor || this.loading() || this.saving()) return; this.cursors[this.page() + 1] = cursor; void this.load(this.page() + 1); }
  async add(product: Product): Promise<void> {
    if (!this.eligible() || this.freeText() || this.saving() || this.loading()) return;
    if (!isPlanningQuantity(this.quantity())) { this.error.set('Enter a positive whole quantity.'); return; }
    const quantity = this.quantity();
    this.saving.set(true); this.error.set(null); this.ref.disableClose = true;
    try {
      const current = await this.source.checkProduct(product.id);
      if (!this.eligible()) return;
      if (current.category !== this.data.component.category) throw new Error('Category changed.');
      if (this.data.component.protectionType && (current.protectionType !== this.data.component.protectionType || !validAtsSpecifications(current.atsSpecifications))) throw new Error('ATS rating changed or missing.');
      const pending = pendingProduct(current, quantity);
      const result = await this.projects.addProduct(this.data.projectId, pending, this.requestId([this.data.projectId, pending]));
      if (!this.eligible()) return;
      if (result.ok) { this.toast.success(current.name + ' added to project.'); this.ref.close(true); }
      else { this.error.set(result.message); this.toast.error(result.message); }
    } catch { if (this.eligible()) { const message = 'Unable to add this equipment. Review the project and retry.'; this.error.set(message); this.toast.error(message); } }
    finally { if (this.session.current(this.owner)) { this.saving.set(false); this.ref.disableClose = false; } }
  }
  close(): void { if (!this.saving()) this.ref.close(false); }
}
