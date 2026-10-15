import { Dialog } from '@angular/cdk/dialog';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NavigationCancel, NavigationStart, Router, provideRouter } from '@angular/router';
import type { Event as RouterEvent } from '@angular/router';
import { Subject } from 'rxjs';
import { computed, signal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminProduct, AdminSupplier } from '../../core/admin-catalog.models';
import { AdminAccessService } from '../../core/admin-access.service';
import { AdminCatalogApiService } from '../../core/admin-catalog-api.service';
import { AuthSessionService } from '../../core/auth-session.service';
import { InventoryApiService } from '../../core/inventory-api.service';
import type { InventoryBalance, InventoryLocation, InventoryMovement, InventoryRow, InventoryStockInput, InventoryStockResult } from '../../core/inventory.models';
import { StoreApiError } from '../../core/store-api.service';
import { ToastService } from '../../core/toast.service';
import { Inventory, InventoryStockDialog } from './inventory';

const LOCATION = '123e4567-e89b-42d3-a456-426614174000';
const PRODUCT = '223e4567-e89b-42d3-a456-426614174000';
const SUPPLIER = '323e4567-e89b-42d3-a456-426614174000';
const NOW = () => new Date().toISOString();
function location(status: 'active' | 'inactive' = 'active'): InventoryLocation {
  const at = NOW(); return { id: LOCATION, schemaVersion: 1, code: 'MAIN', name: 'Main depot', notes: '', status, version: 2, createdAt: at, updatedAt: at, createdBy: 'admin-1' };
}
function product(): AdminProduct {
  const at = NOW(); return { id: PRODUCT, sku: 'PANEL-1', name: 'Solar panel', brand: 'Example', category: 'Panels', unitCode: 'panel', description: '', amountMinor: null, supplierId: SUPPLIER, schemaVersion: 1, version: 7, state: 'draft', currency: 'PHP', createdBy: 'admin-1', createdAt: at, updatedAt: at };
}
function balance(onHand = 0, version = 1): InventoryBalance {
  const at = NOW(); return { schemaVersion: 1, productId: PRODUCT, locationId: LOCATION, unitCode: 'panel', onHand, version, updatedAt: at, observedAt: at, updatedBy: 'admin-1' };
}
function row(onHand: number | null = null): InventoryRow { return { product: product(), balance: onHand === null ? null : balance(onHand) }; }
function rowAt(index: number): InventoryRow {
  return { product: { ...product(), id: '223e4567-e89b-42d3-a456-' + index.toString(16).padStart(12, '0'), sku: 'PANEL-' + index }, balance: null };
}
function movement(input: InventoryStockInput, after: number, version: number): InventoryMovement {
  const at = input.observedAt; const delta = input.kind === 'issue' || input.kind === 'damage' ? -input.quantity : input.quantity;
  return { id: input.requestId, schemaVersion: 1, productId: PRODUCT, locationId: LOCATION, unitCode: 'panel', kind: input.kind,
    quantity: input.quantity, delta, onHandBefore: input.kind === 'opening' ? null : after - delta, onHandAfter: after, version,
    reason: input.reason, observedAt: at, createdAt: at, actorUid: 'admin-1' };
}
function historyMovement(version: number, productId = PRODUCT): InventoryMovement {
  const requestId = `423e4567-e89b-42d3-a456-${version.toString(16).padStart(12, '0')}`;
  const opening = version === 1;
  return { ...movement({ requestId, expectedVersion: opening ? null : version - 1, expectedProductVersion: 7,
    kind: opening ? 'opening' : 'receipt', quantity: opening ? 0 : 1, reason: `Receipt ${version}`, observedAt: NOW() }, opening ? 0 : version, version), productId };
}
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(yes => { resolve = yes; }); return { promise, resolve }; }

describe('admin physical inventory', () => {
  let fixture: ComponentFixture<Inventory>;
  let page: Inventory;
  let revision: ReturnType<typeof signal<number>>;
  let authorized: ReturnType<typeof signal<boolean>>;
  let api: { listLocations: ReturnType<typeof vi.fn>; createLocation: ReturnType<typeof vi.fn>; updateLocation: ReturnType<typeof vi.fn>;
    listInventory: ReturnType<typeof vi.fn>; listMovements: ReturnType<typeof vi.fn>; adjustStock: ReturnType<typeof vi.fn> };
  let catalog: { listSuppliers: ReturnType<typeof vi.fn> };
  let toast: { success: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };

  async function open() {
    fixture = TestBed.createComponent(Inventory); page = fixture.componentInstance; fixture.detectChanges();
    for (let i = 0; i < 6; i++) await Promise.resolve();
    fixture.detectChanges();
  }
  async function submitStock(rowValue: InventoryRow, values: { kind?: InventoryStockDialog['kind']; quantity: number; reason: string }) {
    const pending = page.openStockDialog(rowValue);
    const dialog = TestBed.inject(Dialog).openDialogs[0].componentInstance as InventoryStockDialog;
    if (values.kind) dialog.kind = values.kind;
    dialog.quantity = values.quantity; dialog.reason = values.reason; dialog.submit();
    return pending;
  }

  beforeEach(() => {
    revision = signal(1); authorized = signal(true);
    const firstRow = row();
    api = {
      listLocations: vi.fn(async () => ({ items: [location()], nextCursor: null })),
      createLocation: vi.fn(), updateLocation: vi.fn(),
      listInventory: vi.fn(async () => ({ items: [firstRow], nextCursor: null })),
      listMovements: vi.fn(async () => ({ items: [], nextCursor: null })),
      adjustStock: vi.fn(async (_productId: string, _locationId: string, input: InventoryStockInput) => {
        const before = input.expectedVersion === null ? 0 : 10;
        const result = balance(before + (input.kind === 'issue' || input.kind === 'damage' || input.kind === 'correction' && input.quantity < 0 ? -Math.abs(input.quantity) : input.quantity), (input.expectedVersion ?? 0) + 1);
        return { balance: result, movement: movement(input, result.onHand, result.version) };
      }),
    };
    catalog = { listSuppliers: vi.fn(async () => ({ items: [{ id: SUPPLIER, name: 'North Solar', status: 'active' } as AdminSupplier], nextCursor: null })) };
    toast = { success: vi.fn(), error: vi.fn() };
    TestBed.configureTestingModule({ providers: [
      provideRouter([]),
      { provide: InventoryApiService, useValue: api },
      { provide: AdminCatalogApiService, useValue: catalog },
      { provide: AdminAccessService, useValue: { authorized, status: computed(() => authorized() ? 'authorized' : 'forbidden'), retry: vi.fn() } },
      { provide: AuthSessionService, useValue: { sessionRevision: revision, session: signal({ source: 'firebase', customerId: 'admin-1' }), status: signal('signed-in'), busy: signal(false) } },
      { provide: ToastService, useValue: toast },
    ] });
  });
  afterEach(() => { TestBed.inject(Dialog).closeAll(); fixture?.destroy(); TestBed.resetTestingModule(); });

  it('shows unknown stock and inactive locations explicitly without synthetic totals or alerts', async () => {
    api.listLocations.mockResolvedValueOnce({ items: [location('inactive')], nextCursor: null });
    await open();
    expect(fixture.nativeElement.textContent).toContain('Unknown');
    expect(fixture.nativeElement.textContent).toContain('Inactive location — stock changes are blocked');
    expect(fixture.nativeElement.textContent).toContain('Unknown means no count has been recorded.');
    expect(fixture.nativeElement.textContent).not.toMatch(/API requests|before pagination|frozen snapshot|atomically/);
    expect(fixture.nativeElement.textContent).not.toContain('low allocation');
    expect(fixture.nativeElement.textContent).not.toContain('Sample retail value');
    await page.toggleHistory(page.rows()[0]);
    expect(TestBed.inject(Dialog).openDialogs).toHaveLength(1);
    TestBed.inject(Dialog).closeAll(); await Promise.resolve();
    await page.openStockDialog(row());
    expect(TestBed.inject(Dialog).openDialogs).toHaveLength(0);
    expect(api.adjustStock).not.toHaveBeenCalled();
  });

  it('creates a zero opening balance with the product version and confirms success', async () => {
    await open(); const productRow = page.rows()[0];
    await submitStock(productRow, { quantity: 0, reason: 'Counted empty shelf' });
    expect(api.adjustStock).toHaveBeenCalledWith(PRODUCT, LOCATION, expect.objectContaining({
      expectedVersion: null, expectedProductVersion: 7, kind: 'opening', quantity: 0, reason: 'Counted empty shelf', requestId: expect.any(String),
    }));
    expect(page.rows()[0].balance?.onHand).toBe(0);
    expect(toast.success).toHaveBeenCalledWith('Physical stock movement recorded.');
  });

  it('accepts a signed negative correction only after explicit confirmation', async () => {
    api.listInventory.mockResolvedValueOnce({ items: [row(10)], nextCursor: null });
    await open(); const productRow = page.rows()[0];
    const pending = page.openStockDialog(productRow);
    const dialog = TestBed.inject(Dialog).openDialogs[0].componentInstance as InventoryStockDialog;
    dialog.kind = 'correction'; dialog.quantity = -2; dialog.reason = 'Cycle count discrepancy'; dialog.submit();
    await Promise.resolve(); await Promise.resolve();
    expect(TestBed.inject(Dialog).openDialogs).toHaveLength(1);
    expect(api.adjustStock).not.toHaveBeenCalled();
    TestBed.inject(Dialog).openDialogs[0].close(true);
    await pending;
    expect(api.adjustStock).toHaveBeenCalledWith(PRODUCT, LOCATION, expect.objectContaining({ kind: 'correction', quantity: -2, expectedProductVersion: 7 }));
    expect(toast.success).toHaveBeenCalledOnce();
  });

  it('fetches ten-row pages, replaces rows, re-fetches Previous, and disables Next on a partial final page', async () => {
    api.listInventory.mockResolvedValueOnce({ items: Array.from({ length: 10 }, (_, index) => rowAt(index)), nextCursor: 'opaque_1' });
    await open();
    api.listInventory.mockResolvedValueOnce({ items: Array.from({ length: 10 }, (_, index) => rowAt(index + 10)), nextCursor: 'opaque_2' });
    page.nextInventoryPage(); await Promise.resolve(); await Promise.resolve();
    expect(api.listInventory).toHaveBeenLastCalledWith(LOCATION, 'opaque_1', {});
    expect(page.inventoryPage()).toBe(2); expect(page.rows()).toHaveLength(10); expect(page.rows()[0].product.sku).toBe('PANEL-10');
    api.listInventory.mockResolvedValueOnce({ items: Array.from({ length: 5 }, (_, index) => rowAt(index + 20)), nextCursor: null });
    page.nextInventoryPage(); await Promise.resolve(); await Promise.resolve(); fixture.detectChanges();
    expect(page.inventoryPage()).toBe(3); expect(page.rows()).toHaveLength(5);
    expect(fixture.nativeElement.textContent).toContain('Page 3 · 10 per page');
    const next = [...fixture.nativeElement.querySelectorAll('button')].find(button => button.textContent.trim() === 'Next') as HTMLButtonElement;
    expect(next.disabled).toBe(true);
    api.listInventory.mockResolvedValueOnce({ items: Array.from({ length: 10 }, (_, index) => rowAt(index + 30)), nextCursor: 'opaque_2' });
    page.previousInventoryPage(); await Promise.resolve(); await Promise.resolve();
    expect(api.listInventory).toHaveBeenLastCalledWith(LOCATION, 'opaque_1', {});
    expect(page.inventoryPage()).toBe(2); expect(page.rows()[0].product.sku).toBe('PANEL-30');
  });

  it('resets product pagination on filters and blocks Next while an SKU debounce is pending', async () => {
    api.listInventory.mockResolvedValueOnce({ items: Array.from({ length: 10 }, (_, index) => rowAt(index)), nextCursor: 'opaque_1' });
    await open();
    api.listInventory.mockResolvedValueOnce({ items: Array.from({ length: 10 }, (_, index) => rowAt(index + 10)), nextCursor: 'opaque_2' });
    page.nextInventoryPage(); await Promise.resolve(); await Promise.resolve();
    const callCount = api.listInventory.mock.calls.length;
    page.setSkuPrefix('PANEL');
    page.nextInventoryPage();
    expect(api.listInventory).toHaveBeenCalledTimes(callCount);
    api.listInventory.mockResolvedValueOnce({ items: [rowAt(40)], nextCursor: null });
    page.setCategory('Panels'); await Promise.resolve(); await Promise.resolve();
    expect(api.listInventory).toHaveBeenLastCalledWith(LOCATION, null, { skuPrefix: 'PANEL', category: 'Panels' });
    expect(page.inventoryPage()).toBe(1);
  });

  it('retries a failed target page with the same cursor and leaves the current page intact', async () => {
    api.listInventory.mockResolvedValueOnce({ items: Array.from({ length: 10 }, (_, index) => rowAt(index)), nextCursor: 'opaque_1' });
    await open();
    api.listInventory.mockRejectedValueOnce(new StoreApiError('timeout'));
    page.nextInventoryPage(); await Promise.resolve(); await Promise.resolve();
    expect(page.inventoryPage()).toBe(1); expect(page.rows()[0].product.sku).toBe('PANEL-0');
    expect(page.inventoryPageError()).toBeTruthy();
    api.listInventory.mockResolvedValueOnce({ items: [rowAt(10)], nextCursor: null });
    page.retryInventoryPage(); await Promise.resolve(); await Promise.resolve();
    expect(api.listInventory.mock.calls.slice(-2).map(call => call[1])).toEqual(['opaque_1', 'opaque_1']);
    expect(page.inventoryPage()).toBe(2); expect(page.rows()[0].product.sku).toBe('PANEL-10');
  });

  it('ignores a stale page response after a filter query resets pagination', async () => {
    api.listInventory.mockResolvedValueOnce({ items: Array.from({ length: 10 }, (_, index) => rowAt(index)), nextCursor: 'opaque_1' });
    await open();
    const stale = deferred<{ items: InventoryRow[]; nextCursor: string | null }>();
    api.listInventory.mockReturnValueOnce(stale.promise);
    page.nextInventoryPage();
    api.listInventory.mockResolvedValueOnce({ items: [rowAt(50)], nextCursor: null });
    page.setCategory('Panels'); await Promise.resolve(); await Promise.resolve();
    stale.resolve({ items: [rowAt(20)], nextCursor: 'opaque_old' }); await Promise.resolve(); await Promise.resolve();
    expect(page.inventoryPage()).toBe(1); expect(page.rows()[0].product.sku).toBe('PANEL-50');
    expect(api.listInventory).toHaveBeenLastCalledWith(LOCATION, null, { category: 'Panels' });
  });

  it('retries uncertain stock requests with the same request ID and exact timestamp/payload', async () => {
    api.adjustStock.mockRejectedValueOnce(new StoreApiError('timeout'));
    await open(); const productRow = page.rows()[0];
    await submitStock(productRow, { quantity: 0, reason: 'Initial count' });
    const first = api.adjustStock.mock.calls[0][2] as InventoryStockInput;
    expect(page.retryInputs()[page.retryKey(productRow)]).toEqual(first);
    await page.retryStock(productRow);
    expect(api.adjustStock.mock.calls[1][2]).toEqual(first);
    expect(toast.error).toHaveBeenCalledOnce(); expect(toast.success).toHaveBeenCalledOnce();
  });

  it('ignores a mutation result after the admin revision changes', async () => {
    const pendingResult = deferred<InventoryStockResult>();
    api.adjustStock.mockReturnValueOnce(pendingResult.promise);
    await open(); const productRow = page.rows()[0];
    const saving = submitStock(productRow, { quantity: 0, reason: 'Opening count' });
    revision.set(2); authorized.set(false);
    pendingResult.resolve({ balance: balance(), movement: movement({ requestId: '523e4567-e89b-42d3-a456-426614174000', expectedVersion: null, expectedProductVersion: 7, kind: 'opening', quantity: 0, reason: 'Opening count', observedAt: NOW() }, 0, 1) });
    await saving;
    expect(toast.success).not.toHaveBeenCalled(); expect(toast.error).not.toHaveBeenCalled();
    expect(page.rows()[0].balance).toBeNull();
  });

  it('disables the stock dialog submit until valid user input is entered', async () => {
    await open(); const pending = page.openStockDialog(page.rows()[0]);
    const dialog = TestBed.inject(Dialog).openDialogs[0].componentInstance as InventoryStockDialog;
    fixture.detectChanges();
    await fixture.whenStable();
    TestBed.tick();
    const submit = document.querySelector<HTMLButtonElement>('.cdk-overlay-container button[type="submit"]');
    expect(submit?.disabled).toBe(true);
    const quantity = document.querySelector<HTMLInputElement>('#movement-quantity')!;
    const reason = document.querySelector<HTMLInputElement>('#movement-reason')!;
    quantity.value = '0'; quantity.dispatchEvent(new Event('input', { bubbles: true }));
    reason.value = 'Counted empty shelf'; reason.dispatchEvent(new Event('input', { bubbles: true }));
    await fixture.whenStable();
    TestBed.tick();
    expect(dialog.quantity).toBe(0); expect(dialog.reason).toBe('Counted empty shelf'); expect(dialog.valid).toBe(true);
    expect(submit?.disabled).toBe(false);
    dialog.submit(); await pending;
  });

  it('retains location-create request identity for an unchanged uncertain retry', async () => {
    const created = { ...location(), code: 'ANNEX', name: 'Annex' };
    api.createLocation.mockRejectedValueOnce(new StoreApiError('timeout')).mockResolvedValueOnce(created);
    await open(); await page.openCreateLocation(); page.locationCode.set('annex'); page.locationName.set('Annex');
    await page.saveLocation(); const firstId = api.createLocation.mock.calls[0][0].requestId;
    await page.saveLocation();
    expect(api.createLocation.mock.calls[1][0].requestId).toBe(firstId);
    expect(page.locations()[0]).toEqual(created); expect(toast.success).toHaveBeenCalledWith('Inventory location created.');
  });

  it('does not switch location or filters while a stock write is pending', async () => {
    const other = { ...location(), id: '623e4567-e89b-42d3-a456-426614174000', code: 'ANNEX' };
    api.listLocations.mockResolvedValueOnce({ items: [location(), other], nextCursor: null });
    const pendingResult = deferred<InventoryStockResult>();
    api.adjustStock.mockReturnValueOnce(pendingResult.promise);
    await open(); const currentRow = page.rows()[0];
    const writing = page.openStockDialog(currentRow);
    const dialog = TestBed.inject(Dialog).openDialogs[0].componentInstance as InventoryStockDialog;
    dialog.quantity = 0; dialog.reason = 'Opening count'; dialog.submit();
    await Promise.resolve(); await Promise.resolve();
    page.setCategory('Panels'); await page.selectLocation(other.id);
    expect(page.selectedLocationId()).toBe(LOCATION); expect(page.category()).toBe('');
    pendingResult.resolve({ balance: balance(), movement: movement({ requestId: '723e4567-e89b-42d3-a456-426614174000', expectedVersion: null, expectedProductVersion: 7, kind: 'opening', quantity: 0, reason: 'Opening count', observedAt: NOW() }, 0, 1) });
    await writing; expect(page.rows()[0].balance?.onHand).toBe(0);
    expect(api.adjustStock).toHaveBeenCalledWith(PRODUCT, LOCATION, expect.anything());
  });

  it('opens movement history in a dialog and restores focus after Escape or backdrop close', async () => {
    api.listMovements.mockResolvedValue({ items: [historyMovement(1)], nextCursor: null });
    await open();
    const trigger = [...fixture.nativeElement.querySelectorAll('button')].find(button => button.textContent.trim() === 'Movement history') as HTMLButtonElement;
    trigger.focus(); await page.toggleHistory(page.rows()[0]); fixture.detectChanges();
    expect(TestBed.inject(Dialog).openDialogs).toHaveLength(1);
    expect(document.body.textContent).toContain('Main depot');
    expect(document.body.textContent).toContain('Page 1 · 5 per page');
    expect(document.body.textContent).toContain('Receipt 1');
    const next = [...document.querySelectorAll('.cdk-dialog-container button')].find(button => button.textContent.trim() === 'Next') as HTMLButtonElement;
    expect(next.disabled).toBe(true);
    document.querySelector<HTMLElement>('.cdk-overlay-container')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, which: 27, bubbles: true }));
    await Promise.resolve(); fixture.detectChanges();
    expect(TestBed.inject(Dialog).openDialogs).toHaveLength(0);
    expect(document.activeElement).toBe(trigger);

    await page.toggleHistory(page.rows()[0]); fixture.detectChanges();
    document.querySelector<HTMLElement>('.cdk-overlay-backdrop')!.click();
    await Promise.resolve();
    expect(TestBed.inject(Dialog).openDialogs).toHaveLength(0);
    expect(document.activeElement).toBe(trigger);
  });

  it('replaces movement rows on Next and freshly fetches Previous', async () => {
    const first = [10, 9, 8, 7, 6].map(version => historyMovement(version));
    const second = [5, 4, 3, 2, 1].map(version => historyMovement(version));
    api.listMovements.mockResolvedValueOnce({ items: first, nextCursor: 'older_1' })
      .mockResolvedValueOnce({ items: second, nextCursor: null })
      .mockResolvedValueOnce({ items: first, nextCursor: 'older_1' });
    await open(); const rowValue = page.rows()[0];
    await page.toggleHistory(rowValue);
    page.nextMovements(rowValue); await Promise.resolve(); await Promise.resolve(); fixture.detectChanges();
    expect(page.movementPage()).toBe(2); expect(page.movements()).toEqual(second);
    expect(document.body.textContent).toContain('Page 2 · 5 per page');
    const next = [...document.querySelectorAll<HTMLButtonElement>('.cdk-dialog-container button')].find(button => button.textContent?.trim() === 'Next')!;
    expect(next.disabled).toBe(true);
    page.nextMovements(rowValue); expect(api.listMovements).toHaveBeenCalledTimes(2);
    page.previousMovements(rowValue); await Promise.resolve(); await Promise.resolve();
    expect(api.listMovements.mock.calls.map(call => call[2])).toEqual([null, 'older_1', null]);
    expect(page.movementPage()).toBe(1); expect(page.movements()).toEqual(first);
  });

  it('keeps the visible movement page on failure and retries the exact cursor', async () => {
    const first = [historyMovement(5)]; const second = [historyMovement(4)];
    api.listMovements.mockResolvedValueOnce({ items: first, nextCursor: 'older_1' })
      .mockRejectedValueOnce(new StoreApiError('timeout'))
      .mockResolvedValueOnce({ items: second, nextCursor: null });
    await open(); const rowValue = page.rows()[0]; await page.toggleHistory(rowValue);
    page.nextMovements(rowValue); await Promise.resolve(); await Promise.resolve();
    expect(page.movementPage()).toBe(1); expect(page.movements()).toEqual(first); expect(page.movementError()).toBeTruthy();
    page.retryMovements(rowValue); await Promise.resolve(); await Promise.resolve();
    expect(api.listMovements.mock.calls.slice(-2).map(call => call[2])).toEqual(['older_1', 'older_1']);
    expect(page.movementPage()).toBe(2); expect(page.movements()).toEqual(second);
  });

  it('fences a closed history request from a reopened dialog for the same product', async () => {
    const stale = deferred<{ items: InventoryMovement[]; nextCursor: string | null }>();
    const fresh = historyMovement(3);
    api.listMovements.mockReturnValueOnce(stale.promise).mockResolvedValueOnce({ items: [fresh], nextCursor: null });
    await open(); const rowValue = page.rows()[0];
    const firstOpen = page.toggleHistory(rowValue);
    TestBed.inject(Dialog).openDialogs[0].close(); await Promise.resolve();
    await page.toggleHistory(rowValue);
    stale.resolve({ items: [historyMovement(5)], nextCursor: 'stale_cursor' });
    await firstOpen; await Promise.resolve(); await Promise.resolve();
    expect(page.historyProductId()).toBe(PRODUCT); expect(page.movements()).toEqual([fresh]);
    expect(page.movementCursor()).toBeNull(); expect(page.movementPage()).toBe(1);
  });

  it('closes and fences movement history as soon as a filter edit or table-page request starts', async () => {
    const stale = deferred<{ items: InventoryMovement[]; nextCursor: string | null }>();
    api.listInventory.mockResolvedValue({ items: [row()], nextCursor: 'rows_2' });
    api.listMovements.mockReturnValueOnce(stale.promise);
    await open(); const rowValue = page.rows()[0];
    void page.toggleHistory(rowValue);
    page.setSkuPrefix('PANEL');
    expect(TestBed.inject(Dialog).openDialogs).toHaveLength(0); expect(page.historyProductId()).toBe('');
    page.clearFilters(); await Promise.resolve(); await Promise.resolve();
    await Promise.resolve(); await Promise.resolve();
    void page.toggleHistory(page.rows()[0]);
    page.nextInventoryPage();
    expect(TestBed.inject(Dialog).openDialogs).toHaveLength(0); expect(page.historyProductId()).toBe('');
    stale.resolve({ items: [historyMovement(5)], nextCursor: 'stale_cursor' });
    await Promise.resolve(); await Promise.resolve();
    expect(page.movements()).toEqual([]); expect(page.movementCursor()).toBeNull();
  });

  it('actually handles a stock conflict by blocking retry until the row reloads', async () => {
    api.adjustStock.mockRejectedValueOnce(new StoreApiError('conflict'));
    await open(); const productRow = page.rows()[0];
    await submitStock(productRow, { quantity: 0, reason: 'Counted empty shelf' });
    expect(page.stockNeedsReload()[PRODUCT]).toBe(true);
    expect(page.retryInputs()[page.retryKey(productRow)]).toBeUndefined();
    expect(toast.error).toHaveBeenCalledWith('Stock or product unit changed. Reload the inventory row before making another movement.');
  });

  it('blocks opening history during page loads, pending SKU edits and stock flows', async () => {
    await open(); const currentRow = page.rows()[0];
    page.inventoryLoading.set(true); await page.toggleHistory(currentRow);
    page.inventoryLoading.set(false); page.skuDebouncePending.set(true); await page.toggleHistory(currentRow);
    page.skuDebouncePending.set(false); page.stockFlowBusy.set(true); await page.toggleHistory(currentRow);
    page.stockFlowBusy.set(false); page.locationSaveBusy.set(true); await page.toggleHistory(currentRow);
    page.locationSaveBusy.set(false);
    expect(TestBed.inject(Dialog).openDialogs).toHaveLength(0);
    expect(api.listMovements).not.toHaveBeenCalled();
    await page.toggleHistory(currentRow); expect(api.listMovements).toHaveBeenCalledOnce();
  });

  it('closes private history on account changes and ignores its late response', async () => {
    const stale = deferred<{ items: InventoryMovement[]; nextCursor: string | null }>();
    api.listMovements.mockReturnValueOnce(stale.promise);
    await open(); const pending = page.toggleHistory(page.rows()[0]);
    authorized.set(false); revision.set(2); fixture.detectChanges();
    expect(TestBed.inject(Dialog).openDialogs).toHaveLength(0);
    stale.resolve({ items: [historyMovement(5)], nextCursor: 'stale_cursor' }); await pending;
    expect(page.movements()).toEqual([]); expect(page.movementError()).toBe(''); expect(page.historyProductId()).toBe('');
  });

  it('closes private history immediately when navigation starts', async () => {
    const events = new Subject<RouterEvent>();
    vi.spyOn(TestBed.inject(Router), 'events', 'get').mockReturnValue(events.asObservable());
    const stale = deferred<{ items: InventoryMovement[]; nextCursor: string | null }>();
    api.listMovements.mockReturnValueOnce(stale.promise);
    await open(); const pending = page.toggleHistory(page.rows()[0]);
    events.next(new NavigationStart(1, '/admin/products'));
    expect(TestBed.inject(Dialog).openDialogs).toHaveLength(0);
    stale.resolve({ items: [historyMovement(5)], nextCursor: 'stale_cursor' }); await pending;
    expect(page.movements()).toEqual([]); expect(page.movementCursor()).toBeNull();
  });

  it('keeps an open stock draft usable when the admin cancels navigation', async () => {
    const events = new Subject<RouterEvent>();
    vi.spyOn(TestBed.inject(Router), 'events', 'get').mockReturnValue(events.asObservable());
    await open();
    const writing = page.openStockDialog(page.rows()[0]);
    const dialog = TestBed.inject(Dialog).openDialogs[0].componentInstance as InventoryStockDialog;
    dialog.quantity = 0; dialog.reason = 'Opening count';
    events.next(new NavigationStart(1, '/elsewhere'));
    const leaving = page.canLeave();
    TestBed.inject(Dialog).openDialogs[1].close(false);
    expect(await leaving).toBe(false);
    events.next(new NavigationCancel(1, '/elsewhere', 'Keep editing'));
    expect(TestBed.inject(Dialog).openDialogs[0].componentInstance).toBe(dialog);
    dialog.submit(); await writing;
    expect(api.adjustStock).toHaveBeenCalledWith(PRODUCT, LOCATION, expect.objectContaining({ reason: 'Opening count' }));
    expect(toast.success).toHaveBeenCalledOnce();
  });

  it('blocks leaving during a location save and clears a discarded edit on location selection', async () => {
    const other = { ...location(), id: '623e4567-e89b-42d3-a456-426614174000', code: 'ANNEX' };
    api.listLocations.mockResolvedValueOnce({ items: [location(), other], nextCursor: null });
    await open(); await page.openEditLocation(); page.locationName.set('Unsaved rename');
    const selection = page.selectLocation(other.id);
    TestBed.inject(Dialog).openDialogs[0].close(true);
    await selection;
    expect(page.selectedLocationId()).toBe(other.id); expect(page.locationForm()).toBeNull(); expect(page.locationTarget()).toBeNull();
    page.locationSaveBusy.set(true); expect(await page.canLeave()).toBe(false);
  });
});
