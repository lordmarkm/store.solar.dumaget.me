import { Dialog } from '@angular/cdk/dialog';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject, firstValueFrom } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { computed, signal, type WritableSignal } from '@angular/core';
import { AdminAccessService } from '../../core/admin-access.service';
import { AdminCatalogApiService } from '../../core/admin-catalog-api.service';
import type { AdminSupplier } from '../../core/admin-catalog.models';
import { AuthNavigationService } from '../../core/auth-navigation.service';
import { AuthSessionService } from '../../core/auth-session.service';
import { StoreApiError } from '../../core/store-api.service';
import { ToastService } from '../../core/toast.service';
import { AdminSuppliersPage } from './admin-suppliers';
import { AdminSupplierEditorPage } from './admin-supplier-editor';

const ID = '123e4567-e89b-42d3-a456-426614174000';
const timestamp = '2026-10-08T04:00:00.000Z';

function supplier(values: Partial<AdminSupplier> = {}): AdminSupplier {
  return {
    id: ID, name: 'North Solar', region: 'Visayas', description: 'Panels and mounting',
    website: 'https://north.example', email: 'sales@north.example', phone: '+63 32 555 0100',
    schemaVersion: 1, version: 3, status: 'active', createdBy: 'admin-1', createdAt: timestamp,
    updatedAt: timestamp, ...values,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

describe('admin supplier editor', () => {
  let revision: WritableSignal<number>;
  let authorized: WritableSignal<boolean>;
  let params: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
  let api: Record<'getSupplier' | 'updateSupplier' | 'setSupplierStatus' | 'listSuppliers', ReturnType<typeof vi.fn>>;
  let fixture: ComponentFixture<AdminSupplierEditorPage>;
  let page: AdminSupplierEditorPage;
  let toast: { success: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };

  async function open() {
    fixture = TestBed.createComponent(AdminSupplierEditorPage);
    page = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function confirmStatus(status: 'active' | 'inactive', confirmed = true) {
    const pending = page.changeStatus(status);
    const dialog = TestBed.inject(Dialog);
    expect(dialog.openDialogs).toHaveLength(1);
    dialog.openDialogs[0].close(confirmed);
    await pending;
  }

  beforeEach(() => {
    revision = signal(1); authorized = signal(true);
    params = new BehaviorSubject(convertToParamMap({ id: ID }));
    api = {
      getSupplier: vi.fn().mockResolvedValue({ supplier: supplier() }),
      updateSupplier: vi.fn().mockImplementation(async (_id: string, body: { name: string; version?: number; expectedVersion: number }) => ({
        supplier: supplier({ name: body.name, version: body.expectedVersion + 1 }),
      })),
      setSupplierStatus: vi.fn().mockImplementation(async (_id: string, body: { status: 'active' | 'inactive'; expectedVersion: number }) => ({
        supplier: supplier({ status: body.status, version: body.expectedVersion + 1 }),
      })),
      listSuppliers: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
    };
    toast = { success: vi.fn(), error: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { paramMap: params, snapshot: { paramMap: params.value } } },
        { provide: AdminAccessService, useValue: { authorized, status: computed(() => authorized() ? 'authorized' : 'signed-out'), retry: vi.fn() } },
        { provide: AuthSessionService, useValue: { sessionRevision: revision, signOutRevision: signal(0), status: signal('signed-in'), busy: signal(false), error: signal(null) } },
        { provide: AuthNavigationService, useValue: { signInGoogle: vi.fn() } },
        { provide: AdminCatalogApiService, useValue: api },
        { provide: ToastService, useValue: toast },
      ],
    });
  });
  afterEach(() => { TestBed.inject(Dialog).closeAll(); TestBed.resetTestingModule(); });

  it('loads contact details while keeping supplier identity and creation history visible and immutable', async () => {
    await open();
    expect(api.getSupplier).toHaveBeenCalledWith(ID);
    expect(page.input().name).toBe('North Solar');
    expect(page.dirty()).toBe(false);
    expect(fixture.nativeElement.textContent).toContain(ID);
    expect(fixture.nativeElement.textContent).toContain(timestamp);
    expect(fixture.nativeElement.querySelector('[name="id"]')).toBeNull();
  });

  it('saves all editable contact fields with the current expected version and accepts only the confirmed record', async () => {
    await open();
    page.update('name', 'South Solar'); page.update('region', 'Mindanao');
    page.update('description', 'Battery systems'); page.update('website', 'https://south.example');
    page.update('email', 'hello@south.example'); page.update('phone', '+63 82 555 0100');
    await page.save();
    expect(api.updateSupplier).toHaveBeenCalledWith(ID, {
      requestId: expect.any(String), expectedVersion: 3, name: 'South Solar', region: 'Mindanao',
      description: 'Battery systems', website: 'https://south.example', email: 'hello@south.example', phone: '+63 82 555 0100',
    });
    expect(page.supplier()?.id).toBe(ID);
    expect(page.supplier()?.version).toBe(4);
    expect(page.dirty()).toBe(false);
    expect(toast.success).toHaveBeenCalledWith('Supplier details saved.');
  });

  it('shows inline validation and an error toast without sending invalid website data', async () => {
    await open(); page.update('website', 'http://north.example');
    await page.save();
    expect(page.showError('website')).toContain('HTTPS');
    expect(api.updateSupplier).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith('Review the highlighted fields and try again.');
  });

  it('requires explicit deactivation confirmation and sends an idempotent versioned status request', async () => {
    await open();
    const canceled = page.changeStatus('inactive');
    expect(TestBed.inject(Dialog).openDialogs[0].componentInstance.data.targetStatus).toBe('inactive');
    expect(document.body.textContent).toContain('purchase order history');
    TestBed.inject(Dialog).openDialogs[0].close(false);
    await canceled;
    expect(api.setSupplierStatus).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
    await confirmStatus('inactive');
    expect(api.setSupplierStatus).toHaveBeenCalledWith(ID, { requestId: expect.any(String), expectedVersion: 3, status: 'inactive' });
    expect(page.supplier()?.status).toBe('inactive');
    expect(page.supplier()?.version).toBe(4);
    expect(toast.success).toHaveBeenCalledWith('Supplier deactivated.');
  });

  it('requires a separate confirmation to reactivate an inactive supplier', async () => {
    api.getSupplier.mockResolvedValueOnce({ supplier: supplier({ status: 'inactive', version: 5 }) });
    await open();
    await confirmStatus('active');
    expect(api.setSupplierStatus).toHaveBeenCalledWith(ID, { requestId: expect.any(String), expectedVersion: 5, status: 'active' });
    expect(page.supplier()?.status).toBe('active');
    expect(toast.success).toHaveBeenCalledWith('Supplier reactivated.');
  });

  it('reuses a failed status request ID after timeout and reports success only after a confirmed response', async () => {
    await open();
    api.setSupplierStatus.mockRejectedValueOnce(new StoreApiError('timeout'));
    await confirmStatus('inactive');
    const firstId = api.setSupplierStatus.mock.calls[0][1].requestId;
    expect(page.supplier()?.status).toBe('active');
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledOnce();
    await confirmStatus('inactive');
    expect(api.setSupplierStatus.mock.calls[1][1].requestId).toBe(firstId);
    expect(page.supplier()?.status).toBe('inactive');
    expect(toast.success).toHaveBeenCalledWith('Supplier deactivated.');
  });

  it('reuses failed request IDs only for the same action and payload', async () => {
    await open(); page.update('name', 'South Solar');
    api.updateSupplier.mockRejectedValue(new StoreApiError('unavailable'));
    await page.save(); await page.save();
    const saveId = api.updateSupplier.mock.calls[0][1].requestId;
    expect(api.updateSupplier.mock.calls[1][1].requestId).toBe(saveId);
    page.update('name', 'East Solar'); await page.save();
    expect(api.updateSupplier.mock.calls[2][1].requestId).not.toBe(saveId);
    page.update('name', 'North Solar');
    await confirmStatus('inactive');
    expect(api.setSupplierStatus.mock.calls[0][1].requestId).not.toBe(saveId);
  });

  it('preserves dirty input on a version conflict and offers a latest-record reload', async () => {
    await open(); page.update('name', 'Local name');
    api.updateSupplier.mockRejectedValueOnce(new StoreApiError('conflict'));
    await page.save();
    fixture.detectChanges();
    expect(page.conflict()).toBe(true);
    expect(page.input().name).toBe('Local name');
    expect(page.dirty()).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('Reload latest supplier');
    expect(toast.error).toHaveBeenCalledOnce();
    const reload = page.reload();
    TestBed.inject(Dialog).openDialogs[0].close(true);
    await reload;
    expect(page.input().name).toBe('North Solar');
    expect(page.dirty()).toBe(false);
  });

  it('guards dirty navigation and browser unload while preserving explicit cancel behavior', async () => {
    await open(); page.update('region', 'Luzon');
    const leave = page.canLeave();
    expect(typeof leave).not.toBe('boolean');
    const result = firstValueFrom(leave as Exclude<typeof leave, boolean>);
    TestBed.inject(Dialog).openDialogs[0].close(false);
    await expect(result).resolves.toBe(false);
    const event = { preventDefault: vi.fn(), returnValue: '' } as unknown as BeforeUnloadEvent;
    page.beforeUnload(event);
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(event.returnValue).toBe('');
  });

  it('ignores a late save after the account revision changes', async () => {
    await open(); page.update('name', 'Changed');
    const pending = deferred<{ supplier: AdminSupplier }>();
    api.updateSupplier.mockReturnValueOnce(pending.promise);
    const saving = page.save();
    revision.set(2);
    expect(page.canAccess()).toBe(false);
    pending.resolve({ supplier: supplier({ name: 'Other account result', version: 4 }) });
    await saving;
    expect(page.supplier()?.name).not.toBe('Other account result');
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('ignores a late mutation after the route ID changes', async () => {
    await open(); page.update('name', 'Changed');
    const pending = deferred<{ supplier: AdminSupplier }>();
    api.updateSupplier.mockReturnValueOnce(pending.promise);
    const saving = page.save();
    params.next(convertToParamMap({ id: '223e4567-e89b-42d3-a456-426614174000' }));
    expect(page.canAccess()).toBe(false);
    pending.resolve({ supplier: supplier({ name: 'Old route result', version: 4 }) });
    await saving;
    expect(page.supplier()?.name).not.toBe('Old route result');
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('cancels a pending status confirmation on account loss and does not mutate or toast', async () => {
    await open();
    const changing = page.changeStatus('inactive');
    revision.set(2); authorized.set(false); fixture.detectChanges();
    await changing;
    expect(TestBed.inject(Dialog).openDialogs).toHaveLength(0);
    expect(api.setSupplierStatus).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('ignores a late load and mutation after editor destruction', async () => {
    const pendingLoad = deferred<{ supplier: AdminSupplier }>();
    api.getSupplier.mockReturnValueOnce(pendingLoad.promise);
    fixture = TestBed.createComponent(AdminSupplierEditorPage); page = fixture.componentInstance; fixture.detectChanges();
    fixture.destroy();
    pendingLoad.resolve({ supplier: supplier() });
    await Promise.resolve(); await Promise.resolve();
    expect(page.supplier()).toBeNull();

    await open(); page.update('name', 'Changed');
    const pendingSave = deferred<{ supplier: AdminSupplier }>();
    api.updateSupplier.mockReturnValueOnce(pendingSave.promise);
    const saving = page.save(); fixture.destroy();
    pendingSave.resolve({ supplier: supplier({ name: 'Late result', version: 4 }) });
    await saving;
    expect(page.supplier()).toBeNull();
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('shows inactive status and keeps existing supplier contact visible with its edit route', async () => {
    api.listSuppliers.mockResolvedValueOnce({ items: [supplier({ status: 'inactive' })], nextCursor: null });
    const list = TestBed.createComponent(AdminSuppliersPage);
    list.detectChanges(); await list.whenStable(); list.detectChanges();
    expect(list.nativeElement.textContent).toContain('Inactive');
    expect(list.nativeElement.textContent).toContain('sales@north.example');
    expect(list.nativeElement.textContent).toContain('+63 32 555 0100');
    const link = list.nativeElement.querySelector(`a[aria-label="Edit North Solar"]`) as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe(`/admin/suppliers/${ID}/edit`);
  });
});
