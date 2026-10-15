import { CurrencyPipe } from '@angular/common';
import { Component, computed, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Dialog } from '@angular/cdk/dialog';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { BomService } from '../../core/bom.service';
import { NoticeService } from '../../core/notice.service';
import { Tooltip } from '../../shared/tooltip';
import { ProductVisualComponent } from '../../shared/product-visual';
import { AddToProjectDialog } from '../../shared/add-to-project-dialog';
import { EquipmentListHistoryDialog } from '../../shared/equipment-list-history-dialog';
import { guestListFingerprint } from '../../core/guest-lists';
import { Project } from '../../core/models';
import { CustomerAccessService } from '../../core/customer-access.service';
import { Router } from '@angular/router';
import { projectUiSession } from '../../shared/project-ui-session';
import { IntegerQuantity } from '../../shared/integer-quantity';

@Component({
  selector: 'app-bom',
  imports: [CurrencyPipe, FormsModule, RouterLink, Tooltip, ProductVisualComponent, IntegerQuantity],
  templateUrl: './bom.html',
})
export class Bom {
  readonly access = inject(CustomerAccessService);
  private readonly router = inject(Router);
  readonly bom = inject(BomService);
  private readonly notice = inject(NoticeService);
  private readonly dialog = inject(Dialog);
  private readonly destroy = inject(DestroyRef);
  private modal: { close(): void } | undefined;
  private readonly session = projectUiSession(() => { this.modal?.close(); this.modal = undefined; });
  readonly linkedProject = computed(() => {
    const list = this.bom.currentList();
    if (!this.access.canAccessProjects() || list?.state !== 'linked' || list.copyReceipt.customerId !== this.access.customerId()) return null;
    return this.bom.projects.projects().find(p => p.id === list.copyReceipt.projectId && p.customerId === this.access.customerId()) ?? null;
  });
  readonly linkedProjectId = computed(() => {
    const list = this.bom.currentList();
    return this.access.canAccessProjects() && list?.state === 'linked' && list.copyReceipt.customerId === this.access.customerId() ? list.copyReceipt.projectId : null;
  });
  readonly copyHint = computed(() => this.bom.currentList()?.state === 'linked' ? 'This cart was already copied once. Later edits do not sync. Start a new cart to copy again.' : !this.bom.lineCount() ? 'Add equipment before copying a cart.' : this.bom.projects.accountBacked() ? 'Review all rows and the destination. A successful copy saves separate account BOM lines and links the local cart once.' : 'Copies every row once as separate lines to a browser-local preview project.');
  constructor() { this.destroy.onDestroy(() => this.modal?.close()); }
  addToProject(): void {
    const list = this.bom.currentList();
    if (this.modal || !list || list.state !== 'unlinked' || !list.items.length) return;
    if (!this.access.canAccessProjects()) { void this.access.requestSignIn({ kind: 'guest-list', returnUrl: this.router.url, guest: { listId: list.id, fingerprint: guestListFingerprint(list) } }); return; }
    const owner = this.session.capture();
    const ref = this.dialog.open<Project>(AddToProjectDialog, { data: { guest: { listId: list.id, fingerprint: guestListFingerprint(list) } }, width: '640px', maxWidth: 'calc(100vw - 32px)', panelClass: 'solar-dialog-panel', backdropClass: 'solar-dialog-backdrop', ariaLabel: 'Add cart to project' });
    this.modal = ref;
    ref.closed.pipe(takeUntilDestroyed(this.destroy)).subscribe(project => { if (this.modal === ref) this.modal = undefined; if (project && this.session.current(owner) && project.customerId === this.access.customerId()) this.notice.show('Cart linked. Later edits do not sync; your active project is unchanged.'); });
  }
  listDialog(mode: 'history' | 'start-new'): void {
    if (this.modal) return;
    const ref = this.dialog.open<boolean>(EquipmentListHistoryDialog, { data: { mode }, width: '640px', maxWidth: 'calc(100vw - 32px)', panelClass: 'solar-dialog-panel', backdropClass: 'solar-dialog-backdrop', ariaLabel: mode === 'history' ? 'Cart history' : 'Start new cart' });
    this.modal = ref;
    ref.closed.pipe(takeUntilDestroyed(this.destroy)).subscribe(changed => { this.modal = undefined; if (changed) this.notice.show(mode === 'history' ? 'Cart reopened. Existing links are retained.' : 'New empty cart started. Previous contents and links remain in history.'); });
  }
  setQuantity(id: string, value: string | number): void {
    if (!this.bom.setQuantity(id, Number(value))) this.notice.show(this.bom.error() ?? 'Enter a positive whole quantity within the supported numeric range.');
  }
  export(): void {
    if (!this.bom.lineCount()) return;
    const rows = [['SKU / reference', 'Product', 'Quantity', 'Unit price PHP', 'Total PHP', 'Tax treatment'], ...this.bom.lines().map(line => [line.product.sku, line.product.name, line.quantity, line.unitPrice, line.total, line.product.source === 'published' ? 'Unspecified' : 'Sample VAT included']), ...this.bom.unavailable().map(item => [item.productId, 'Unavailable product - pricing unknown', item.quantity, '', '', 'Unknown'])];
    const csv = rows.map(row => row.map(value => {
      const text = String(value);
      const safe = typeof value === 'string' && /^[\s]*[=+\-@]/.test(text) ? "'" + text : text;
      return `"${safe.replaceAll('"', '""')}"`;
    }).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8;' }));
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = 'solar-draft-bom.csv';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    this.notice.show('Cart exported. Catalog pricing is an estimate; tax and availability need confirmation. Unavailable products are unpriced.');
  }
}
