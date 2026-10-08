import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { Component, computed, signal, type WritableSignal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminAccessService } from '../../core/admin-access.service';
import { AdminCatalogApiService } from '../../core/admin-catalog-api.service';
import type { AdminProduct, AdminSupplier } from '../../core/admin-catalog.models';
import { AuthSessionService } from '../../core/auth-session.service';
import { StoreApiError } from '../../core/store-api.service';
import { ToastService } from '../../core/toast.service';
import { AdminProductCreatePage } from './admin-product-create';
import { AdminProductsPage } from './admin-products';
import { AdminSupplierCreatePage } from './admin-supplier-create';

@Component({ template: '' })
class RouteTargetStub {}

const supplier = { id: 'supplier-id', name: 'North Solar', region: 'Visayas', status: 'active' } as AdminSupplier;
const product = { id: 'product-id', sku: 'PANEL-1', name: 'Panel One', brand: 'Sun Co', category: 'Panels', supplierId: supplier.id, amountMinor: 645050, state: 'draft' } as AdminProduct;

describe('connected admin catalog components', () => {
  let accessStatus: WritableSignal<'checking' | 'signed-out' | 'authorized' | 'forbidden' | 'unavailable'>;
  let authRevision: WritableSignal<number>;
  let api: {
    listProducts: ReturnType<typeof vi.fn>;
    listSuppliers: ReturnType<typeof vi.fn>;
    listProductBrands: ReturnType<typeof vi.fn>;
    createProduct: ReturnType<typeof vi.fn>;
    createSupplier: ReturnType<typeof vi.fn>;
  };
  let toast: { success: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    accessStatus = signal('signed-out');
    authRevision = signal(1);
    api = {
      listProducts: vi.fn((_cursor: string | null = null, filters: { supplierId?: string } = {}) => Promise.resolve({
        items: filters.supplierId && filters.supplierId !== supplier.id ? [] : [product], nextCursor: null,
      })),
      listSuppliers: vi.fn().mockResolvedValue({ items: [supplier], nextCursor: null }),
      listProductBrands: vi.fn().mockResolvedValue({ items: ['Sun Co'], nextCursor: null }),
      createProduct: vi.fn().mockResolvedValue({ product }),
      createSupplier: vi.fn().mockResolvedValue({ supplier }),
    };
    toast = { success: vi.fn(), error: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: '**', component: RouteTargetStub }]),
        { provide: AdminAccessService, useValue: { status: accessStatus, authorized: computed(() => accessStatus() === 'authorized'), retry: vi.fn() } },
        { provide: AuthSessionService, useValue: { sessionRevision: authRevision, signOutRevision: signal(0), status: signal('signed-out'), busy: signal(false), error: signal(null), signInGoogle: vi.fn() } },
        { provide: AdminCatalogApiService, useValue: api },
        { provide: ToastService, useValue: toast },
      ],
    });
  });

  afterEach(() => TestBed.resetTestingModule());

  it('does not fetch or mutate while signed out and clears stale list responses on session revision change', async () => {
    const denied = TestBed.createComponent(AdminProductsPage);
    denied.detectChanges();
    await denied.whenStable();
    expect(api.listProducts).not.toHaveBeenCalled();
    expect(denied.nativeElement.textContent).toContain('Sign in with Google');

    accessStatus.set('authorized');
    denied.detectChanges();
    await denied.whenStable();
    expect(api.listProducts).toHaveBeenCalledOnce();
    denied.detectChanges();
    expect(denied.nativeElement.textContent).toContain('Panel One');

    authRevision.set(2);
    accessStatus.set('signed-out');
    denied.detectChanges();
    await denied.whenStable();
    expect(denied.nativeElement.textContent).not.toContain('Panel One');
    expect(denied.componentInstance.rows()).toEqual([]);
  });

  it('renders supplier names and queries products by stable supplier ID', async () => {
    accessStatus.set('authorized');
    const fixture = TestBed.createComponent(AdminProductsPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('North Solar');
    const page = fixture.componentInstance;
    api.listProducts.mockResolvedValueOnce({ items: [], nextCursor: null });
    page.setSupplierId('some-other-id');
    await fixture.whenStable(); fixture.detectChanges();
    expect(api.listProducts).toHaveBeenLastCalledWith(null, { supplierId: 'some-other-id' });
    expect(page.rows()).toEqual([]);
    expect(fixture.nativeElement.textContent).not.toContain('Panel One');

    api.listProducts.mockResolvedValueOnce({ items: [product], nextCursor: null });
    page.setSupplierId(supplier.id);
    await fixture.whenStable(); fixture.detectChanges();
    expect(api.listProducts).toHaveBeenLastCalledWith(null, { supplierId: supplier.id });
    expect(page.rows().map(row => row.id)).toEqual([product.id]);
    expect(fixture.nativeElement.textContent).toContain('Panel One');
  });

  it('shows panel parameters only for Panels and submits their reviewed values', async () => {
    accessStatus.set('authorized');
    const fixture = TestBed.createComponent(AdminProductCreatePage);
    fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    const page = fixture.componentInstance;
    expect(fixture.nativeElement.querySelector('#new-panel-eanCode')).toBeNull();
    page.update('sku', 'PANEL-NEW'); page.update('name', 'Panel'); page.update('supplierId', supplier.id);
    page.update('category', 'Panels'); fixture.detectChanges(); await fixture.whenStable();
    expect(fixture.nativeElement.querySelectorAll('app-panel-specification-fields input')).toHaveLength(13);
    const ean = fixture.nativeElement.querySelector('#new-panel-eanCode') as HTMLInputElement;
    ean.value = '0123456789012'; ean.dispatchEvent(new Event('input')); fixture.detectChanges(); await fixture.whenStable();
    expect(page.input().panelSpecifications.eanCode).toBe('0123456789012');
    page.update('panelSpecifications', { ...page.input().panelSpecifications, ratedMaximumPower: ' 620 Wp ' });
    await page.save();
    expect(api.createProduct).toHaveBeenCalledWith(expect.objectContaining({ panelSpecifications: { eanCode: '0123456789012', ratedMaximumPower: '620 Wp' } }));
    expect(toast.success).toHaveBeenCalledWith('Product saved.');
  });

  it('validates required product fields without calling the create API', async () => {
    accessStatus.set('authorized');
    const fixture = TestBed.createComponent(AdminProductCreatePage);
    fixture.detectChanges();
    await fixture.whenStable();
    const page = fixture.componentInstance;
    page.update('name', 'Panel One');
    page.update('supplierId', supplier.id);
    page.update('sku', 'INVALID SPACE');
    await page.save();
    expect(api.createProduct).not.toHaveBeenCalled();
    expect(page.showError('sku')).toContain('uppercase ASCII');
    expect(toast.error).toHaveBeenCalledWith('Review the highlighted fields and try again.');
  });

  it('uses exact centavos and reuses the request ID after a failed identical product submission', async () => {
    accessStatus.set('authorized');
    api.createProduct.mockRejectedValueOnce(new StoreApiError('unavailable'));
    const fixture = TestBed.createComponent(AdminProductCreatePage);
    fixture.detectChanges();
    await fixture.whenStable();
    const page = fixture.componentInstance;
    page.update('sku', 'panel-1'); page.update('name', 'Panel One'); page.update('supplierId', supplier.id);
    page.update('priceText', '6450.50');
    await page.save();
    const first = api.createProduct.mock.calls[0][0];
    expect(first.amountMinor).toBe(645050);
    expect(Object.keys(first)).toContain('requestId');
    expect(Object.keys(first)).not.toContain('requestUUID');
    expect(page.saveError()).toBe(new StoreApiError('unavailable').message);
    expect(toast.error).toHaveBeenCalledTimes(1);
    page.update('name', 'Panel One');
    await page.save();
    expect(api.createProduct.mock.calls[1][0].requestId).toBe(first.requestId);
    expect(TestBed.inject(Router).url).toBe('/admin/products');
    expect(toast.success).toHaveBeenCalledWith('Product saved.');
  });

  it('validates supplier input and preserves a request ID only for an unchanged retry', async () => {
    accessStatus.set('authorized');
    api.createSupplier.mockRejectedValueOnce(new StoreApiError('unavailable')).mockRejectedValueOnce(new StoreApiError('unavailable'));
    const fixture = TestBed.createComponent(AdminSupplierCreatePage);
    fixture.detectChanges();
    const page = fixture.componentInstance;
    page.update('name', 'North Solar');
    page.update('website', 'http://example.com');
    await page.save();
    expect(api.createSupplier).not.toHaveBeenCalled();
    expect(page.showError('website')).toContain('HTTPS');
    expect(toast.error).toHaveBeenCalledWith('Review the highlighted fields and try again.');

    page.update('website', 'https://example.com');
    await page.save();
    const requestId = api.createSupplier.mock.calls[0][0].requestId;
    await page.save();
    expect(toast.error).toHaveBeenCalledTimes(3);
    expect(toast.success).not.toHaveBeenCalled();
    expect(api.createSupplier.mock.calls[1][0].requestId).toBe(requestId);
    page.update('region', 'Dumaguete');
    await page.save();
    expect(api.createSupplier.mock.calls[2][0].requestId).not.toBe(requestId);
    expect(toast.success).toHaveBeenCalledWith('Supplier saved.');
  });

  it('keeps confirmed save success when the subsequent list navigation fails', async () => {
    accessStatus.set('authorized');
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockRejectedValue(new Error('Navigation unavailable'));
    const productFixture = TestBed.createComponent(AdminProductCreatePage);
    productFixture.detectChanges(); await productFixture.whenStable();
    const productPage = productFixture.componentInstance;
    productPage.update('sku', 'PANEL-1'); productPage.update('name', 'Panel One'); productPage.update('supplierId', supplier.id);
    await expect(productPage.save()).resolves.toBeUndefined();
    expect(productPage.saved()).toBe(true);
    expect(productPage.saveError()).toBeNull();
    expect(toast.success).toHaveBeenCalledWith('Product saved.');
    productFixture.destroy();

    const supplierFixture = TestBed.createComponent(AdminSupplierCreatePage);
    supplierFixture.detectChanges(); await supplierFixture.whenStable();
    const supplierPage = supplierFixture.componentInstance;
    supplierPage.update('name', 'North Solar');
    await expect(supplierPage.save()).resolves.toBeUndefined();
    expect(supplierPage.saved()).toBe(true);
    expect(supplierPage.saveError()).toBeNull();
    expect(toast.success).toHaveBeenCalledWith('Supplier saved.');
    expect(toast.error).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledTimes(2);
    navigate.mockRestore();
  });

  it('invalidates a pending create when its component is destroyed', async () => {
    accessStatus.set('authorized');
    let complete!: (value: { product: AdminProduct }) => void;
    api.createProduct.mockReturnValueOnce(new Promise(resolve => { complete = resolve; }));
    const fixture = TestBed.createComponent(AdminProductCreatePage);
    fixture.detectChanges();
    await fixture.whenStable();
    const page = fixture.componentInstance;
    page.update('sku', 'PANEL-1'); page.update('name', 'Panel One'); page.update('supplierId', supplier.id);
    const pending = page.save();
    expect(api.createProduct).toHaveBeenCalledOnce();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('fieldset')?.disabled).toBe(true);
    expect(page.canLeave()).toBe(false);
    fixture.destroy();
    complete({ product });
    await pending;
    expect(TestBed.inject(Router).url).not.toBe('/admin/products');
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('denies supplier submits while signed out and ignores a save after the account revision changes', async () => {
    const denied = TestBed.createComponent(AdminSupplierCreatePage);
    denied.detectChanges();
    await denied.componentInstance.save();
    expect(api.createSupplier).not.toHaveBeenCalled();
    denied.destroy();

    accessStatus.set('authorized');
    let complete!: (value: { supplier: AdminSupplier }) => void;
    api.createSupplier.mockReturnValueOnce(new Promise(resolve => { complete = resolve; }));
    const fixture = TestBed.createComponent(AdminSupplierCreatePage);
    fixture.detectChanges();
    const page = fixture.componentInstance;
    page.update('name', 'North Solar');
    const pending = page.save();
    expect(api.createSupplier).toHaveBeenCalledOnce();
    authRevision.set(2);
    accessStatus.set('signed-out');
    fixture.detectChanges();
    complete({ supplier });
    await pending;
    expect(page.input().name).toBe('');
    expect(TestBed.inject(Router).url).not.toBe('/admin/suppliers');
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });
  it('keeps confirmed creates successful when list navigation rejects', async () => {
    accessStatus.set('authorized');
    vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockRejectedValue(new Error('navigation failed'));

    const productFixture = TestBed.createComponent(AdminProductCreatePage);
    productFixture.detectChanges(); await productFixture.whenStable();
    const productPage = productFixture.componentInstance;
    productPage.update('sku', 'PANEL-NEW'); productPage.update('name', 'Panel One'); productPage.update('supplierId', supplier.id);
    await productPage.save();
    expect(productPage.saved()).toBe(true);
    expect(productPage.saveError()).toBeNull();
    expect(toast.success).toHaveBeenCalledWith('Product saved.');

    productFixture.destroy();
    const supplierFixture = TestBed.createComponent(AdminSupplierCreatePage);
    supplierFixture.detectChanges(); await supplierFixture.whenStable();
    const supplierPage = supplierFixture.componentInstance;
    supplierPage.update('name', 'North Solar');
    await supplierPage.save();
    expect(supplierPage.saved()).toBe(true);
    expect(supplierPage.saveError()).toBeNull();
    expect(toast.success).toHaveBeenCalledWith('Supplier saved.');
    expect(toast.error).not.toHaveBeenCalled();
  });
});
