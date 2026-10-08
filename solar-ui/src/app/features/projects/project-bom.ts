import { Dialog } from '@angular/cdk/dialog';
import { CurrencyPipe } from '@angular/common';
import { Component, computed, DestroyRef, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { BomItem, FreeTextBomItem } from '../../core/models';
import { projectBomCsv, projectBomRow } from '../../core/project-bom';
import { ProjectService, ProjectWriteResult } from '../../core/project.service';
import { CustomerAccessService } from '../../core/customer-access.service';
import { BomLineEditor } from '../../shared/bom-line-editor';
import { ProductDialog } from '../../shared/product-dialog';
import { Product } from '../../core/models';
import { projectUiSession } from '../../shared/project-ui-session';
import { ProductVisualComponent } from '../../shared/product-visual';

@Component({ selector: 'app-project-bom', imports: [CurrencyPipe, FormsModule, RouterLink, ProductVisualComponent], templateUrl: './project-bom.html' })
export class ProjectBomPage {
  private readonly access = inject(CustomerAccessService);
  readonly service = inject(ProjectService);
  private readonly route = inject(ActivatedRoute);
  private readonly dialog = inject(Dialog);
  private readonly destroyRef = inject(DestroyRef);
  private modal?: { close(): void };
  readonly projectId = toSignal(this.route.paramMap.pipe(map(params => params.get('projectId'))), { initialValue: null });
  readonly project = computed(() => this.access.canAccessProjects() ? this.service.projects().find(project => project.id === this.projectId() && project.customerId === this.access.customerId()) ?? null : null);
  readonly rows = computed(() => this.project()?.bom.items.map(item => projectBomRow(item, this.service.products())) ?? []);
  readonly excluded = signal<ReadonlySet<string>>(new Set());
  readonly selected = computed(() => this.rows().filter(row => this.isSelected(row.item.id)));
  readonly allChecked = computed(() => this.rows().length > 0 && this.selected().length === this.rows().length);
  readonly partial = computed(() => this.selected().length > 0 && !this.allChecked());
  readonly unpriced = computed(() => this.rows().filter(row => row.total === null).length);
  readonly storeSubtotal = computed(() => this.subtotal('store-product'));
  readonly manualSubtotal = computed(() => this.subtotal('free-text'));
  readonly quantityDrafts = signal<Partial<Record<string, number>>>({});
  readonly error = signal<string | null>(null);
  readonly message = signal('');
  readonly removing = signal<string | null>(null);
  readonly removed = signal<{ projectId: string; item: BomItem; index: number } | null>(null);
  readonly undoAvailable = computed(() => this.removed()?.projectId === this.projectId());
  readonly busy = signal(false);
  readonly loading = signal(false);
  private loadSequence = 0;
  private readonly session = projectUiSession(() => { this.clearView(); this.excluded.set(new Set()); });
  constructor() {
    effect(() => {
      const id = this.projectId(), allowed = this.access.canAccessProjects(), account = this.service.accountBacked();
      this.access.projectSessionKey();
      untracked(() => { this.clearView(); if (id && allowed && account) void this.reload(); });
    });
  }
  private clearView(): void {
    this.loadSequence++; this.modal?.close(); this.modal = undefined;
    this.busy.set(false); this.loading.set(false); this.quantityDrafts.set({});
    this.error.set(null); this.message.set(''); this.removing.set(null); this.removed.set(null);
  }
  async reload(): Promise<void> {
    const id = this.projectId();
    if (!id || !this.access.canAccessProjects() || this.busy() || this.loading()) return;
    const owner = this.session.capture(), sequence = ++this.loadSequence;
    this.loading.set(true); this.error.set(null);
    try { await this.service.loadProject(id); }
    catch { if (this.session.current(owner) && sequence === this.loadSequence && id === this.projectId()) this.error.set('Unable to load this project BOM. Review and retry.'); }
    finally { if (this.session.current(owner) && sequence === this.loadSequence) this.loading.set(false); }
  }
  private async write(action: () => ProjectWriteResult | Promise<ProjectWriteResult>, success: () => void): Promise<void> {
    if (!this.access.canAccessProjects() || this.busy() || this.loading() || this.project()?.status !== 'draft') return;
    const owner = this.session.capture(), id = this.projectId(), sequence = this.loadSequence;
    this.busy.set(true); this.error.set(null);
    const current = () => this.session.current(owner) && id === this.projectId() && sequence === this.loadSequence;
    try {
      const result = await action();
      if (!current()) return;
      this.error.set(result.ok ? null : result.message);
      if (result.ok) success();
    } catch { if (current()) this.error.set('Unable to update this BOM. Your input is preserved; review the saved project and retry.'); }
    finally { if (current()) this.busy.set(false); }
  }

  isSelected(id: string): boolean { return !this.excluded().has(`${this.projectId()}/${id}`); }
  select(id: string, selected: boolean): void {
    this.excluded.update(previous => { const next = new Set(previous); const key = `${this.projectId()}/${id}`; selected ? next.delete(key) : next.add(key); return next; });
  }
  selectAll(selected: boolean): void { for (const row of this.rows()) this.select(row.item.id, selected); }
  quantity(id: string, value: number): void { if (!this.busy()) this.quantityDrafts.update(drafts => ({ ...drafts, [id]: value })); }
  async saveQuantity(item: BomItem): Promise<void> {
    const id = this.projectId()!, quantity = this.quantityDrafts()[item.id] ?? item.quantity;
    await this.write(() => this.service.setItemQuantity(id, item.id, quantity), () => {
      this.quantityDrafts.update(drafts => { const next = { ...drafts }; delete next[item.id]; return next; });
      this.message.set(this.service.accountBacked() ? 'Quantity saved to your account.' : 'Quantity saved locally.');
    });
  }
  editor(item?: BomItem): void {
    if (!this.access.canAccessProjects() || this.busy() || this.loading()) return;
    if (this.modal || this.project()?.status !== 'draft' || (item && item.kind !== 'free-text')) return;
    const owner = this.session.capture(), id = this.projectId();
    const ref = this.dialog.open<boolean>(BomLineEditor, { data: { projectId: id, item: item as FreeTextBomItem | undefined }, width: '640px', maxWidth: 'calc(100vw - 32px)', ariaLabelledBy: 'bom-line-editor-title', panelClass: 'solar-dialog-panel', backdropClass: 'solar-dialog-backdrop' });
    this.modal = ref;
    ref.closed.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(saved => { if (this.modal === ref) this.modal = undefined; if (saved && this.session.current(owner) && id === this.projectId()) this.message.set(this.service.accountBacked() ? 'Free-text line saved to your account.' : 'Free-text line saved locally.'); });
  }
  detail(product: Product): void {
    if (this.modal) return;
    const ref = this.dialog.open(ProductDialog, { data: product, width: '520px', maxWidth: 'calc(100vw - 32px)', ariaLabelledBy: 'product-dialog-title', panelClass: 'solar-dialog-panel', backdropClass: 'solar-dialog-backdrop' });
    this.modal = ref;
    ref.closed.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => { this.modal = undefined; });
  }
  async remove(item: BomItem): Promise<void> {
    if (this.removing() !== item.id || !this.project()) return;
    const index = this.project()!.bom.items.findIndex(line => line.id === item.id);
    const id = this.projectId()!;
    await this.write(() => this.service.removeItem(id, item.id), () => { this.removed.set({ projectId: id, item, index }); this.removing.set(null); this.message.set('Line removed. Undo is available until another removal or leaving this page.'); });
  }
  async undo(): Promise<void> {
    const removed = this.removed();
    if (!removed || removed.projectId !== this.projectId()) return;
    await this.write(() => this.service.restoreItem(removed.projectId, removed.item, removed.index), () => { this.removed.set(null); this.message.set('Line restored.'); });
  }
  selectedCsv(): string { return projectBomCsv(this.selected().map(row => row.item), this.service.products()); }
  export(): void {
    if (!this.access.canAccessProjects()) return;
    if (!this.selected().length) return;
    const url = URL.createObjectURL(new Blob([this.selectedCsv()], { type: 'text/csv;charset=utf-8;' }));
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = 'solar-project-bom.csv'; document.body.appendChild(anchor); anchor.click(); anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    this.message.set('Selected lines exported as a planning list, not an order.');
  }
  private subtotal(kind: BomItem['kind']): number | null {
    const total = this.rows().filter(row => row.item.kind === kind && row.total !== null).reduce((sum, row) => sum + row.total!, 0);
    return Number.isSafeInteger(Math.round(total * 100)) ? total : null;
  }
}
