import { Dialog } from '@angular/cdk/dialog';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { computed, signal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminProduct } from '../../core/admin-catalog.models';
import { AdminAccessService } from '../../core/admin-access.service';
import { AdminCatalogApiService } from '../../core/admin-catalog-api.service';
import { AuthSessionService } from '../../core/auth-session.service';
import { InventoryApiService } from '../../core/inventory-api.service';
import type { InventoryBalance, InventoryCountInput, InventoryLocation, InventoryMovement, InventoryRow, InventorySettings, InventorySettingsInput, InventoryStockInput, InventoryStockResult, InventoryTransferInput, InventoryTransferResult } from '../../core/inventory.models';
import { StoreApiError } from '../../core/store-api.service';
import { ToastService } from '../../core/toast.service';
import { Inventory, InventoryCountDialog, InventoryDiscardDialog, InventorySettingsDialog, InventoryTransferDialog } from './inventory';

const LOCATION = '123e4567-e89b-42d3-a456-426614174000';
const DESTINATION = '623e4567-e89b-42d3-a456-426614174000';
const PRODUCT = '223e4567-e89b-42d3-a456-426614174000';
const SUPPLIER = '323e4567-e89b-42d3-a456-426614174000';
const NOW = () => new Date().toISOString();

function location(id = LOCATION, code = 'MAIN'): InventoryLocation {
  const at = NOW();
  return { id, schemaVersion: 1, code, name: code === 'MAIN' ? 'Main depot' : 'Annex', notes: '', status: 'active', version: 2, createdAt: at, updatedAt: at, createdBy: 'admin-1' };
}
function product(): AdminProduct {
  const at = NOW();
  return { id: PRODUCT, sku: 'PANEL-1', name: 'Solar panel', brand: 'Example', category: 'Panels', unitCode: 'panel', description: '', amountMinor: null, supplierId: SUPPLIER, schemaVersion: 1, version: 7, state: 'draft', currency: 'PHP', createdBy: 'admin-1', createdAt: at, updatedAt: at };
}
function balance(onHand = 0, version = 1, locationId = LOCATION): InventoryBalance {
  const at = NOW();
  return { schemaVersion: 1, productId: PRODUCT, locationId, unitCode: 'panel', onHand, version, updatedAt: at, observedAt: at, updatedBy: 'admin-1' };
}
function settings(reorderPoint: number | null, version = 1, locationId = LOCATION): InventorySettings {
  return { schemaVersion: 1, productId: PRODUCT, locationId, reorderPoint, version, updatedAt: NOW(), updatedBy: 'admin-1' };
}
function row(onHand: number | null = null, locationId = LOCATION, reorderPoint: number | null = null): InventoryRow {
  const currentBalance = onHand === null ? null : balance(onHand, 3, locationId);
  const currentSettings = reorderPoint === null ? null : settings(reorderPoint, 2, locationId);
  const status = !currentBalance ? 'unknown' : currentBalance.onHand === 0 ? 'zero'
    : currentSettings?.reorderPoint !== null && currentSettings?.reorderPoint !== undefined && currentBalance.onHand <= currentSettings.reorderPoint ? 'low' : 'in-stock';
  return { product: product(), balance: currentBalance, settings: currentSettings, stockStatus: status };
}
function movement(input: InventoryStockInput | InventoryCountInput, before: number | null, after: number, version: number, kind: InventoryMovement['kind'] = 'count', locationId = LOCATION): InventoryMovement {
  const delta = after - (before ?? 0);
  return { id: input.requestId, schemaVersion: 1, productId: PRODUCT, locationId, unitCode: 'panel', kind,
    quantity: kind === 'count' ? after : Math.abs(delta), delta, onHandBefore: before, onHandAfter: after, version,
    reason: input.reason, observedAt: input.observedAt, createdAt: NOW(), actorUid: 'admin-1' };
}
function countResult(input: InventoryCountInput, after: number): InventoryStockResult {
  const before = input.expectedVersion === null ? null : 10;
  const version = (input.expectedVersion ?? 0) + 1;
  const resultBalance = balance(after, version); resultBalance.observedAt = input.observedAt;
  return { balance: resultBalance, movement: { ...movement(input, before, after, version), createdAt: resultBalance.updatedAt, observedAt: input.observedAt } };
}
function stockResult(input: InventoryStockInput, after: number): InventoryStockResult {
  const delta = input.kind === 'issue' || input.kind === 'damage' ? -Math.abs(input.quantity) : input.quantity;
  const version = (input.expectedVersion ?? 0) + 1;
  const resultBalance = balance(after, version); resultBalance.observedAt = input.observedAt;
  return { balance: resultBalance, movement: { id: input.requestId, schemaVersion: 1, productId: PRODUCT, locationId: LOCATION, unitCode: 'panel',
    kind: input.kind, quantity: input.quantity, delta, onHandBefore: after - delta, onHandAfter: after, version,
    reason: input.reason, observedAt: input.observedAt, createdAt: resultBalance.updatedAt, actorUid: 'admin-1' } };
}
function historyMovement(version: number): InventoryMovement {
  const at = NOW(); const id = '423e4567-e89b-42d3-a456-' + version.toString(16).padStart(12, '0');
  return { id, schemaVersion: 1, productId: PRODUCT, locationId: LOCATION, unitCode: 'panel', kind: 'receipt', quantity: 1, delta: 1,
    onHandBefore: version, onHandAfter: version + 1, version, reason: 'Receipt ' + version, observedAt: at, createdAt: at, actorUid: 'admin-1' };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(yes => { resolve = yes; });
  return { promise, resolve };
}
async function flush(): Promise<void> { for (let i = 0; i < 8; i++) await Promise.resolve(); }
function watchDownloads() {
  const createObjectURL = vi.fn(() => 'blob:inventory-test');
  const revokeObjectURL = vi.fn();
  class TestURL extends URL {
    static override createObjectURL = createObjectURL;
    static override revokeObjectURL = revokeObjectURL;
  }
  vi.stubGlobal('URL', TestURL);
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
  const revokeTimers: Array<() => void> = [];
  vi.spyOn(globalThis, 'setTimeout').mockImplementation(((handler: TimerHandler, delay?: number, ...args: unknown[]) => {
    if (typeof handler === 'function' && delay === 1000) revokeTimers.push(() => handler(...args));
    return 0;
  }) as typeof setTimeout);
  return { createObjectURL, revokeObjectURL, click, revokeTimers };
}

describe('admin inventory operations', () => {
  let fixture: ComponentFixture<Inventory>;
  let page: Inventory;
  let revision: ReturnType<typeof signal<number>>;
  let authorized: ReturnType<typeof signal<boolean>>;
  let api: {
    listLocations: ReturnType<typeof vi.fn>; listInventory: ReturnType<typeof vi.fn>; inventoryRow: ReturnType<typeof vi.fn>;
    listMovements: ReturnType<typeof vi.fn>; adjustStock: ReturnType<typeof vi.fn>; recordCount: ReturnType<typeof vi.fn>;
    transferStock: ReturnType<typeof vi.fn>; saveSettings: ReturnType<typeof vi.fn>;
  };
  let catalog: { listSuppliers: ReturnType<typeof vi.fn> };
  let toast: { success: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };

  async function open(firstRow = row(), locations = [location()]) {
    api.listLocations.mockResolvedValueOnce({ items: locations, nextCursor: null });
    api.listInventory.mockResolvedValueOnce({ items: [firstRow], nextCursor: null });
    fixture = TestBed.createComponent(Inventory); page = fixture.componentInstance; fixture.detectChanges();
    await flush(); fixture.detectChanges();
  }
  function dialog<T>(type: { new (...args: any[]): T }): T {
    return TestBed.inject(Dialog).openDialogs.find(ref => ref.componentInstance instanceof type)!.componentInstance as T;
  }

  beforeEach(() => {
    revision = signal(1); authorized = signal(true);
    api = {
      listLocations: vi.fn(async () => ({ items: [location()], nextCursor: null })),
      listInventory: vi.fn(async () => ({ items: [row()], nextCursor: null })),
      inventoryRow: vi.fn(async (_productId: string, locationId: string) => row(locationId === LOCATION ? 10 : 4, locationId)),
      listMovements: vi.fn(async () => ({ items: [], nextCursor: null })),
      adjustStock: vi.fn(async (_productId: string, _locationId: string, input: InventoryStockInput) => stockResult(input, input.kind === 'receipt' ? 11 : 0)),
      recordCount: vi.fn(async (_productId: string, _locationId: string, input: InventoryCountInput) => countResult(input, input.countedQuantity)),
      transferStock: vi.fn(async (_productId: string, _sourceId: string, input: InventoryTransferInput) => {
        const source = balance(10 - input.quantity, input.expectedSourceVersion + 1, LOCATION);
        const destination = balance(4 + input.quantity, input.expectedDestinationVersion + 1, DESTINATION);
        const make = (kind: 'transfer-out' | 'transfer-in', target: InventoryBalance, before: number, other: string): InventoryStockResult => ({
          balance: target,
          movement: { id: input.requestId, schemaVersion: 1, productId: PRODUCT, locationId: target.locationId, unitCode: 'panel', kind,
            quantity: input.quantity, delta: kind === 'transfer-out' ? -input.quantity : input.quantity, onHandBefore: before,
            onHandAfter: target.onHand, version: target.version, reason: input.reason, observedAt: input.observedAt,
            createdAt: target.updatedAt, actorUid: 'admin-1', transferId: input.requestId, otherLocationId: other },
        });
        return { source: make('transfer-out', source, 10, DESTINATION), destination: make('transfer-in', destination, 4, LOCATION) };
      }),
      saveSettings: vi.fn(async (_productId: string, _locationId: string, input: InventorySettingsInput) => settings(input.reorderPoint, (input.expectedVersion ?? 0) + 1)),
    };
    catalog = { listSuppliers: vi.fn(async () => ({ items: [{ id: SUPPLIER, name: 'North Solar', status: 'active' }], nextCursor: null })) };
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
  afterEach(() => { TestBed.inject(Dialog).closeAll(); fixture?.destroy(); TestBed.resetTestingModule(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it('reviews a physical count difference in the DOM and submits it with both expected versions', async () => {
    await open(row(10));
    const pending = page.openCountDialog(page.rows()[0]);
    const count = dialog(InventoryCountDialog);
    count.countedQuantity = 13; count.reason = 'Cycle count'; count.review(); fixture.detectChanges();
    expect(document.querySelector('.cdk-dialog-container')?.textContent).toContain('10 panel → 13 panel');
    expect(document.querySelector('.cdk-dialog-container')?.textContent).toContain('Change: +3');
    expect(api.recordCount).not.toHaveBeenCalled();
    document.querySelector<HTMLButtonElement>('.cdk-dialog-container button[type="button"].kt-btn-primary')!.click();
    await pending; fixture.detectChanges();
    expect(api.recordCount).toHaveBeenCalledWith(PRODUCT, LOCATION, expect.objectContaining({ expectedVersion: 3, expectedProductVersion: 7, countedQuantity: 13, reason: 'Cycle count' }));
    expect(page.rows()[0].balance?.onHand).toBe(13);
  });

  it('records an unchanged count as an audited zero-difference count', async () => {
    await open(row(10));
    const pending = page.openCountDialog(page.rows()[0]);
    const count = dialog(InventoryCountDialog); count.countedQuantity = 10; count.reason = 'Verified unchanged'; count.review(); fixture.detectChanges();
    expect(document.querySelector('.cdk-dialog-container')?.textContent).toContain('Change: 0 panel');
    document.querySelector<HTMLButtonElement>('.cdk-dialog-container button[type="button"].kt-btn-primary')!.click();
    await pending;
    expect(api.recordCount).toHaveBeenCalledWith(PRODUCT, LOCATION, expect.objectContaining({ countedQuantity: 10, expectedVersion: 3 }));
    expect(page.rows()[0].balance?.onHand).toBe(10);
    expect(toast.success).toHaveBeenCalledWith('Physical count recorded.');
  });

  it('establishes unknown stock with a reviewed zero count and null expected balance version', async () => {
    await open(row());
    const pending = page.openCountDialog(page.rows()[0]);
    const count = dialog(InventoryCountDialog); count.countedQuantity = 0; count.reason = 'Verified empty'; count.review(); fixture.detectChanges();
    expect(document.querySelector('.cdk-dialog-container')?.textContent).toContain('Unknown → 0 panel');
    expect(document.querySelector('.cdk-dialog-container')?.textContent).toContain('Opening count; no previous balance');
    document.querySelector<HTMLButtonElement>('.cdk-dialog-container button[type="button"].kt-btn-primary')!.click();
    await pending;
    expect(api.recordCount).toHaveBeenCalledWith(PRODUCT, LOCATION, expect.objectContaining({ expectedVersion: null, expectedProductVersion: 7, countedQuantity: 0 }));
    expect(page.rows()[0].balance?.onHand).toBe(0);
    expect(page.rows()[0].stockStatus).toBe('zero');
  });

  it('opens only one discard confirmation after repeated cancel on a dirty count observation time', async () => {
    await open(row(10));
    const pending = page.openCountDialog(page.rows()[0]);
    const count = dialog(InventoryCountDialog);
    count.observedAt = '2020-01-02T03:04';
    count.cancel(); count.cancel();
    const dialogs = TestBed.inject(Dialog).openDialogs;
    expect(dialogs).toHaveLength(2);
    expect(dialogs.filter(ref => ref.componentInstance instanceof InventoryDiscardDialog)).toHaveLength(1);
    dialogs.find(ref => ref.componentInstance instanceof InventoryDiscardDialog)!.close(false);
    expect(TestBed.inject(Dialog).openDialogs).toHaveLength(1);
    TestBed.inject(Dialog).openDialogs[0].close(null);
    await pending;
  });

  it('opens only one discard confirmation after repeated cancel on a dirty transfer observation time', async () => {
    await open(row(10), [location(), location(DESTINATION, 'ANNEX')]);
    const pending = page.openTransferDialog(page.rows()[0]);
    const transfer = dialog(InventoryTransferDialog);
    transfer.observedAt = '2020-01-02T03:04';
    transfer.cancel(); transfer.cancel();
    const dialogs = TestBed.inject(Dialog).openDialogs;
    expect(dialogs).toHaveLength(2);
    expect(dialogs.filter(ref => ref.componentInstance instanceof InventoryDiscardDialog)).toHaveLength(1);
    dialogs.find(ref => ref.componentInstance instanceof InventoryDiscardDialog)!.close(false);
    expect(TestBed.inject(Dialog).openDialogs).toHaveLength(1);
    TestBed.inject(Dialog).openDialogs[0].close(null);
    await pending;
  });

  it('closes a dirty count and its nested discard prompt when the admin auth revision resets', async () => {
    await open(row(10));
    const pending = page.openCountDialog(page.rows()[0]);
    const count = dialog(InventoryCountDialog);
    count.observedAt = '2020-01-02T03:04'; count.cancel();
    expect(TestBed.inject(Dialog).openDialogs).toHaveLength(2);
    expect(TestBed.inject(Dialog).openDialogs.some(ref => ref.componentInstance instanceof InventoryDiscardDialog)).toBe(true);
    revision.set(2); await flush(); TestBed.tick();
    expect(TestBed.inject(Dialog).openDialogs).toHaveLength(0);
    await pending;
    expect(api.recordCount).not.toHaveBeenCalled();
  });

  it('loads a known destination, previews both sides, and conserves total stock on transfer', async () => {
    await open(row(10), [location(), location(DESTINATION, 'ANNEX')]);
    const pending = page.openTransferDialog(page.rows()[0]);
    TestBed.tick(); await fixture.whenStable(); TestBed.tick(); await flush();
    const destinationSelect = document.querySelector<HTMLSelectElement>('#transfer-destination')!;
    expect(page.locations().map(item => item.id)).toEqual([LOCATION, DESTINATION]);
    const destinationOption = [...destinationSelect.options].find(option => option.textContent?.includes('ANNEX'))!;
    const destinationLocationId = page.locations().find(item => item.code === 'ANNEX')!.id;
    expect(destinationOption.value).toBe(destinationLocationId);
    destinationSelect.value = destinationOption.value;
    expect(destinationSelect.value).toBe(destinationLocationId);
    destinationSelect.dispatchEvent(new Event('change', { bubbles: true }));
    await flush(); await fixture.whenStable(); TestBed.tick();
    expect(api.inventoryRow).toHaveBeenCalledWith(PRODUCT, DESTINATION);
    expect(page.destinationRow()?.balance?.onHand).toBe(4);
    const quantity = document.querySelector<HTMLInputElement>('#transfer-quantity')!;
    quantity.value = '3'; quantity.dispatchEvent(new Event('input', { bubbles: true }));
    const reason = document.querySelector<HTMLInputElement>('#transfer-reason')!;
    reason.value = 'Move to annex'; reason.dispatchEvent(new Event('input', { bubbles: true }));
    await flush(); await fixture.whenStable(); TestBed.tick();
    [...document.querySelectorAll<HTMLButtonElement>('.cdk-dialog-container button')].find(button => button.textContent.trim() === 'Review transfer')!.click();
    await fixture.whenStable(); TestBed.tick();
    const dom = document.querySelector('.cdk-dialog-container')?.textContent ?? '';
    expect(dom).toContain('MAIN: 10 → 7 panel'); expect(dom).toContain('ANNEX: 4 → 7 panel');
    [...document.querySelectorAll<HTMLButtonElement>('.cdk-dialog-container button')].find(button => button.textContent.trim() === 'Confirm transfer')!.click();
    await pending; fixture.detectChanges();
    const input = api.transferStock.mock.calls[0][2] as InventoryTransferInput;
    expect(input).toEqual(expect.objectContaining({ expectedProductVersion: 7, destinationLocationId: DESTINATION, expectedSourceVersion: 3, expectedDestinationVersion: 3, quantity: 3, reason: 'Move to annex' }));
    const result = await api.transferStock.mock.results[0].value as InventoryTransferResult;
    expect(result.source.balance.onHand + result.destination.balance.onHand).toBe(14);
    expect(page.rows()[0].balance?.onHand).toBe(7);
  });

  it('ignores destination A when destination B was selected and loaded later', async () => {
    const locationA = '723e4567-e89b-42d3-a456-426614174000';
    const locationB = '823e4567-e89b-42d3-a456-426614174000';
    await open(row(10), [location(), location(locationA, 'A'), location(locationB, 'B')]);
    const pending = page.openTransferDialog(page.rows()[0]);
    const first = deferred<InventoryRow>(); const second = deferred<InventoryRow>();
    api.inventoryRow.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const staleA = page.loadDestinationRow(page.rows()[0], locationA);
    const currentB = page.loadDestinationRow(page.rows()[0], locationB);
    second.resolve(row(4, locationB)); await currentB;
    first.resolve(row(8, locationA)); await staleA;
    expect(page.destinationRow()?.balance?.locationId).toBe(locationB);
    TestBed.inject(Dialog).openDialogs[0].close(null); await pending;
  });

  it('retries an uncertain transfer with the exact payload and drops the retry after a version conflict', async () => {
    await open(row(10), [location(), location(DESTINATION, 'ANNEX')]);
    api.transferStock.mockRejectedValueOnce(new StoreApiError('timeout'));
    const pending = page.openTransferDialog(page.rows()[0]);
    const transfer = dialog(InventoryTransferDialog); transfer.destinationLocationId = DESTINATION;
    await page.loadDestinationRow(page.rows()[0], DESTINATION);
    transfer.quantity = 2; transfer.reason = 'Move stock'; transfer.review(); transfer.confirm();
    await pending;
    const retryKey = page.retryKey(page.rows()[0]);
    const first = page.retryTransferInputs()[retryKey];
    expect(first).toEqual(expect.objectContaining({ destinationLocationId: DESTINATION, expectedSourceVersion: 3, expectedDestinationVersion: 3 }));
    api.transferStock.mockRejectedValueOnce(new StoreApiError('conflict'));
    await page.retryTransfer(page.rows()[0]);
    expect(api.transferStock.mock.calls.map(call => call[2])).toEqual([first, first]);
    expect(page.retryTransferInputs()[retryKey]).toBeUndefined();
    expect(page.stockNeedsReload()[PRODUCT]).toBe(true);
  });

  it('does not apply a late destination response to a newly opened transfer popup', async () => {
    await open(row(10), [location(), location(DESTINATION, 'ANNEX')]);
    const firstPending = page.openTransferDialog(page.rows()[0]);
    const late = deferred<InventoryRow>(); api.inventoryRow.mockReturnValueOnce(late.promise);
    const oldRequest = page.loadDestinationRow(page.rows()[0], DESTINATION);
    TestBed.inject(Dialog).openDialogs[0].close(null); await firstPending;
    const secondPending = page.openTransferDialog(page.rows()[0]);
    api.inventoryRow.mockResolvedValueOnce(row(6, DESTINATION));
    await page.loadDestinationRow(page.rows()[0], DESTINATION);
    expect(page.destinationRow()?.balance?.onHand).toBe(6);
    late.resolve(row(99, DESTINATION)); await oldRequest;
    expect(page.destinationRow()?.balance?.onHand).toBe(6);
    TestBed.inject(Dialog).openDialogs[0].close(null); await secondPending;
  });

  it('preserves nullable thresholds separately from zero and sends the current product version', async () => {
    await open(row(5));
    let pending = page.openSettingsDialog(page.rows()[0]);
    let threshold = dialog(InventorySettingsDialog); threshold.reorderPoint = 0; threshold.save(); await pending;
    expect(api.saveSettings).toHaveBeenNthCalledWith(1, PRODUCT, LOCATION, expect.objectContaining({ expectedVersion: null, expectedProductVersion: 7, reorderPoint: 0 }));
    expect(page.rows()[0].settings?.reorderPoint).toBe(0);
    pending = page.openSettingsDialog(page.rows()[0]);
    threshold = dialog(InventorySettingsDialog); threshold.reorderPoint = null; threshold.save(); await pending;
    expect(api.saveSettings).toHaveBeenNthCalledWith(2, PRODUCT, LOCATION, expect.objectContaining({ expectedVersion: 1, expectedProductVersion: 7, reorderPoint: null }));
    expect(page.rows()[0].settings?.reorderPoint).toBeNull();
  });

  it('resets pagination, sends stockStatus to the API, and continues after an empty sparse page', async () => {
    await open(row());
    api.listInventory.mockResolvedValueOnce({ items: [], nextCursor: 'opaque_sparse_1' });
    page.inventoryPage.set(4);
    const stockStatus = fixture.nativeElement.querySelector('#inventory-stock-status') as HTMLSelectElement;
    stockStatus.value = 'low'; stockStatus.dispatchEvent(new Event('change', { bubbles: true }));
    await flush(); fixture.detectChanges();
    expect(api.listInventory).toHaveBeenLastCalledWith(LOCATION, null, { stockStatus: 'low' });
    expect(page.inventoryPage()).toBe(1);
    expect(page.rows()).toEqual([]); expect(page.inventoryCursor()).toBe('opaque_sparse_1');
    expect(fixture.nativeElement.textContent).toContain('No matching products on this page');
    expect(fixture.nativeElement.textContent).toContain('Choose Next to see more results.');
    expect(fixture.nativeElement.textContent).not.toContain('No products match these filters');
    const next = [...fixture.nativeElement.querySelectorAll('button')].find(button => button.textContent.trim() === 'Next') as HTMLButtonElement;
    expect(next.disabled).toBe(false);
    api.listInventory.mockResolvedValueOnce({ items: [row(2, LOCATION, 5)], nextCursor: null });
    page.nextInventoryPage(); await flush(); fixture.detectChanges();
    expect(api.listInventory).toHaveBeenLastCalledWith(LOCATION, 'opaque_sparse_1', { stockStatus: 'low' });
    expect(page.inventoryPage()).toBe(2); expect(page.rows()).toHaveLength(1);
  });

  it('recomputes status after a manual movement changes balance across its threshold', async () => {
    await open(row(5, LOCATION, 5));
    const pending = page.openStockDialog(page.rows()[0]);
    const stock = TestBed.inject(Dialog).openDialogs[0].componentInstance as { kind: string; quantity: number | null; reason: string; submit(): void };
    stock.kind = 'receipt'; stock.quantity = 1; stock.reason = 'Received one'; stock.submit(); await pending;
    expect(page.rows()[0].balance?.onHand).toBe(11);
    expect(page.rows()[0].stockStatus).toBe('in-stock');
  });

  it('blocks route leave while threshold persistence is pending', async () => {
    const save = deferred<InventorySettings>(); api.saveSettings.mockReturnValueOnce(save.promise);
    await open(row(5));
    const pending = page.openSettingsDialog(page.rows()[0]);
    const threshold = dialog(InventorySettingsDialog); threshold.reorderPoint = 0; threshold.save(); await flush();
    page.stockFlowBusy.set(false);
    const leave = page.canLeave();
    expect(TestBed.inject(Dialog).openDialogs).toHaveLength(0);
    save.resolve(settings(0, 1)); await pending;
    await expect(leave).resolves.toBe(false);
  });

  it('blocks browser unload while threshold persistence is pending', async () => {
    const save = deferred<InventorySettings>(); api.saveSettings.mockReturnValueOnce(save.promise);
    await open(row(5));
    const pending = page.openSettingsDialog(page.rows()[0]);
    const threshold = dialog(InventorySettingsDialog); threshold.reorderPoint = 0; threshold.save(); await flush();
    page.stockFlowBusy.set(false);
    const event = new Event('beforeunload', { cancelable: true }) as BeforeUnloadEvent;
    page.beforeUnload(event);
    expect(event.defaultPrevented).toBe(true);
    save.resolve(settings(0, 1)); await pending;
  });

  it('recomputes status after a count moves stock above its configured threshold', async () => {
    await open(row(5, LOCATION, 5));
    const pending = page.openCountDialog(page.rows()[0]);
    const count = dialog(InventoryCountDialog); count.countedQuantity = 6; count.reason = 'Count after receipt'; count.review(); count.confirm(); await pending;
    expect(page.rows()[0].stockStatus).toBe('in-stock');
  });

  it('exports every filtered API page and revokes the temporary download URL', async () => {
    await open(row());
    api.listInventory.mockResolvedValueOnce({ items: [row(2)], nextCursor: 'opaque_export_1' })
      .mockResolvedValueOnce({ items: [row(4)], nextCursor: null });
    const download = watchDownloads();
    await page.exportFilteredBalances();
    const calls = api.listInventory.mock.calls.slice(1);
    expect(calls.map(call => call.slice(0, 3))).toEqual([[LOCATION, null, {}], [LOCATION, 'opaque_export_1', {}]]);
    expect(download.createObjectURL).toHaveBeenCalledOnce();
    expect(download.click).toHaveBeenCalledOnce();
    expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('Exported 2 filtered balance rows'));
    download.revokeTimers[0]();
    expect(download.revokeObjectURL).toHaveBeenCalledWith('blob:inventory-test');
  });

  it('fails at the 50-request balance export cap without downloading a partial file', async () => {
    await open(row());
    api.listInventory.mockImplementation(async (_locationId: string, cursor: string | null) => ({
      items: [row(1)], nextCursor: 'opaque_' + (cursor ? Number(cursor.split('_').at(-1)) + 1 : 1),
    }));
    const download = watchDownloads();
    await page.exportFilteredBalances();
    expect(api.listInventory.mock.calls.slice(1)).toHaveLength(50);
    expect(page.exportError()).toContain('Narrow your filters');
    expect(page.exportError()).not.toMatch(/API|requests|snapshot/);
    expect(download.createObjectURL).not.toHaveBeenCalled();
    expect(download.click).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith('Filtered balance export failed. No CSV was downloaded.');
  });

  it('does not download a partial balance export after a later API page fails', async () => {
    await open(row());
    api.listInventory.mockResolvedValueOnce({ items: [row(1)], nextCursor: 'opaque_export_1' })
      .mockRejectedValueOnce(new StoreApiError('timeout'));
    const download = watchDownloads();
    await page.exportFilteredBalances();
    expect(api.listInventory.mock.calls.slice(1)).toHaveLength(2);
    expect(page.exportError()).toBeTruthy();
    expect(download.createObjectURL).not.toHaveBeenCalled();
  });

  it('cancels a balance export when the authenticated account scope changes', async () => {
    await open(row());
    const response = deferred<{ items: InventoryRow[]; nextCursor: string | null }>();
    api.listInventory.mockReturnValueOnce(response.promise);
    const download = watchDownloads();
    const exporting = page.exportFilteredBalances();
    await flush();
    revision.set(2); await flush();
    response.resolve({ items: [row(99)], nextCursor: null });
    await exporting;
    expect(download.createObjectURL).not.toHaveBeenCalled();
    expect(download.click).not.toHaveBeenCalled();
    expect(page.exporting()).toBe(false);
  });

  it('cancels history export when its popup closes without creating a partial download', async () => {
    await open(row(5));
    await page.toggleHistory(page.rows()[0]);
    const response = deferred<{ items: InventoryMovement[]; nextCursor: string | null }>();
    api.listMovements.mockReturnValueOnce(response.promise);
    const download = watchDownloads();
    const exporting = page.exportHistory(page.rows()[0]);
    await flush();
    await page.toggleHistory(page.rows()[0]);
    response.resolve({ items: [], nextCursor: 'opaque_history_1' });
    await exporting;
    expect(download.createObjectURL).not.toHaveBeenCalled();
    expect(download.click).not.toHaveBeenCalled();
    expect(page.historyExporting()).toBe(false);
  });

  it('exports all movement-history API pages from the open popup', async () => {
    await open(row(5));
    await page.toggleHistory(page.rows()[0]);
    api.listMovements.mockResolvedValueOnce({ items: [historyMovement(2)], nextCursor: 'opaque_history_1' })
      .mockResolvedValueOnce({ items: [historyMovement(1)], nextCursor: null });
    const download = watchDownloads();
    await page.exportHistory(page.rows()[0]);
    const calls = api.listMovements.mock.calls.slice(1);
    expect(calls.map(call => call.slice(0, 3))).toEqual([[PRODUCT, LOCATION, null], [PRODUCT, LOCATION, 'opaque_history_1']]);
    expect(download.createObjectURL).toHaveBeenCalledOnce();
    expect(download.click).toHaveBeenCalledOnce();
    expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('Exported 2 movement records'));
  });

  it('fails at the 50-request movement export cap without downloading a partial file', async () => {
    await open(row(5));
    await page.toggleHistory(page.rows()[0]);
    api.listMovements.mockImplementation(async (_productId: string, _locationId: string, cursor: string | null) => ({
      items: [], nextCursor: 'opaque_' + (cursor ? Number(cursor.split('_').at(-1)) + 1 : 1),
    }));
    const download = watchDownloads();
    await page.exportHistory(page.rows()[0]);
    expect(api.listMovements.mock.calls.slice(1)).toHaveLength(50);
    expect(page.historyExportError()).toContain('too large to export');
    expect(page.historyExportError()).not.toMatch(/API|requests|snapshot/);
    expect(download.createObjectURL).not.toHaveBeenCalled();
    expect(download.click).not.toHaveBeenCalled();
  });
});
