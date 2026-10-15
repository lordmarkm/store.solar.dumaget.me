import { DIALOG_DATA, Dialog, DialogRef } from '@angular/cdk/dialog';
import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, DestroyRef, HostListener, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NavigationCancel, NavigationEnd, NavigationStart, Router } from '@angular/router';
import { firstValueFrom, take } from 'rxjs';
import { AdminAccessService } from '../../core/admin-access.service';
import { AdminCatalogApiService } from '../../core/admin-catalog-api.service';
import type { AdminSupplier } from '../../core/admin-catalog.models';
import { AuthSessionService } from '../../core/auth-session.service';
import { InventoryApiService } from '../../core/inventory-api.service';
import type { InventoryCountInput, InventoryLocation, InventoryManualMovementKind, InventoryMovement, InventoryProductFilters, InventoryRow, InventorySettingsInput, InventoryStockInput, InventoryStockStatus, InventoryTransferInput } from '../../core/inventory.models';
import { inventoryMovementsCsv, inventoryRowsCsv } from '../../core/inventory-csv';
import { StoreApiError } from '../../core/store-api.service';
import { ToastService } from '../../core/toast.service';
import { Tooltip } from '../../shared/tooltip';
import { KtuiTable, KtuiTableColumn } from '../../shared/ktui-table';
import { ProductVisualComponent } from '../../shared/product-visual';
import { InventoryMovementDialog, type InventoryMovementDialogData } from './inventory-movement-dialog';

import { PRODUCT_CATEGORIES } from '../../core/product-categories';
const CATEGORIES = PRODUCT_CATEGORIES;
const KINDS: readonly InventoryManualMovementKind[] = ['opening', 'receipt', 'issue', 'return', 'damage', 'correction'];
const CONFIRM_KINDS: readonly InventoryManualMovementKind[] = ['issue', 'damage', 'correction'];
interface Fence { generation: number; revision: number; uid: string; route: string }
interface StockDraft { kind: InventoryManualMovementKind; quantity: number; reason: string; observedAt: string }
interface CountDraft { countedQuantity: number; reason: string; observedAt: string }
interface TransferDraft { destinationLocationId: string; quantity: number; reason: string; observedAt: string }
interface SettingsDraft { reorderPoint: number | null }
/** Keep a nested dirty-form prompt owned by its parent, including auth resets. */
function inventoryDiscardGuard(close: () => void): () => void {
  const dialog = inject(Dialog), destroy = inject(DestroyRef);
  let confirmation: DialogRef<boolean> | null = null;
  destroy.onDestroy(() => { confirmation?.close(false); confirmation = null; });
  return () => {
    if (confirmation) return;
    const ref = dialog.open<boolean>(InventoryDiscardDialog, {
      width: '440px', maxWidth: 'calc(100vw - 32px)', ariaLabelledBy: 'inventory-discard-heading',
      panelClass: 'solar-dialog-panel', backdropClass: 'solar-dialog-backdrop',
    });
    confirmation = ref;
    ref.closed.pipe(take(1)).subscribe(discard => {
      if (confirmation === ref) confirmation = null;
      if (discard) close();
    });
  };
}
function localDateTime(): string { const date = new Date(Date.now() - new Date().getTimezoneOffset() * 60_000); return date.toISOString().slice(0, 16); }
function isoFromLocal(value: string): string | null { const date = new Date(value); return Number.isFinite(date.getTime()) ? date.toISOString() : null; }
function safeError(error: unknown): string {
  if (!(error instanceof StoreApiError)) return 'The inventory service is unavailable. Retry the same request to safely check its result.';
  switch (error.code) {
    case 'unauthorized': case 'session-changed': return 'Your admin session changed. Reload inventory after access is restored.';
    case 'forbidden': return 'Your account is no longer authorized for inventory changes.';
    case 'not-found': return 'The selected product or location is no longer available. Reload the list.';
    case 'conflict': return 'Inventory or product details changed. Reload the row before trying again.';
    case 'invalid-input': return 'Review the entered values and try again.';
    case 'invalid-response': return 'The inventory service returned data that could not be safely displayed.';
    default: return 'The inventory service is unavailable. Retry the same request to safely check its result.';
  }
}

@Component({ selector: 'app-inventory-discard-dialog', template: `
  <section class="bg-card text-foreground"><header class="border-b border-border px-6 py-5"><h2 id="inventory-discard-heading" class="text-xl font-semibold">Discard inventory changes?</h2></header>
    <p class="px-6 py-5 text-sm leading-6">Unsaved inventory form changes will be discarded. No stock change has been submitted.</p>
    <footer class="flex flex-wrap justify-end gap-3 border-t border-border px-6 py-4"><button type="button" class="kt-btn kt-btn-light" (click)="ref.close(false)">Keep editing</button>
      <button type="button" class="kt-btn kt-btn-light" (click)="ref.close(true)">Discard changes</button></footer></section>` })
export class InventoryDiscardDialog { readonly ref = inject<DialogRef<boolean>>(DialogRef); }

@Component({ selector: 'app-inventory-stock-dialog', imports: [FormsModule], template: `
  <section class="bg-card text-foreground"><header class="border-b border-border px-6 py-5">
    <p class="eyebrow mb-2">{{ data.product.sku }} · {{ data.location.code }}</p>
    <h2 id="inventory-stock-heading" class="text-xl font-semibold">{{ kind === 'receipt' ? 'Receive stock' : kindLabel(kind) }}</h2>
    <p class="mt-2 text-sm text-secondary-foreground">{{ data.product.name }} · {{ data.product.unitCode || 'Unit not set' }}</p>
  </header><form class="grid gap-4 px-6 py-5" (ngSubmit)="submit()" novalidate>
    <div><label for="movement-kind" class="mb-2 block text-xs font-medium">Movement<span class="solar-required-marker" aria-hidden="true">*</span></label>
      <select id="movement-kind" aria-required="true" name="kind" class="kt-select w-full" [(ngModel)]="kind" [disabled]="!data.balance">
      @for (item of kinds; track item) { @if (data.balance ? item !== 'opening' : item === 'opening') { <option [value]="item">{{ kindLabel(item) }}</option> } }
      </select>@if (!data.balance) { <p class="mt-1 text-xs text-secondary-foreground">Opening balance records the first physical count for this product at this location.</p> }</div>
    <div><label for="movement-quantity" class="mb-2 block text-xs font-medium">{{ kind === 'correction' ? 'Signed change' : 'Quantity' }} ({{ data.product.unitCode || 'unit' }})<span class="solar-required-marker" aria-hidden="true">*</span></label>
      <input id="movement-quantity" name="quantity" class="kt-input w-full" type="number" [min]="kind === 'correction' ? -1000000000 : 0" max="1000000000" step="1" [(ngModel)]="quantity" required />
      <p class="mt-1 text-xs text-secondary-foreground">Whole units only, up to 1,000,000,000. {{ kind === 'correction' ? 'Use a negative number to reduce stock.' : '' }}</p></div>
    <div><label for="movement-reason" class="mb-2 block text-xs font-medium">Reason<span class="solar-required-marker" aria-hidden="true">*</span></label><input id="movement-reason" name="reason" class="kt-input w-full" maxlength="500" [(ngModel)]="reason" required /></div>
    <div><label for="movement-observed" class="mb-2 block text-xs font-medium">Observed at<span class="solar-required-marker" aria-hidden="true">*</span></label><input id="movement-observed" name="observedAt" class="kt-input w-full" type="datetime-local" [(ngModel)]="observedAt" required />
      <p class="mt-1 text-xs text-secondary-foreground">Defaults to now. Future observations over five minutes are rejected.</p></div>
    @if (error()) { <p class="text-sm text-destructive" role="alert">{{ error() }}</p> }
    <footer class="flex flex-wrap justify-end gap-3 border-t border-border pt-4"><button type="button" class="kt-btn kt-btn-light" (click)="cancel()">Cancel</button>
      <button type="submit" class="kt-btn kt-btn-light" [disabled]="!valid">{{ kind === 'receipt' ? 'Receive stock' : 'Review stock change' }}</button></footer>
  </form></section>` })
export class InventoryStockDialog {
  readonly ref = inject<DialogRef<StockDraft | null>>(DialogRef);
  readonly data = inject<{ product: InventoryRow['product']; location: InventoryLocation; balance: InventoryRow['balance'] }>(DIALOG_DATA);
  private readonly dialog = inject(Dialog);
  private readonly destroyRef = inject(DestroyRef);
  private discardRef: DialogRef<boolean> | null = null;
  readonly kinds = KINDS;
  kind: InventoryManualMovementKind = this.data.balance ? 'receipt' : 'opening';
  quantity: number | null = null;
  reason = '';
  observedAt = localDateTime();
  readonly error = signal('');
  private readonly initialObservedAt = this.observedAt;
  constructor() { this.destroyRef.onDestroy(() => { this.discardRef?.close(false); this.discardRef = null; }); }
  get valid(): boolean {
    const amount = this.quantity;
    if (amount === null || !Number.isSafeInteger(amount) || Math.abs(amount) > 1_000_000_000) return false;
    if (this.kind === 'opening' ? !!this.data.balance || amount < 0 : !this.data.balance || (this.kind === 'correction' ? amount === 0 : amount <= 0)) return false;
    const observed = isoFromLocal(this.observedAt);
    return !!this.reason.trim() && this.reason.length <= 500 && !/[\u0000-\u001f\u007f]/.test(this.reason) && !!observed && Date.parse(observed) <= Date.now() + 300_000;
  }
  kindLabel(kind: InventoryManualMovementKind): string { return ({ opening: 'Opening balance', receipt: 'Receipt', issue: 'Issue', return: 'Return', damage: 'Damage', correction: 'Correction' })[kind]; }
  submit(): void {
    if (!this.valid) { this.error.set('Enter a valid whole quantity, reason, and observation time.'); return; }
    const observedAt = isoFromLocal(this.observedAt);
    if (observedAt && this.quantity !== null) this.ref.close({ kind: this.kind, quantity: this.quantity, reason: this.reason.trim(), observedAt });
  }
  cancel(): void {
    if (this.quantity === null && !this.reason && this.observedAt === this.initialObservedAt) { this.ref.close(null); return; }
    this.discardRef = this.dialog.open<boolean>(InventoryDiscardDialog, { width: '440px', maxWidth: 'calc(100vw - 32px)', ariaLabelledBy: 'inventory-discard-heading', panelClass: 'solar-dialog-panel', backdropClass: 'solar-dialog-backdrop' });
    this.discardRef.closed.pipe(take(1)).subscribe(discard => { this.discardRef = null; if (discard) this.ref.close(null); });
  }
}

@Component({ selector: 'app-inventory-count-dialog', imports: [FormsModule], template: `
  <section class="flex max-h-[calc(100dvh-32px)] min-h-0 flex-col bg-card text-foreground"><header class="shrink-0 border-b border-border px-6 py-5"><p class="eyebrow mb-2">{{ data.product.sku }} · {{ data.location.code }}</p><h2 id="inventory-count-heading" class="text-xl font-semibold">Physical count</h2><p class="mt-2 text-sm text-secondary-foreground">{{ data.product.name }} · {{ data.location.name }} · {{ data.product.unitCode }}</p></header>
    <form class="grid min-h-0 max-h-[calc(100dvh-180px)] gap-4 overflow-y-auto px-6 py-5" (ngSubmit)="review()" novalidate>
      <div><label for="count-quantity" class="mb-2 block text-xs font-medium">Actual quantity ({{ data.product.unitCode }})<span class="solar-required-marker" aria-hidden="true">*</span></label><input id="count-quantity" name="countedQuantity" class="kt-input w-full" type="number" min="0" max="1000000000" step="1" [(ngModel)]="countedQuantity" [disabled]="reviewing" required><p class="mt-1 text-xs text-secondary-foreground">Enter a whole number from 0 to 1,000,000,000. Zero is an explicit count.</p></div>
      <div><label for="count-reason" class="mb-2 block text-xs font-medium">Reason<span class="solar-required-marker" aria-hidden="true">*</span></label><input id="count-reason" name="reason" class="kt-input w-full" maxlength="500" [(ngModel)]="reason" [disabled]="reviewing" required></div>
      <div><label for="count-observed" class="mb-2 block text-xs font-medium">Observed at<span class="solar-required-marker" aria-hidden="true">*</span></label><input id="count-observed" name="observedAt" class="kt-input w-full" type="datetime-local" [(ngModel)]="observedAt" [disabled]="reviewing" required></div>
      @if (reviewing) { <div class="rounded-md border border-border bg-muted p-4 text-sm"><p class="font-semibold">Review count before recording</p><p class="mt-2">{{ data.balance ? (data.balance.onHand + ' ' + data.balance.unitCode) : 'Unknown' }} → {{ countedQuantity }} {{ data.product.unitCode }}</p><p class="mt-1 text-secondary-foreground">{{ data.balance ? 'Change: ' + delta : 'Opening count; no previous balance' }} {{ data.balance ? data.product.unitCode : '' }}</p></div> }
      @if (error) { <p class="text-sm text-destructive" role="alert">{{ error }}</p> }
      <footer class="sticky bottom-0 flex flex-wrap justify-end gap-3 border-t border-border bg-card pt-4"><button type="button" class="kt-btn kt-btn-light" (click)="cancel()">Cancel</button>@if (!reviewing) { <button type="submit" class="kt-btn kt-btn-light" [disabled]="!valid">Review count</button> } @else { <button type="button" class="kt-btn kt-btn-light" (click)="reviewing = false">Edit count</button><button type="button" class="kt-btn kt-btn-light" (click)="confirm()">Confirm physical count</button> }</footer>
    </form></section>` })
export class InventoryCountDialog {
  readonly ref = inject<DialogRef<CountDraft | null>>(DialogRef);
  readonly data = inject<{ product: InventoryRow['product']; location: InventoryLocation; balance: InventoryRow['balance'] }>(DIALOG_DATA);
  private readonly discard = inventoryDiscardGuard(() => this.ref.close(null));
  countedQuantity: number | null = null; reason = ''; observedAt = localDateTime(); reviewing = false; error = '';
  private readonly initialObservedAt = this.observedAt;
  get valid(): boolean { const at = isoFromLocal(this.observedAt); return this.countedQuantity !== null && Number.isSafeInteger(this.countedQuantity) && this.countedQuantity >= 0 && this.countedQuantity <= 1_000_000_000 && !!this.reason.trim() && this.reason.trim().length <= 500 && !/[\u0000-\u001f\u007f]/.test(this.reason) && !!at && Date.parse(at) <= Date.now() + 300_000; }
  get delta(): string { return this.countedQuantity === null || !this.data.balance ? '' : (this.countedQuantity - this.data.balance.onHand > 0 ? '+' : '') + (this.countedQuantity - this.data.balance.onHand); }
  review(): void { if (!this.valid) { this.error = 'Enter a valid whole quantity, reason, and observation time.'; return; } this.error = ''; this.reviewing = true; }
  confirm(): void { if (!this.valid) return; const observedAt = isoFromLocal(this.observedAt); if (observedAt && this.countedQuantity !== null) this.ref.close({ countedQuantity: this.countedQuantity, reason: this.reason.trim(), observedAt }); }
  cancel(): void { if (this.countedQuantity === null && !this.reason && this.observedAt === this.initialObservedAt) { this.ref.close(null); return; } this.discard(); }
}

@Component({ selector: 'app-inventory-transfer-dialog', imports: [FormsModule], template: `
  <section class="flex max-h-[calc(100dvh-32px)] min-h-0 flex-col bg-card text-foreground"><header class="shrink-0 border-b border-border px-6 py-5"><p class="eyebrow mb-2">{{ data.product.sku }} · {{ data.source.code }}</p><h2 id="inventory-transfer-heading" class="text-xl font-semibold">Transfer stock</h2><p class="mt-2 text-sm text-secondary-foreground">{{ data.product.name }} · {{ data.product.unitCode }}</p></header>
    <form class="grid min-h-0 max-h-[calc(100dvh-180px)] gap-4 overflow-y-auto px-6 py-5" (ngSubmit)="review()" novalidate>
      <div><label for="transfer-destination" class="mb-2 block text-xs font-medium">Destination location<span class="solar-required-marker" aria-hidden="true">*</span></label><select id="transfer-destination" aria-required="true" name="destination" class="kt-select w-full" [(ngModel)]="destinationLocationId" (ngModelChange)="data.loadDestination($event)" [disabled]="reviewing"><option value="">Choose a location</option>@for (location of data.locations(); track location.id) { @if (location.status === 'active' && location.id !== data.source.id) { <option [value]="location.id">{{ location.code }} · {{ location.name }}</option> } }</select>
        @if (data.locationCursor()) { <button type="button" class="kt-btn kt-btn-light kt-btn-sm mt-2" (click)="data.loadMoreLocations()" [disabled]="data.locationLoading()">{{ data.locationLoading() ? 'Loading…' : 'More locations' }}</button> }</div>
      @if (data.destinationLoading()) { <p role="status" class="text-sm text-secondary-foreground">Checking destination stock…</p> } @else if (data.destinationError()) { <p role="alert" class="text-sm text-destructive">{{ data.destinationError() }}</p> }
      @if (data.destinationRow(); as dest) { <p class="rounded-md border border-border bg-muted p-3 text-sm">Source: {{ data.sourceBalance!.onHand }} {{ data.sourceBalance!.unitCode }} · Destination: {{ dest.balance?.onHand ?? 'Unknown' }} {{ data.product.unitCode }}<span class="mt-1 block text-xs text-secondary-foreground">Destination must have a known balance in the same unit before transfer.</span></p> }
      <div><label for="transfer-quantity" class="mb-2 block text-xs font-medium">Quantity ({{ data.product.unitCode }})<span class="solar-required-marker" aria-hidden="true">*</span></label><input id="transfer-quantity" name="quantity" class="kt-input w-full" type="number" min="1" [max]="data.sourceBalance.onHand" step="1" [(ngModel)]="quantity" [disabled]="reviewing" required></div>
      <div><label for="transfer-reason" class="mb-2 block text-xs font-medium">Reason<span class="solar-required-marker" aria-hidden="true">*</span></label><input id="transfer-reason" name="reason" class="kt-input w-full" maxlength="500" [(ngModel)]="reason" [disabled]="reviewing" required></div>
      <div><label for="transfer-observed" class="mb-2 block text-xs font-medium">Observed at<span class="solar-required-marker" aria-hidden="true">*</span></label><input id="transfer-observed" name="observedAt" class="kt-input w-full" type="datetime-local" [(ngModel)]="observedAt" [disabled]="reviewing" required></div>
      @if (reviewing && data.destinationRow(); as dest) { <div class="rounded-md border border-border bg-muted p-4 text-sm"><p class="font-semibold">Review transfer</p><p class="mt-2">{{ data.source.code }}: {{ data.sourceBalance!.onHand }} → {{ data.sourceBalance!.onHand - quantity! }} {{ data.product.unitCode }}</p><p>{{ destLocationName() }}: {{ dest.balance!.onHand }} → {{ dest.balance!.onHand + quantity! }} {{ data.product.unitCode }}</p><p class="mt-1 text-xs text-secondary-foreground">Stock will move from the source location to the destination.</p></div> }
      @if (error) { <p role="alert" class="text-sm text-destructive">{{ error }}</p> }
      <footer class="sticky bottom-0 flex flex-wrap justify-end gap-3 border-t border-border bg-card pt-4"><button type="button" class="kt-btn kt-btn-light" (click)="cancel()">Cancel</button>@if (!reviewing) { <button type="submit" class="kt-btn kt-btn-light" [disabled]="!valid">Review transfer</button> } @else { <button type="button" class="kt-btn kt-btn-light" (click)="reviewing = false">Edit transfer</button><button type="button" class="kt-btn kt-btn-light" (click)="confirm()">Confirm transfer</button> }</footer>
    </form></section>` })
export class InventoryTransferDialog {
  readonly ref = inject<DialogRef<TransferDraft | null>>(DialogRef);
  readonly data = inject<{ product: InventoryRow['product']; source: InventoryLocation; sourceBalance: NonNullable<InventoryRow['balance']>; locations: ReturnType<typeof signal<InventoryLocation[]>>; locationCursor: ReturnType<typeof signal<string | null>>; locationLoading: ReturnType<typeof signal<boolean>>; loadMoreLocations(): void; destinationRow: ReturnType<typeof signal<InventoryRow | null>>; destinationLoading: ReturnType<typeof signal<boolean>>; destinationError: ReturnType<typeof signal<string>>; loadDestination(id: string): void }>(DIALOG_DATA);
  private readonly discard = inventoryDiscardGuard(() => this.ref.close(null));
  destinationLocationId = ''; quantity: number | null = null; reason = ''; observedAt = localDateTime(); reviewing = false; error = '';
  private readonly initialObservedAt = this.observedAt;
  get valid(): boolean { const row = this.data.destinationRow(), at = isoFromLocal(this.observedAt), location = this.data.locations().find(item => item.id === this.destinationLocationId); return !!row?.balance && !this.data.destinationLoading() && row.product.id === this.data.product.id && row.balance.productId === this.data.product.id && row.balance.locationId === this.destinationLocationId && row.product.version === this.data.product.version && row.balance.unitCode === this.data.sourceBalance.unitCode && location?.status === 'active' && this.quantity !== null && Number.isSafeInteger(this.quantity) && this.quantity > 0 && this.quantity <= this.data.sourceBalance.onHand && this.data.sourceBalance.onHand - this.quantity >= 0 && row.balance.onHand + this.quantity <= 1_000_000_000 && !!this.reason.trim() && this.reason.trim().length <= 500 && !/[\u0000-\u001f\u007f]/.test(this.reason) && !!at && Date.parse(at) <= Date.now() + 300_000; }
  destLocationName(): string { return this.data.locations().find(item => item.id === this.destinationLocationId)?.code ?? 'Destination'; }
  review(): void { if (!this.valid) { this.error = 'Choose a destination with a known matching-unit balance and enter a valid quantity, reason, and time.'; return; } this.error = ''; this.reviewing = true; }
  confirm(): void { if (this.valid) this.ref.close({ destinationLocationId: this.destinationLocationId, quantity: this.quantity!, reason: this.reason.trim(), observedAt: isoFromLocal(this.observedAt)! }); }
  cancel(): void { if (!this.destinationLocationId && this.quantity === null && !this.reason && this.observedAt === this.initialObservedAt) { this.ref.close(null); return; } this.discard(); }
}

@Component({ selector: 'app-inventory-settings-dialog', imports: [FormsModule], template: `
  <section class="flex max-h-[calc(100dvh-32px)] min-h-0 flex-col bg-card text-foreground"><header class="shrink-0 border-b border-border px-6 py-5"><p class="eyebrow mb-2">{{ data.product.sku }} · {{ data.location.code }}</p><h2 id="inventory-settings-heading" class="text-xl font-semibold">Reorder threshold</h2><p class="mt-2 text-sm text-secondary-foreground">{{ data.product.name }} · {{ data.location.name }} · {{ data.product.unitCode }}</p></header>
    <form class="grid min-h-0 max-h-[calc(100dvh-180px)] gap-4 overflow-y-auto px-6 py-5" (ngSubmit)="save()" novalidate><div><label for="reorder-point" class="mb-2 block text-xs font-medium">Reorder point ({{ data.product.unitCode }})</label><input id="reorder-point" name="reorderPoint" class="kt-input w-full" type="number" min="0" max="1000000000" step="1" [(ngModel)]="reorderPoint"><p class="mt-1 text-xs text-secondary-foreground">Leave blank to unset. A value of 0 is an explicit threshold; it is separate from unknown stock.</p></div>
      @if (error) { <p role="alert" class="text-sm text-destructive">{{ error }}</p> }<footer class="sticky bottom-0 flex flex-wrap justify-end gap-3 border-t border-border bg-card pt-4"><button type="button" class="kt-btn kt-btn-light" (click)="cancel()">Cancel</button><button type="submit" class="kt-btn kt-btn-light" [disabled]="!valid">Save threshold</button></footer></form></section>` })
export class InventorySettingsDialog {
  readonly ref = inject<DialogRef<SettingsDraft | null>>(DialogRef);
  readonly data = inject<{ product: InventoryRow['product']; location: InventoryLocation; reorderPoint: number | null }>(DIALOG_DATA);
  reorderPoint: number | null = this.data.reorderPoint; error = '';
  private readonly discard = inventoryDiscardGuard(() => this.ref.close(null));
  private readonly initialValue = this.data.reorderPoint;
  get valid(): boolean { return this.reorderPoint === null || Number.isSafeInteger(this.reorderPoint) && this.reorderPoint >= 0 && this.reorderPoint <= 1_000_000_000; }
  save(): void { if (!this.valid) { this.error = 'Enter a whole number from 0 to 1,000,000,000 or leave it blank.'; return; } this.ref.close({ reorderPoint: this.reorderPoint }); }
  cancel(): void { if (this.reorderPoint === this.initialValue) { this.ref.close(null); return; } this.discard(); }
}

@Component({ selector: 'app-inventory-movement-confirm', template: `
  <section class="bg-card text-foreground"><header class="border-b border-border px-6 py-5"><h2 id="inventory-confirm-heading" class="text-xl font-semibold">Confirm {{ data.label.toLowerCase() }}?</h2></header>
    <p class="px-6 py-5 text-sm leading-6">{{ data.summary }} This change will be saved in movement history and cannot be removed.</p>
    <footer class="flex flex-wrap justify-end gap-3 border-t border-border px-6 py-4"><button type="button" class="kt-btn kt-btn-light" (click)="ref.close(false)">Cancel</button>
      <button type="button" class="kt-btn kt-btn-light" (click)="ref.close(true)">Confirm {{ data.label.toLowerCase() }}</button></footer></section>` })
export class InventoryMovementConfirmDialog {
  readonly ref = inject<DialogRef<boolean>>(DialogRef);
  readonly data = inject<{ label: string; summary: string }>(DIALOG_DATA);
}

@Component({ selector: 'app-inventory', imports: [DatePipe, DecimalPipe, FormsModule, Tooltip, ProductVisualComponent, CdkMenu, CdkMenuItem, CdkMenuTrigger, KtuiTable, KtuiTableColumn], templateUrl: './inventory.html', styleUrl: './inventory.css' })
export class Inventory {
  readonly tableRowKey = (row: InventoryRow): string => row.product.id;
  private readonly api = inject(InventoryApiService);
  private readonly catalog = inject(AdminCatalogApiService);
  private readonly dialog = inject(Dialog);
  private readonly access = inject(AdminAccessService);
  private readonly auth = inject(AuthSessionService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  readonly authorized = this.access.authorized;
  readonly accessStatus = this.access.status;
  readonly locations = signal<InventoryLocation[]>([]);
  readonly locationCursor = signal<string | null>(null);
  readonly locationLoading = signal(false);
  readonly locationError = signal('');
  readonly selectedLocationId = signal('');
  readonly selectedLocation = computed(() => this.locations().find(item => item.id === this.selectedLocationId()) ?? null);
  readonly rows = signal<InventoryRow[]>([]);
  readonly inventoryCursor = signal<string | null>(null);
  readonly inventoryPage = signal(1);
  readonly inventoryLoading = signal(false);
  readonly inventoryError = signal('');
  readonly inventoryPageError = signal('');
  readonly skuPrefix = signal('');
  readonly skuError = signal('');
  readonly category = signal('');
  readonly supplierId = signal('');
  readonly stockStatus = signal<InventoryStockStatus | ''>('');
  readonly categories = CATEGORIES;
  readonly suppliers = signal<AdminSupplier[]>([]);
  readonly supplierCursor = signal<string | null>(null);
  readonly suppliersLoading = signal(false);
  readonly supplierError = signal('');
  readonly historyProductId = signal('');
  readonly movements = signal<InventoryMovement[]>([]);
  readonly movementCursor = signal<string | null>(null);
  readonly movementLoading = signal(false);
  readonly movementError = signal('');
  readonly movementPage = signal(1);
  readonly locationForm = signal<'create' | 'edit' | null>(null);
  readonly locationCode = signal('');
  readonly locationName = signal('');
  readonly locationNotes = signal('');
  readonly locationStatus = signal<'active' | 'inactive'>('active');
  readonly locationSaveBusy = signal(false);
  readonly locationSaveError = signal('');
  readonly stockBusyProductId = signal('');
  readonly stockFlowBusy = signal(false);
  readonly stockErrors = signal<Record<string, string>>({});
  readonly stockNeedsReload = signal<Record<string, boolean>>({});
  readonly retryInputs = signal<Record<string, InventoryStockInput>>({});
  readonly retryCountInputs = signal<Record<string, InventoryCountInput>>({});
  readonly retryTransferInputs = signal<Record<string, InventoryTransferInput>>({});
  readonly retrySettingsInputs = signal<Record<string, InventorySettingsInput>>({});
  readonly settingsBusyProductId = signal('');
  readonly settingsErrors = signal<Record<string, string>>({});
  readonly destinationRow = signal<InventoryRow | null>(null);
  readonly destinationLoading = signal(false);
  readonly destinationError = signal('');
  readonly exporting = signal(false);
  readonly exportError = signal('');
  readonly exportProgress = signal('');
  readonly historyExporting = signal(false);
  readonly historyExportError = signal('');
  readonly skuDebouncePending = signal(false);
  readonly locationTarget = signal<{ id: string; version: number; code: string; name: string; notes: string; status: 'active' | 'inactive' } | null>(null);
  private generation = 0;
  private queryGeneration = 0;
  private alive = true;
  private navigating = false;
  private accessKey = '';
  private locationRequestKey = '';
  private locationRequestId = '';
  private stockRequestKey = '';
  private stockRequestId = '';
  private filterTimer: ReturnType<typeof setTimeout> | undefined;
  private inventoryPageCursors: (string | null)[] = [null];
  private inventoryPageRetry: { page: number; cursor: string | null } | null = null;
  private historyGeneration = 0;
  private movementPageCursors: (string | null)[] = [null];
  private movementPageRetry: { page: number; cursor: string | null } | null = null;
  private movementDialogRef: DialogRef<void> | null = null;
  private countDialogRef: DialogRef<CountDraft | null> | null = null;
  private transferDialogRef: DialogRef<TransferDraft | null> | null = null;
  private settingsDialogRef: DialogRef<SettingsDraft | null> | null = null;
  private stockDialogRef: DialogRef<StockDraft | null> | null = null;
  private confirmationDialogRef: DialogRef<boolean> | null = null;
  private discardDialogRef: DialogRef<boolean> | null = null;
  private exportGeneration = 0;
  private historyExportGeneration = 0;
  private destinationGeneration = 0;
  private transferDialogGeneration = 0;
  private exportRows: InventoryRow[] | null = null;
  private historyExportRows: InventoryMovement[] | null = null;
  private retryFlowRequestIds: Record<string, string> = {};

  constructor() {
    effect(() => {
      const key = `${this.auth.sessionRevision()}|${this.auth.session()?.customerId ?? ''}|${this.auth.status()}|${this.auth.busy()}|${this.access.authorized()}|${this.access.status()}`;
      if (key === this.accessKey) return;
      this.accessKey = key; this.resetScope();
      if (this.canAccess()) this.bootstrap();
    });
    const routeChanges = this.router.events.subscribe(event => {
      if (event instanceof NavigationStart) {
        this.navigating = true;
        this.closeMovementDialog();
        if (!this.stockFlowBusy() && !this.locationSaveBusy()) { this.generation++; this.queryGeneration++; this.historyGeneration++; }
        if (this.filterTimer) clearTimeout(this.filterTimer);
        this.filterTimer = undefined; this.skuDebouncePending.set(false);
        this.locationLoading.set(false); this.inventoryLoading.set(false); this.suppliersLoading.set(false); this.movementLoading.set(false); return;
      }
      if (event instanceof NavigationCancel) {
        this.navigating = false;
        if (this.canAccess() && !this.stockFlowBusy() && !this.locationSaveBusy()) this.bootstrap();
        return;
      }
      if (event instanceof NavigationEnd) { this.navigating = false; this.resetScope(); if (this.canAccess() && this.router.url.startsWith('/admin/inventory')) this.bootstrap(); }
    });
    this.destroyRef.onDestroy(() => { this.alive = false; this.generation++; routeChanges.unsubscribe(); if (this.filterTimer) clearTimeout(this.filterTimer); this.closeOwnedDialogs(); });
  }

  canAccess(): boolean { return this.access.authorized() && this.access.status() === 'authorized' && !this.auth.busy(); }
  retryAccess(): void { this.access.retry(); }
  private openDiscardDialog(): DialogRef<boolean> {
    if (this.discardDialogRef) return this.discardDialogRef;
    const ref = this.dialog.open<boolean>(InventoryDiscardDialog, { width: '440px', maxWidth: 'calc(100vw - 32px)', ariaLabelledBy: 'inventory-discard-heading', panelClass: 'solar-dialog-panel', backdropClass: 'solar-dialog-backdrop' });
    this.discardDialogRef = ref; ref.closed.pipe(take(1)).subscribe(() => { if (this.discardDialogRef === ref) this.discardDialogRef = null; });
    return ref;
  }
  private async confirmDiscard(): Promise<boolean> { return firstValueFrom(this.openDiscardDialog().closed.pipe(take(1))).then(value => value === true); }
  private closeOwnedDialogs(): void {
    this.closeMovementDialog();
    this.destinationGeneration++; this.transferDialogGeneration++; this.destinationRow.set(null); this.destinationLoading.set(false); this.destinationError.set('');
    this.cancelExport();
    this.stockDialogRef?.close(null); this.stockDialogRef = null;
    this.countDialogRef?.close(null); this.countDialogRef = null;
    this.transferDialogRef?.close(null); this.transferDialogRef = null;
    this.settingsDialogRef?.close(null); this.settingsDialogRef = null;
    this.confirmationDialogRef?.close(false); this.confirmationDialogRef = null;
    this.discardDialogRef?.close(false); this.discardDialogRef = null;
  }
  async canLeave(): Promise<boolean> {
    if (this.locationSaveBusy() || this.stockBusyProductId() || this.settingsBusyProductId()) return false;
    if (!this.locationDirty() && !this.stockFlowBusy()) return true;
    const discard = await this.confirmDiscard();
    if (discard) this.closeOwnedDialogs();
    return discard;
  }
  @HostListener('window:beforeunload', ['$event']) beforeUnload(event: BeforeUnloadEvent): void {
    if (this.locationDirty() || this.stockFlowBusy() || this.locationSaveBusy() || this.settingsBusyProductId()) { event.preventDefault(); event.returnValue = ''; }
  }

  async openCreateLocation(): Promise<void> {
    if (!this.canAccess() || this.locationSaveBusy() || this.stockFlowBusy()) return;
    if (this.locationDirty() && !await this.confirmDiscard()) return;
    if (!this.canAccess() || this.locationSaveBusy() || this.stockFlowBusy()) return;
    this.locationForm.set('create'); this.locationCode.set(''); this.locationName.set(''); this.locationNotes.set('');
    this.locationStatus.set('active'); this.locationTarget.set(null); this.locationSaveError.set(''); this.locationRequestKey = '';
  }
  async openEditLocation(): Promise<void> {
    if (!this.canAccess() || this.locationSaveBusy() || this.stockFlowBusy()) return;
    if (this.locationDirty() && !await this.confirmDiscard()) return;
    const location = this.selectedLocation(); if (!this.canAccess() || !location || this.locationSaveBusy() || this.stockFlowBusy()) return;
    this.locationForm.set('edit'); this.locationCode.set(location.code); this.locationName.set(location.name);
    this.locationNotes.set(location.notes); this.locationStatus.set(location.status);
    this.locationTarget.set({ id: location.id, version: location.version, code: location.code, name: location.name, notes: location.notes, status: location.status });
    this.locationSaveError.set(''); this.locationRequestKey = '';
  }
  locationDirty(): boolean {
    const form = this.locationForm();
    if (form === 'create') return !!(this.locationCode().trim() || this.locationName().trim() || this.locationNotes().trim());
    if (form === 'edit') { const item = this.locationTarget(); return !!item && (this.locationName() !== item.name || this.locationNotes() !== item.notes || this.locationStatus() !== item.status); }
    return false;
  }
  async closeLocationForm(): Promise<void> {
    if (!this.canAccess() || this.locationSaveBusy() || this.stockFlowBusy()) return;
    if (!this.locationDirty()) { this.locationForm.set(null); this.locationTarget.set(null); return; }
    if (await this.confirmDiscard()) { this.locationForm.set(null); this.locationTarget.set(null); }
  }
  async saveLocation(): Promise<void> {
    if (!this.canAccess() || this.locationSaveBusy() || this.stockFlowBusy() || !this.locationForm()) return;
    const form = this.locationForm()!;
    const target = this.locationTarget();
    const fields = { ...(form === 'create' ? { code: this.locationCode().trim().toUpperCase() } : {}),
      name: this.locationName().trim(), notes: this.locationNotes().trim(), ...(form === 'edit' ? { status: this.locationStatus() } : {}) };
    if (form === 'create' && !/^[A-Z0-9][A-Z0-9_-]{0,31}$/.test(fields.code ?? '')) { this.locationSaveError.set('Use 1–32 letters, digits, underscores, or hyphens; start with a letter or digit.'); return; }
    if (form === 'edit' && !target) return;
    if (!fields.name || fields.name.length > 160 || fields.notes.length > 1000) { this.locationSaveError.set('Enter a name up to 160 characters and notes up to 1,000 characters.'); return; }
    const { fence, valid } = this.capture(); if (!valid) return;
    const key = JSON.stringify([form, fields]);
    if (key !== this.locationRequestKey || !this.locationRequestId) { this.locationRequestKey = key; this.locationRequestId = crypto.randomUUID(); }
    this.locationSaveBusy.set(true); this.locationSaveError.set('');
    try {
      const saved = form === 'create'
        ? await this.api.createLocation({ requestId: this.locationRequestId, code: fields.code!, name: fields.name, notes: fields.notes })
        : await this.api.updateLocation(target!.id, { requestId: this.locationRequestId, expectedVersion: target!.version, name: fields.name, notes: fields.notes, status: fields.status! });
      if (!this.current(fence)) return;
      this.locationRequestKey = ''; this.locationRequestId = ''; this.locationForm.set(null); this.locationTarget.set(null);
      this.locations.update(items => form === 'create' ? [saved, ...items.filter(existing => existing.id !== saved.id)]
        : items.map(existing => existing.id === saved.id ? saved : existing));
      this.selectedLocationId.set(saved.id); this.resetInventoryQuery();
      this.toast.success(form === 'create' ? 'Inventory location created.' : 'Inventory location updated.');
      await this.loadInventory(true);
    } catch (error) {
      if (!this.current(fence)) return;
      this.locationSaveError.set(safeError(error)); this.toast.error(error instanceof StoreApiError && error.code === 'conflict' ? 'Location changed elsewhere. Reload it before saving.' : 'Could not save the inventory location. Retry unchanged details.');
    } finally { this.locationSaveBusy.set(false); }
  }

  private bootstrap(): void {
    void this.loadLocations(true); this.suppliers.set([]); this.supplierCursor.set(null); this.loadSupplierOptions();
  }
  private resetScope(): void {
    this.closeMovementDialog();
    if (this.filterTimer) clearTimeout(this.filterTimer);
    this.filterTimer = undefined;
    this.generation++; this.queryGeneration++; this.locations.set([]); this.locationCursor.set(null); this.selectedLocationId.set('');
    this.rows.set([]); this.inventoryCursor.set(null); this.suppliers.set([]); this.supplierCursor.set(null);
    this.inventoryPage.set(1); this.inventoryPageCursors = [null]; this.inventoryPageRetry = null; this.skuDebouncePending.set(false);
    this.movements.set([]); this.movementCursor.set(null); this.historyProductId.set('');
    this.locationLoading.set(false); this.inventoryLoading.set(false); this.suppliersLoading.set(false); this.movementLoading.set(false);
    this.locationError.set(''); this.inventoryError.set(''); this.inventoryPageError.set(''); this.supplierError.set(''); this.movementError.set('');
    this.stockErrors.set({}); this.stockNeedsReload.set({}); this.retryInputs.set({}); this.retryCountInputs.set({}); this.retryTransferInputs.set({}); this.retrySettingsInputs.set({}); this.settingsErrors.set({}); this.locationForm.set(null); this.locationTarget.set(null);
    this.stockFlowBusy.set(false); this.stockBusyProductId.set(''); this.settingsBusyProductId.set('');
    this.locationRequestKey = ''; this.locationRequestId = ''; this.stockRequestKey = ''; this.stockRequestId = ''; this.closeOwnedDialogs();
  }
  private capture(): { fence: Fence; valid: boolean } {
    const session = this.auth.session();
    if (!this.canAccess() || !session?.customerId) return { fence: { generation: this.generation, revision: -1, uid: '', route: '' }, valid: false };
    return { fence: { generation: this.generation, revision: this.auth.sessionRevision(), uid: session.customerId, route: this.router.url }, valid: true };
  }
  private current(fence: Fence): boolean {
    return this.alive && !this.navigating && this.generation === fence.generation && this.canAccess()
      && this.auth.sessionRevision() === fence.revision && this.auth.session()?.customerId === fence.uid && this.router.url === fence.route;
  }
  private sessionCurrent(fence: Fence): boolean {
    // Cleanup belongs to the captured auth/session generation, not the transient
    // navigation state. A canceled navigation must not strand a completed flow busy.
    return this.alive && this.generation === fence.generation
      && this.auth.sessionRevision() === fence.revision && this.auth.session()?.customerId === fence.uid;
  }
  async loadLocations(reset: boolean): Promise<void> {
    if (!this.canAccess() || this.locationLoading()) return;
    const cursor = reset ? null : this.locationCursor(); if (!reset && !cursor) return;
    const { fence, valid } = this.capture(); if (!valid) return;
    this.locationLoading.set(true); this.locationError.set('');
    try {
      const page = await this.api.listLocations(cursor);
      if (!this.current(fence)) return;
      this.locations.update(items => reset ? page.items : [...items, ...page.items]); this.locationCursor.set(page.nextCursor);
      if (reset && !this.selectedLocationId() && page.items.length) this.selectedLocationId.set(page.items[0].id);
    } catch (error) { if (this.current(fence)) this.locationError.set(safeError(error)); }
    finally { if (this.current(fence)) this.locationLoading.set(false); }
    if (reset && this.current(fence) && this.selectedLocationId()) await this.loadInventory(true);
  }
  loadMoreLocations(): void { if (this.locationCursor() && !this.locationLoading()) void this.loadLocations(false); }
  async selectLocation(id: string, control?: HTMLSelectElement): Promise<void> {
    try {
      if (!this.canAccess() || this.stockFlowBusy() || this.locationSaveBusy() || !this.locations().some(item => item.id === id)) return;
      if (this.locationDirty() && !await this.confirmDiscard()) return;
      if (!this.canAccess() || this.stockFlowBusy() || this.locationSaveBusy() || !this.locations().some(item => item.id === id)) return;
      this.locationForm.set(null); this.locationTarget.set(null);
      this.selectedLocationId.set(id); this.resetInventoryQuery(); void this.loadInventory(true);
    } finally {
      // A canceled selection must not leave the native control showing another pool.
      if (control) control.value = this.selectedLocationId();
    }
  }
  private resetInventoryQuery(): void {
    this.cancelExport();
    this.closeMovementDialog();
    this.queryGeneration++; this.rows.set([]); this.inventoryCursor.set(null); this.inventoryError.set(''); this.inventoryPageError.set('');
    this.inventoryPage.set(1); this.inventoryPageCursors = [null]; this.inventoryPageRetry = null;
    this.inventoryLoading.set(false); this.movementLoading.set(false);
    this.historyGeneration++; this.historyProductId.set(''); this.movements.set([]); this.movementCursor.set(null); this.movementError.set('');
    this.retryInputs.set({}); this.retryCountInputs.set({}); this.retryTransferInputs.set({}); this.retrySettingsInputs.set({}); this.stockErrors.set({}); this.settingsErrors.set({}); this.stockNeedsReload.set({});
  }
  setSkuPrefix(value: string): void {
    if (!this.canAccess() || this.stockFlowBusy()) return;
    this.closeMovementDialog();
    this.skuPrefix.set(value); this.skuDebouncePending.set(true); if (this.filterTimer) clearTimeout(this.filterTimer);
    this.filterTimer = setTimeout(() => {
      this.skuDebouncePending.set(false);
      if (!this.canAccess() || this.stockFlowBusy()) return;
      const prefix = this.skuPrefix().trim().toUpperCase();
      if (prefix && !/^[A-Z0-9][A-Z0-9._-]{0,63}$/.test(prefix)) { this.skuError.set('Use letters, digits, periods, underscores, or hyphens in the SKU prefix.'); return; }
      this.skuError.set(''); this.resetInventoryQuery(); void this.loadInventory(true);
    }, 300);
  }
  setCategory(value: string): void {
    if (!this.canAccess() || this.stockFlowBusy() || value && !(CATEGORIES as readonly string[]).includes(value)) return;
    this.category.set(value); this.resetInventoryQuery(); void this.loadInventory(true);
  }
  setSupplier(value: string): void {
    if (!this.canAccess() || this.stockFlowBusy() || value && !this.suppliers().some(item => item.id === value)) return;
    this.supplierId.set(value); this.resetInventoryQuery(); void this.loadInventory(true);
  }
  setStockStatus(value: string): void {
    if (!this.canAccess() || this.stockFlowBusy() || value && !['unknown', 'zero', 'low', 'in-stock'].includes(value)) return;
    this.stockStatus.set(value as InventoryStockStatus | ''); this.resetInventoryQuery(); void this.loadInventory(true);
  }
  clearFilters(): void {
    if (!this.canAccess() || this.stockFlowBusy()) return;
    if (this.filterTimer) clearTimeout(this.filterTimer);
    this.filterTimer = undefined; this.skuDebouncePending.set(false);
    this.skuPrefix.set(''); this.skuError.set(''); this.category.set(''); this.supplierId.set(''); this.stockStatus.set(''); this.resetInventoryQuery(); void this.loadInventory(true);
  }
  private filters(): InventoryProductFilters {
    const stockStatus = this.stockStatus();
    return { ...(this.skuPrefix().trim() ? { skuPrefix: this.skuPrefix().trim().toUpperCase() } : {}),
      ...(this.category() ? { category: this.category() } : {}), ...(this.supplierId() ? { supplierId: this.supplierId() } : {}),
      ...(stockStatus ? { stockStatus } : {}) };
  }
  async loadInventory(reset: boolean): Promise<void> {
    const locationId = this.selectedLocationId(); if (!this.canAccess() || !locationId || this.inventoryLoading()) return;
    const cursor = reset ? null : this.inventoryCursor(); if (!reset && !cursor) return;
    const query = this.queryGeneration, filters = this.filters(); const { fence, valid } = this.capture(); if (!valid) return;
    this.inventoryLoading.set(true); if (reset) this.inventoryError.set(''); else this.inventoryPageError.set('');
    try {
      const page = await this.api.listInventory(locationId, cursor, filters);
      if (!this.current(fence) || query !== this.queryGeneration || locationId !== this.selectedLocationId()) return;
      this.rows.set(page.items); this.inventoryCursor.set(page.nextCursor);
      if (reset) {
        this.inventoryPage.set(1); this.inventoryPageCursors = [null];
        if (page.nextCursor) this.inventoryPageCursors[1] = page.nextCursor;
        this.inventoryPageRetry = null; this.clearInventoryRowScope();
      }
    } catch (error) {
      if (!this.current(fence) || query !== this.queryGeneration) return;
      (reset ? this.inventoryError : this.inventoryPageError).set(safeError(error));
    } finally { if (this.current(fence) && query === this.queryGeneration) this.inventoryLoading.set(false); }
  }
  retryInventory(): void { void this.loadInventory(true); }
  private clearInventoryRowScope(): void {
    this.closeMovementDialog();
    this.retryInputs.set({}); this.retryCountInputs.set({}); this.retryTransferInputs.set({}); this.retrySettingsInputs.set({}); this.stockErrors.set({}); this.settingsErrors.set({}); this.stockNeedsReload.set({});
    this.stockRequestKey = ''; this.stockRequestId = '';
  }
  private inventoryNavigationBlocked(): boolean {
    return this.inventoryLoading() || this.stockFlowBusy() || !!this.stockBusyProductId()
      || !!this.settingsBusyProductId() || this.locationSaveBusy() || this.skuDebouncePending() || !!this.skuError();
  }
  private async requestInventoryPage(targetPage: number, cursor: string | null): Promise<void> {
    const locationId = this.selectedLocationId();
    if (!this.canAccess() || !locationId || this.inventoryNavigationBlocked() || targetPage < 1) return;
    this.cancelExport();
    this.closeMovementDialog();
    const query = this.queryGeneration, filters = this.filters(), { fence, valid } = this.capture();
    if (!valid) return;
    this.inventoryPageRetry = { page: targetPage, cursor };
    this.inventoryLoading.set(true); this.inventoryPageError.set('');
    try {
      const page = await this.api.listInventory(locationId, cursor, filters);
      if (!this.current(fence) || query !== this.queryGeneration || locationId !== this.selectedLocationId()) return;
      const cursors = this.inventoryPageCursors.slice(0, targetPage);
      cursors[targetPage - 1] = cursor;
      if (page.nextCursor) cursors[targetPage] = page.nextCursor;
      this.inventoryPageCursors = cursors;
      this.rows.set(page.items); this.inventoryCursor.set(page.nextCursor); this.inventoryPage.set(targetPage);
      this.inventoryPageRetry = null; this.clearInventoryRowScope();
    } catch (error) {
      if (!this.current(fence) || query !== this.queryGeneration) return;
      this.inventoryPageError.set(safeError(error));
    } finally {
      if (this.current(fence) && query === this.queryGeneration) this.inventoryLoading.set(false);
    }
  }
  nextInventoryPage(): void {
    const cursor = this.inventoryCursor();
    if (cursor && !this.inventoryNavigationBlocked()) void this.requestInventoryPage(this.inventoryPage() + 1, cursor);
  }
  previousInventoryPage(): void {
    const targetPage = this.inventoryPage() - 1;
    const cursor = this.inventoryPageCursors[targetPage - 1];
    if (targetPage >= 1 && this.inventoryPageCursors.length >= targetPage && !this.inventoryNavigationBlocked())
      void this.requestInventoryPage(targetPage, cursor);
  }
  retryInventoryPage(): void {
    const target = this.inventoryPageRetry;
    if (target && !this.inventoryNavigationBlocked()) void this.requestInventoryPage(target.page, target.cursor);
  }
  inventoryPageControlsDisabled(): boolean { return this.inventoryNavigationBlocked(); }
  loadSupplierOptions(): void {
    if (!this.canAccess() || this.suppliersLoading()) return;
    const { fence, valid } = this.capture(); if (!valid) return;
    this.suppliersLoading.set(true); this.supplierError.set('');
    void this.catalog.listSuppliers(this.supplierCursor()).then(page => {
      if (!this.current(fence)) return;
      this.suppliers.update(items => [...items, ...page.items]); this.supplierCursor.set(page.nextCursor);
    }).catch(error => { if (this.current(fence)) this.supplierError.set(safeError(error)); })
      .finally(() => { if (this.current(fence)) this.suppliersLoading.set(false); });
  }

  async toggleHistory(row: InventoryRow): Promise<void> {
    if (this.historyProductId() === row.product.id) { this.closeMovementDialog(); return; }
    this.closeMovementDialog();
    this.historyExportError.set('');
    const location = this.selectedLocation();
    if (this.historyTriggerDisabled() || !location || !this.rows().some(item => item.product.id === row.product.id)) return;
    this.historyProductId.set(row.product.id);
    const data: InventoryMovementDialogData = {
      product: row.product, location, locations: this.locations(), movements: this.movements, cursor: this.movementCursor,
      loading: this.movementLoading, error: this.movementError, page: this.movementPage,
      previous: () => this.previousMovements(row), next: () => this.nextMovements(row), retry: () => this.retryMovements(row),
      exporting: this.historyExporting, exportError: this.historyExportError,
      exportAll: () => this.exportHistory(row), cancelExport: () => this.cancelHistoryExport(),
    };
    const ref = this.dialog.open<void, InventoryMovementDialogData>(InventoryMovementDialog, {
      data, width: 'min(1200px, calc(100vw - 32px))', maxWidth: 'calc(100vw - 32px)',
      maxHeight: 'calc(100dvh - 32px)', ariaLabelledBy: 'inventory-history-title',
      panelClass: 'solar-dialog-panel', backdropClass: 'solar-dialog-backdrop',
    });
    this.movementDialogRef = ref;
    ref.closed.pipe(take(1)).subscribe(() => {
      if (this.movementDialogRef === ref) { this.movementDialogRef = null; this.clearMovementHistory(); }
    });
    await this.requestMovementPage(row, 1, null);
  }
  historyTriggerDisabled(): boolean {
    return !this.alive || this.navigating || !this.canAccess() || this.inventoryLoading() || this.skuDebouncePending()
      || !!this.skuError() || this.stockFlowBusy() || !!this.stockBusyProductId() || this.locationSaveBusy()
      || !!this.stockDialogRef || !!this.confirmationDialogRef || !!this.discardDialogRef;
  }
  private clearMovementHistory(): void {
    this.cancelHistoryExport();
    this.historyGeneration++; this.historyProductId.set(''); this.movements.set([]); this.movementCursor.set(null);
    this.movementLoading.set(false); this.movementError.set(''); this.movementPage.set(1);
    this.movementPageCursors = [null]; this.movementPageRetry = null;
  }
  private closeMovementDialog(): void {
    this.cancelHistoryExport();
    const ref = this.movementDialogRef; this.movementDialogRef = null;
    this.clearMovementHistory(); ref?.close();
  }
  nextMovements(row: InventoryRow): void {
    this.cancelHistoryExport();
    const cursor = this.movementCursor();
    if (cursor && !this.movementLoading()) void this.requestMovementPage(row, this.movementPage() + 1, cursor);
  }
  previousMovements(row: InventoryRow): void {
    this.cancelHistoryExport();
    const targetPage = this.movementPage() - 1;
    const cursor = this.movementPageCursors[targetPage - 1];
    if (targetPage >= 1 && !this.movementLoading()) void this.requestMovementPage(row, targetPage, cursor);
  }
  retryMovements(row: InventoryRow): void {
    this.cancelHistoryExport();
    const target = this.movementPageRetry;
    if (target && !this.movementLoading()) void this.requestMovementPage(row, target.page, target.cursor);
  }
  private async requestMovementPage(row: InventoryRow, targetPage: number, cursor: string | null): Promise<void> {
    const locationId = this.selectedLocationId();
    if (!this.canAccess() || !locationId || !this.movementDialogRef || this.movementLoading()
      || this.historyProductId() !== row.product.id || targetPage < 1) return;
    const query = this.queryGeneration, history = this.historyGeneration, { fence, valid } = this.capture();
    if (!valid) return;
    this.movementPageRetry = { page: targetPage, cursor };
    this.movementLoading.set(true); this.movementError.set('');
    try {
      const page = await this.api.listMovements(row.product.id, locationId, cursor);
      if (!this.current(fence) || query !== this.queryGeneration || history !== this.historyGeneration
        || this.historyProductId() !== row.product.id || this.selectedLocationId() !== locationId || !this.movementDialogRef) return;
      const cursors = this.movementPageCursors.slice(0, targetPage);
      cursors[targetPage - 1] = cursor;
      if (page.nextCursor) cursors[targetPage] = page.nextCursor;
      this.movementPageCursors = cursors; this.movements.set(page.items); this.movementCursor.set(page.nextCursor);
      this.movementPage.set(targetPage); this.movementPageRetry = null;
    } catch (error) {
      if (this.current(fence) && query === this.queryGeneration && history === this.historyGeneration
        && this.historyProductId() === row.product.id && this.movementDialogRef) this.movementError.set(safeError(error));
    } finally {
      if (this.current(fence) && query === this.queryGeneration && history === this.historyGeneration
        && this.historyProductId() === row.product.id && this.movementDialogRef) this.movementLoading.set(false);
    }
  }

  async openStockDialog(row: InventoryRow): Promise<void> {
    if (!row.balance) { await this.openCountDialog(row); return; }
    const location = this.selectedLocation();
    if (!this.canAccess() || !location || location.status !== 'active' || !row.product.unitCode || this.stockFlowBusy()
      || this.inventoryLoading()
      || this.skuDebouncePending() || !this.rows().some(item => item.product.id === row.product.id)
      || this.stockNeedsReload()[row.product.id] || this.hasPendingRetry(row)) return;
    const { fence, valid } = this.capture(); if (!valid) return;
    const locationId = location.id, query = this.queryGeneration;
    this.stockFlowBusy.set(true);
    const ref = this.dialog.open<StockDraft | null, { product: InventoryRow['product']; location: InventoryLocation; balance: InventoryRow['balance'] }>(InventoryStockDialog, {
      width: '540px', maxWidth: 'calc(100vw - 32px)', ariaLabelledBy: 'inventory-stock-heading', panelClass: 'solar-dialog-panel', backdropClass: 'solar-dialog-backdrop', disableClose: true,
      data: { product: row.product, location, balance: row.balance },
    });
    this.stockDialogRef = ref;
    try {
      const draft = await firstValueFrom(ref.closed.pipe(take(1)));
      if (this.stockDialogRef === ref) this.stockDialogRef = null;
      if (!draft || !this.current(fence) || query !== this.queryGeneration || locationId !== this.selectedLocationId()) return;
      if (CONFIRM_KINDS.includes(draft.kind)) {
        const label = draft.kind;
        const change = draft.kind === 'correction' ? draft.quantity : -draft.quantity;
        const confirm = this.dialog.open<boolean, { label: string; summary: string }>(InventoryMovementConfirmDialog, {
          width: '460px', maxWidth: 'calc(100vw - 32px)', ariaLabelledBy: 'inventory-confirm-heading', panelClass: 'solar-dialog-panel', backdropClass: 'solar-dialog-backdrop', disableClose: true,
          data: { label, summary: `${row.product.name} will change by ${change} ${row.product.unitCode}.` },
        });
        this.confirmationDialogRef = confirm;
        const approved = await firstValueFrom(confirm.closed.pipe(take(1)));
        if (this.confirmationDialogRef === confirm) this.confirmationDialogRef = null;
        if (approved !== true || !this.current(fence) || query !== this.queryGeneration || locationId !== this.selectedLocationId()) return;
      }
      if (this.selectedLocation()?.id !== locationId || this.selectedLocation()?.status !== 'active'
        || this.inventoryLoading() || !this.rows().some(item => item.product.id === row.product.id)) return;
      const expectedVersion = draft.kind === 'opening' ? null : row.balance?.version ?? null;
      if (draft.kind !== 'opening' && expectedVersion === null) { this.stockErrors.update(value => ({ ...value, [row.product.id]: 'Set an opening balance before recording this movement.' })); return; }
      const base = { expectedVersion, expectedProductVersion: row.product.version, kind: draft.kind, quantity: draft.quantity, reason: draft.reason, observedAt: draft.observedAt };
      const key = JSON.stringify([row.product.id, locationId, base]);
      if (key !== this.stockRequestKey || !this.stockRequestId) { this.stockRequestKey = key; this.stockRequestId = crypto.randomUUID(); }
      await this.sendStock(row, locationId, { requestId: this.stockRequestId, ...base }, fence, query);
    } finally {
      if (this.stockDialogRef === ref) this.stockDialogRef = null;
      if (this.sessionCurrent(fence)) this.stockFlowBusy.set(false);
    }
  }
  async openCountDialog(row: InventoryRow): Promise<void> {
    const location = this.selectedLocation();
    if (!this.canAccess() || !location || location.status !== 'active' || !row.product.unitCode || this.stockFlowBusy() || this.inventoryLoading() || this.skuDebouncePending() || !this.rows().some(item => item.product.id === row.product.id) || this.stockNeedsReload()[row.product.id] || this.hasPendingRetry(row)) return;
    const { fence, valid } = this.capture(); if (!valid) return;
    const locationId = location.id, query = this.queryGeneration; this.stockFlowBusy.set(true);
    const ref = this.dialog.open<CountDraft | null, { product: InventoryRow['product']; location: InventoryLocation; balance: InventoryRow['balance'] }>(InventoryCountDialog, { width: '540px', maxWidth: 'calc(100vw - 32px)', maxHeight: 'calc(100dvh - 32px)', ariaLabelledBy: 'inventory-count-heading', panelClass: 'solar-dialog-panel', backdropClass: 'solar-dialog-backdrop', disableClose: true, data: { product: row.product, location, balance: row.balance } });
    this.countDialogRef = ref;
    try {
      const draft = await firstValueFrom(ref.closed.pipe(take(1))); if (this.countDialogRef === ref) this.countDialogRef = null;
      if (!draft || !this.scopeCurrent(fence, query, locationId) || this.selectedLocation()?.status !== 'active' || !this.rows().some(item => item.product.id === row.product.id)) return;
      const input: InventoryCountInput = { requestId: crypto.randomUUID(), expectedVersion: row.balance?.version ?? null, expectedProductVersion: row.product.version, ...draft };
      await this.sendCount(row, locationId, input, fence, query);
    } finally { if (this.countDialogRef === ref) this.countDialogRef = null; if (this.sessionCurrent(fence)) this.stockFlowBusy.set(false); }
  }
  async openTransferDialog(row: InventoryRow): Promise<void> {
    const source = this.selectedLocation();
    if (!this.canAccess() || !source || source.status !== 'active' || !row.product.unitCode || !row.balance || this.stockFlowBusy() || this.inventoryLoading() || this.skuDebouncePending() || !this.rows().some(item => item.product.id === row.product.id) || this.stockNeedsReload()[row.product.id] || this.hasPendingRetry(row)) return;
    const { fence, valid } = this.capture(); if (!valid) return;
    const locationId = source.id, query = this.queryGeneration, dialogGeneration = ++this.transferDialogGeneration; this.destinationGeneration++; this.stockFlowBusy.set(true); this.destinationRow.set(null); this.destinationError.set('');
    const data = { product: row.product, source, sourceBalance: row.balance, locations: this.locations, locationCursor: this.locationCursor, locationLoading: this.locationLoading, loadMoreLocations: () => this.loadMoreLocations(), destinationRow: this.destinationRow, destinationLoading: this.destinationLoading, destinationError: this.destinationError, loadDestination: (id: string) => this.loadDestinationRow(row, id, fence, query, dialogGeneration) };
    const ref = this.dialog.open<TransferDraft | null, typeof data>(InventoryTransferDialog, { width: '560px', maxWidth: 'calc(100vw - 32px)', maxHeight: 'calc(100dvh - 32px)', ariaLabelledBy: 'inventory-transfer-heading', panelClass: 'solar-dialog-panel', backdropClass: 'solar-dialog-backdrop', disableClose: true, data });
    this.transferDialogRef = ref;
    try {
      const draft = await firstValueFrom(ref.closed.pipe(take(1))); if (this.transferDialogRef === ref) this.transferDialogRef = null;
      const destination = this.destinationRow();
      const destinationBalance = destination?.balance;
      if (!draft || !destination || !destinationBalance || !this.scopeCurrent(fence, query, locationId) || this.selectedLocation()?.status !== 'active' || destinationBalance.locationId !== draft.destinationLocationId || destination.product.version !== row.product.version || !this.locations().some(item => item.id === draft.destinationLocationId && item.status === 'active')) return;
      const input: InventoryTransferInput = { requestId: crypto.randomUUID(), expectedProductVersion: row.product.version, expectedSourceVersion: row.balance.version, expectedDestinationVersion: destinationBalance.version, ...draft };
      await this.sendTransfer(row, locationId, input, fence, query);
    } finally { if (this.transferDialogRef === ref) this.transferDialogRef = null; if (this.sessionCurrent(fence) && this.transferDialogGeneration === dialogGeneration) { this.destinationGeneration++; this.destinationRow.set(null); this.destinationLoading.set(false); this.stockFlowBusy.set(false); } }
  }
  async loadDestinationRow(sourceRow: InventoryRow, destinationId: string, fence?: Fence, query?: number, dialogGeneration = this.transferDialogGeneration): Promise<void> {
    const requestGeneration = ++this.destinationGeneration;
    const location = this.locations().find(item => item.id === destinationId);
    this.destinationRow.set(null); this.destinationError.set('');
    if (!destinationId || !location || location.status !== 'active' || !this.canAccess()) { this.destinationLoading.set(false); return; }
    const scope = fence ?? this.capture().fence, queryId = query ?? this.queryGeneration, selectedId = destinationId;
    this.destinationLoading.set(true);
    try {
      const row = await this.api.inventoryRow(sourceRow.product.id, selectedId);
      if (requestGeneration !== this.destinationGeneration || dialogGeneration !== this.transferDialogGeneration || !this.scopeCurrent(scope, queryId, this.selectedLocationId()) || !this.transferDialogRef || !this.locations().some(item => item.id === selectedId && item.status === 'active')) return;
      if (row.product.id !== sourceRow.product.id) throw new StoreApiError('invalid-response');
      this.destinationRow.set(row);
      if (!row.balance) this.destinationError.set('Destination stock is unknown. Record a physical count there before transferring.');
      else if (row.product.version !== sourceRow.product.version) this.destinationError.set('Product details changed. Reload inventory before transferring.');
      else if (row.balance.unitCode !== sourceRow.balance?.unitCode) this.destinationError.set('The source and destination units do not match.');
    } catch (error) { if (requestGeneration === this.destinationGeneration && dialogGeneration === this.transferDialogGeneration && this.scopeCurrent(scope, queryId, this.selectedLocationId()) && this.transferDialogRef) this.destinationError.set(safeError(error)); }
    finally { if (requestGeneration === this.destinationGeneration && dialogGeneration === this.transferDialogGeneration && this.scopeCurrent(scope, queryId, this.selectedLocationId())) this.destinationLoading.set(false); }
  }
  async openSettingsDialog(row: InventoryRow): Promise<void> {
    if (!this.canAccess() || !this.selectedLocation() || this.selectedLocation()?.status !== 'active' || !row.product.unitCode || this.stockFlowBusy() || this.inventoryLoading() || this.skuDebouncePending() || !this.rows().some(item => item.product.id === row.product.id) || this.stockNeedsReload()[row.product.id] || this.hasPendingRetry(row)) return;
    const location = this.selectedLocation()!, { fence, valid } = this.capture(); if (!valid) return; const locationId = location.id, query = this.queryGeneration; this.stockFlowBusy.set(true);
    const ref = this.dialog.open<SettingsDraft | null, { product: InventoryRow['product']; location: InventoryLocation; reorderPoint: number | null }>(InventorySettingsDialog, { width: '500px', maxWidth: 'calc(100vw - 32px)', maxHeight: 'calc(100dvh - 32px)', ariaLabelledBy: 'inventory-settings-heading', panelClass: 'solar-dialog-panel', backdropClass: 'solar-dialog-backdrop', disableClose: true, data: { product: row.product, location, reorderPoint: row.settings?.reorderPoint ?? null } });
    this.settingsDialogRef = ref;
    try { const draft = await firstValueFrom(ref.closed.pipe(take(1))); if (this.settingsDialogRef === ref) this.settingsDialogRef = null; if (!draft || !this.scopeCurrent(fence, query, locationId) || this.selectedLocation()?.status !== 'active' || !this.rows().some(item => item.product.id === row.product.id)) return;
      await this.sendSettings(row, locationId, { requestId: crypto.randomUUID(), expectedVersion: row.settings?.version ?? null, expectedProductVersion: row.product.version, reorderPoint: draft.reorderPoint }, fence, query);
    } finally { if (this.settingsDialogRef === ref) this.settingsDialogRef = null; if (this.sessionCurrent(fence)) this.stockFlowBusy.set(false); }
  }
  private scopeCurrent(fence: Fence, query: number, locationId: string): boolean { return this.current(fence) && query === this.queryGeneration && locationId === this.selectedLocationId(); }
  hasPendingRetry(row: InventoryRow): boolean { const key = this.retryKey(row); return !!(this.retryInputs()[key] || this.retryCountInputs()[key] || this.retryTransferInputs()[key] || this.retrySettingsInputs()[key]); }
  private rowStatus(balance: InventoryRow['balance'], settings: InventoryRow['settings']): InventoryStockStatus { if (!balance) return 'unknown'; if (balance.onHand === 0) return 'zero'; return settings?.reorderPoint != null && balance.onHand <= settings.reorderPoint ? 'low' : 'in-stock'; }
  private async refreshStatusFilteredQuery(): Promise<void> { if (!this.stockStatus()) return; this.resetInventoryQuery(); await this.loadInventory(true); }
  private async sendCount(row: InventoryRow, locationId: string, input: InventoryCountInput, fence: Fence, query: number): Promise<void> {
    const key = `${locationId}|${query}|${row.product.id}`; this.stockBusyProductId.set(row.product.id); this.stockErrors.update(v => ({ ...v, [row.product.id]: '' }));
    try { const result = await this.api.recordCount(row.product.id, locationId, input); if (!this.scopeCurrent(fence, query, locationId)) return;
      this.rows.update(items => items.map(item => item.product.id === row.product.id ? { ...item, balance: result.balance, stockStatus: this.rowStatus(result.balance, item.settings) } : item));
      this.retryCountInputs.update(v => { const n = { ...v }; delete n[key]; return n; }); delete this.retryFlowRequestIds[key]; this.toast.success('Physical count recorded.'); await this.refreshStatusFilteredQuery();
    } catch (error) { if (!this.scopeCurrent(fence, query, locationId)) return; this.stockErrors.update(v => ({ ...v, [row.product.id]: safeError(error) }));
      if (error instanceof StoreApiError && error.code === 'conflict') { this.stockNeedsReload.update(v => ({ ...v, [row.product.id]: true })); this.retryCountInputs.update(v => { const n = { ...v }; delete n[key]; return n; }); this.toast.error('Stock or product details changed. Reload the row before another write.'); }
      else { this.retryCountInputs.update(v => ({ ...v, [key]: input })); this.toast.error('Could not confirm the physical count. Retry the exact same request.'); }
    } finally { if (this.sessionCurrent(fence)) this.stockBusyProductId.set(''); }
  }
  private async sendTransfer(row: InventoryRow, sourceId: string, input: InventoryTransferInput, fence: Fence, query: number): Promise<void> {
    const key = `${sourceId}|${query}|${row.product.id}`; this.stockBusyProductId.set(row.product.id); this.stockErrors.update(v => ({ ...v, [row.product.id]: '' }));
    try { const result = await this.api.transferStock(row.product.id, sourceId, input); if (!this.scopeCurrent(fence, query, sourceId)) return;
      this.rows.update(items => items.map(item => item.product.id === row.product.id ? { ...item, balance: result.source.balance, stockStatus: this.rowStatus(result.source.balance, item.settings) } : item));
      this.retryTransferInputs.update(v => { const n = { ...v }; delete n[key]; return n; }); delete this.retryFlowRequestIds[key]; this.toast.success('Stock transfer recorded.'); await this.refreshStatusFilteredQuery();
    } catch (error) { if (!this.scopeCurrent(fence, query, sourceId)) return; this.stockErrors.update(v => ({ ...v, [row.product.id]: safeError(error) }));
      if (error instanceof StoreApiError && error.code === 'conflict') { this.stockNeedsReload.update(v => ({ ...v, [row.product.id]: true })); this.retryTransferInputs.update(v => { const n = { ...v }; delete n[key]; return n; }); this.toast.error('Stock or product details changed. Reload the row before trying again.'); }
      else { this.retryTransferInputs.update(v => ({ ...v, [key]: input })); this.toast.error('Could not confirm the transfer. Retry this transfer without changing its details.'); }
    } finally { if (this.sessionCurrent(fence)) this.stockBusyProductId.set(''); }
  }
  private async sendSettings(row: InventoryRow, locationId: string, input: InventorySettingsInput, fence: Fence, query: number): Promise<void> {
    const key = `${locationId}|${query}|${row.product.id}`; this.settingsBusyProductId.set(row.product.id); this.settingsErrors.update(v => ({ ...v, [row.product.id]: '' }));
    try { const settings = await this.api.saveSettings(row.product.id, locationId, input); if (!this.scopeCurrent(fence, query, locationId)) return;
      this.rows.update(items => items.map(item => item.product.id === row.product.id ? { ...item, settings, stockStatus: this.rowStatus(item.balance, settings) } : item));
      this.retrySettingsInputs.update(v => { const n = { ...v }; delete n[key]; return n; }); delete this.retryFlowRequestIds[key]; this.toast.success('Reorder threshold saved.'); await this.refreshStatusFilteredQuery();
    } catch (error) { if (!this.scopeCurrent(fence, query, locationId)) return; this.settingsErrors.update(v => ({ ...v, [row.product.id]: safeError(error) }));
      if (error instanceof StoreApiError && error.code === 'conflict') { this.stockNeedsReload.update(v => ({ ...v, [row.product.id]: true })); this.retrySettingsInputs.update(v => { const n = { ...v }; delete n[key]; return n; }); this.toast.error('Product or threshold settings changed. Reload the row before another write.'); }
      else { this.retrySettingsInputs.update(v => ({ ...v, [key]: input })); this.toast.error('Could not confirm the threshold. Retry the exact same request.'); }
    } finally { if (this.sessionCurrent(fence)) this.settingsBusyProductId.set(''); }
  }
  async retryCount(row: InventoryRow): Promise<void> { await this.retryFlow(row, 'count'); }
  async retryTransfer(row: InventoryRow): Promise<void> { await this.retryFlow(row, 'transfer'); }
  async retrySettings(row: InventoryRow): Promise<void> { await this.retryFlow(row, 'settings'); }
  private async retryFlow(row: InventoryRow, kind: 'count' | 'transfer' | 'settings'): Promise<void> {
    const locationId = this.selectedLocationId(), query = this.queryGeneration, key = `${locationId}|${query}|${row.product.id}`; if (!this.canAccess() || this.stockFlowBusy() || !this.selectedLocation() || this.selectedLocation()?.status !== 'active' || !this.rows().some(item => item.product.id === row.product.id)) return;
    const { fence, valid } = this.capture(); if (!valid) return; this.stockFlowBusy.set(true);
    try { if (kind === 'count') { const input = this.retryCountInputs()[key]; if (input) await this.sendCount(row, locationId, input, fence, query); }
      else if (kind === 'transfer') { const input = this.retryTransferInputs()[key]; if (input) await this.sendTransfer(row, locationId, input, fence, query); }
      else { const input = this.retrySettingsInputs()[key]; if (input) await this.sendSettings(row, locationId, input, fence, query); }
    } finally { if (this.sessionCurrent(fence)) this.stockFlowBusy.set(false); }
  }
  retryKey(row: InventoryRow): string { return `${this.selectedLocationId()}|${this.queryGeneration}|${row.product.id}`; }
  async retryStock(row: InventoryRow): Promise<void> {
    const locationId = this.selectedLocationId(), query = this.queryGeneration, input = this.retryInputs()[this.retryKey(row)];
    if (!input || !this.canAccess() || this.stockFlowBusy() || this.inventoryLoading() || this.skuDebouncePending()
      || !this.rows().some(item => item.product.id === row.product.id) || this.selectedLocation()?.status !== 'active') return;
    const { fence, valid } = this.capture(); if (valid) { this.stockFlowBusy.set(true); try { await this.sendStock(row, locationId, input, fence, query); } finally { if (this.sessionCurrent(fence)) this.stockFlowBusy.set(false); } }
  }
  private async sendStock(row: InventoryRow, locationId: string, input: InventoryStockInput, fence: Fence, query: number): Promise<void> {
    const scopeCurrent = () => this.current(fence) && query === this.queryGeneration && locationId === this.selectedLocationId();
    if (!scopeCurrent() || !locationId || this.stockBusyProductId()) return;
    const retryKey = `${locationId}|${query}|${row.product.id}`;
    this.stockBusyProductId.set(row.product.id); this.stockErrors.update(value => ({ ...value, [row.product.id]: '' }));
    try {
      const result = await this.api.adjustStock(row.product.id, locationId, input);
      if (!scopeCurrent()) return;
      this.rows.update(items => items.map(item => item.product.id === row.product.id ? { ...item, balance: result.balance, stockStatus: this.rowStatus(result.balance, item.settings) } : item));
      this.retryInputs.update(value => { const next = { ...value }; delete next[retryKey]; return next; });
      this.stockNeedsReload.update(value => ({ ...value, [row.product.id]: false })); this.stockRequestId = ''; this.stockRequestKey = '';
      this.toast.success('Physical stock movement recorded.');
      if (this.historyProductId() === row.product.id && this.movementDialogRef) {
        this.movements.set([]); this.movementCursor.set(null); this.movementPage.set(1); this.movementPageCursors = [null];
        this.historyGeneration++; await this.requestMovementPage(row, 1, null);
      }
      await this.refreshStatusFilteredQuery();
    } catch (error) {
      if (!scopeCurrent()) return;
      this.stockErrors.update(value => ({ ...value, [row.product.id]: safeError(error) }));
      if (error instanceof StoreApiError && error.code === 'conflict') {
        this.stockNeedsReload.update(value => ({ ...value, [row.product.id]: true })); this.stockRequestId = ''; this.stockRequestKey = '';
        this.retryInputs.update(value => { const next = { ...value }; delete next[retryKey]; return next; });
        this.toast.error('Stock or product unit changed. Reload the inventory row before making another movement.');
      } else {
        this.retryInputs.update(value => ({ ...value, [retryKey]: input }));
        this.toast.error('Could not confirm the stock movement. Retry the exact same request or reload after a conflict.');
      }
    } finally { if (this.sessionCurrent(fence)) this.stockBusyProductId.set(''); }
  }
  async reloadInventoryRow(row: InventoryRow): Promise<void> {
    if (!this.canAccess() || this.inventoryLoading()) return;
    this.stockNeedsReload.update(value => ({ ...value, [row.product.id]: false }));
    this.stockErrors.update(value => ({ ...value, [row.product.id]: '' })); this.resetInventoryQuery(); await this.loadInventory(true);
  }

  async exportFilteredBalances(): Promise<void> {
    const location = this.selectedLocation();
    if (!this.canAccess() || !location || this.exporting() || this.stockFlowBusy() || this.inventoryLoading() || this.skuDebouncePending()) return;
    const { fence, valid } = this.capture(); if (!valid) return;
    const generation = ++this.exportGeneration, query = this.queryGeneration, filters = this.filters(), collected: InventoryRow[] = [];
    this.exportRows = collected;
    this.exporting.set(true); this.exportError.set(''); this.exportProgress.set('Preparing filtered balance export…');
    let cursor: string | null = null;
    try {
      for (let request = 1; request <= 50; request++) {
        if (!this.exportCurrent(generation, fence, query, location.id)) return;
        const page = await this.api.listInventory(location.id, cursor, filters);
        if (!this.exportCurrent(generation, fence, query, location.id)) return;
        collected.push(...page.items); this.exportProgress.set(`Preparing export: ${collected.length} products collected…`);
        if (!page.nextCursor) {
          this.downloadCsv(inventoryRowsCsv(collected, location), `inventory-${location.code.toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv`);
          this.toast.success(`Exported ${collected.length} filtered balance rows.`); return;
        }
        cursor = page.nextCursor;
        if (request === 50) throw new Error('limit');
      }
    } catch (error) {
      if (this.exportCurrent(generation, fence, query, location.id)) {
        const message = error instanceof Error && error.message === 'limit' ? 'Too many results to export at once. Narrow your filters and try again. No file was downloaded.' : safeError(error);
        this.exportError.set(message); this.toast.error('Filtered balance export failed. No CSV was downloaded.');
      }
    } finally {
      collected.length = 0;
      if (this.exportRows === collected) this.exportRows = null;
      if (this.exportGeneration === generation) { this.exporting.set(false); this.exportProgress.set(''); }
    }
  }
  private exportCurrent(generation: number, fence: Fence, query: number, locationId: string): boolean {
    return generation === this.exportGeneration && this.current(fence) && query === this.queryGeneration && locationId === this.selectedLocationId();
  }
  cancelExport(): void {
    if (this.exporting()) this.exportGeneration++;
    if (this.exportRows) this.exportRows.length = 0; this.exportRows = null;
    this.exporting.set(false); this.exportProgress.set(''); this.exportError.set('');
  }
  async exportHistory(row: InventoryRow): Promise<void> {
    const location = this.selectedLocation();
    if (!this.canAccess() || !location || this.historyExporting() || !this.movementDialogRef || this.historyProductId() !== row.product.id) return;
    const { fence, valid } = this.capture(); if (!valid) return;
    const generation = ++this.historyExportGeneration, history = this.historyGeneration, query = this.queryGeneration, locationId = location.id, moves: InventoryMovement[] = [];
    this.historyExportRows = moves;
    this.historyExporting.set(true); this.historyExportError.set(''); let cursor: string | null = null;
    const current = () => generation === this.historyExportGeneration && history === this.historyGeneration && query === this.queryGeneration
      && this.current(fence) && this.selectedLocationId() === locationId && this.historyProductId() === row.product.id && !!this.movementDialogRef;
    try {
      for (let request = 1; request <= 50; request++) {
        if (!current()) return;
        const page = await this.api.listMovements(row.product.id, locationId, cursor);
        if (!current()) return;
        moves.push(...page.items);
        if (!page.nextCursor) {
          this.downloadCsv(inventoryMovementsCsv(moves, row.product, location, this.locations()), `movements-${row.product.sku.toLowerCase()}-${location.code.toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv`);
          this.toast.success(`Exported ${moves.length} movement records.`); return;
        }
        cursor = page.nextCursor;
        if (request === 50) throw new Error('limit');
      }
    } catch (error) {
      if (current()) { this.historyExportError.set(error instanceof Error && error.message === 'limit' ? 'This history is too large to export at once. No file was downloaded.' : safeError(error)); this.toast.error('Movement export failed. No CSV was downloaded.'); }
    } finally { moves.length = 0; if (this.historyExportRows === moves) this.historyExportRows = null; if (this.historyExportGeneration === generation) this.historyExporting.set(false); }
  }
  cancelHistoryExport(): void {
    if (this.historyExporting()) this.historyExportGeneration++;
    if (this.historyExportRows) this.historyExportRows.length = 0; this.historyExportRows = null; this.historyExporting.set(false); this.historyExportError.set('');
  }
  private downloadCsv(contents: string, filename: string): void {
    const url = URL.createObjectURL(new Blob([contents], { type: 'text/csv;charset=utf-8;' }));
    try { const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click(); }
    finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
  }

  loadMoreSuppliers(): void { if (this.supplierCursor() && !this.suppliersLoading()) this.loadSupplierOptions(); }
  stockStatusLabel(row: InventoryRow): string { const status = row.stockStatus ?? this.rowStatus(row.balance, row.settings); return ({ unknown: 'Unknown', zero: 'Zero', low: 'Low', 'in-stock': 'In stock' })[status]; }
  stockStatusBadge(row: InventoryRow): string { const status = row.stockStatus ?? this.rowStatus(row.balance, row.settings); return `kt-badge kt-badge-sm ${status === 'unknown' ? 'kt-badge-mono kt-badge-outline' : status === 'zero' ? 'kt-badge-destructive' : status === 'low' ? 'kt-badge-warning' : 'kt-badge-success'}`; }
  supplierName(id: string): string {
    if (!id) return 'Supplier not set';
    return this.suppliers().find(supplier => supplier.id === id)?.name ?? 'Supplier not loaded';
  }
  unitLabel(row: InventoryRow): string { return row.product.unitCode ?? 'Unit not set'; }
  visualKind(row: InventoryRow): 'panel' | 'inverter' | 'battery' | 'rail' | 'combiner' {
    switch (row.product.category) {
      case 'Panels': return 'panel'; case 'Inverters': return 'inverter'; case 'Batteries': return 'battery';
      case 'Mounting': return 'rail'; default: return 'combiner';
    }
  }
  trackRow(_index: number, row: InventoryRow): string { return row.product.id; }
}
