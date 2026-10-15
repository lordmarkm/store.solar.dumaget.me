import { Component } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { computed, signal, type WritableSignal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminAccessService } from '../../core/admin-access.service';
import { AdminCatalogApiService } from '../../core/admin-catalog-api.service';
import type { AdminProduct, AdminSupplier } from '../../core/admin-catalog.models';
import { AuthNavigationService } from '../../core/auth-navigation.service';
import { AuthSessionService } from '../../core/auth-session.service';
import { StoreApiError } from '../../core/store-api.service';
import { AdminProductsPage } from './admin-products';

@Component({ template: '' })
class RouteStub {}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(yes => { resolve = yes; });
  return { promise, resolve };
}

const supplier = { id: 'supplier-one', name: 'North Solar', status: 'active' } as AdminSupplier;
const inactiveSupplier = { id: 'supplier-old', name: 'Archived Solar', status: 'inactive' } as AdminSupplier;
const product = (id: string, sku: string, brand = 'Sun Co'): AdminProduct => ({
  id, sku, name: `Product ${id}`, brand, category: 'Panels', supplierId: supplier.id,
  amountMinor: 10000, state: 'draft',
} as AdminProduct);

describe('admin product API filters', () => {
  let revision: WritableSignal<number>;
  let authorized: WritableSignal<boolean>;
  let fixture!: ComponentFixture<AdminProductsPage>;
  let page: AdminProductsPage;
  let api: {
    listProducts: ReturnType<typeof vi.fn>;
    listSuppliers: ReturnType<typeof vi.fn>;
    listProductBrands: ReturnType<typeof vi.fn>;
  };

  async function open(): Promise<void> {
    fixture = TestBed.createComponent(AdminProductsPage);
    page = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function settle(): Promise<void> {
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function flushPromises(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
    fixture.detectChanges();
  }

  beforeEach(() => {
    revision = signal(1);
    authorized = signal(true);
    api = {
      listProducts: vi.fn().mockResolvedValue({ items: [product('first', 'PANEL-1')], nextCursor: 'opaque-product-cursor' }),
      listSuppliers: vi.fn().mockResolvedValue({ items: [supplier, inactiveSupplier], nextCursor: 'supplier-cursor' }),
      listProductBrands: vi.fn((cursor: string | null) => Promise.resolve(cursor
        ? { items: ['Later Brand'], nextCursor: null }
        : { items: ['Sun Co'], nextCursor: 'brand-cursor' })),
    };
    TestBed.configureTestingModule({ providers: [
      provideRouter([{ path: '**', component: RouteStub }]),
      { provide: AdminAccessService, useValue: { authorized, status: computed(() => authorized() ? 'authorized' : 'signed-out'), retry: vi.fn() } },
      { provide: AuthSessionService, useValue: { sessionRevision: revision, status: () => 'signed-in', busy: () => false, error: () => null } },
      { provide: AuthNavigationService, useValue: { signInGoogle: vi.fn() } },
      { provide: AdminCatalogApiService, useValue: api },
    ] });
  });

  afterEach(() => {
    fixture?.destroy();
    vi.useRealTimers();
    TestBed.resetTestingModule();
  });

  it('sends the combined criteria and renders API results outside the previously loaded page', async () => {
    await open();
    const laterProduct = product('api-result', 'ARCHIVE-42', 'Archive Brand');
    api.listProducts.mockImplementation((_cursor: string | null, filters: Record<string, string>) => Promise.resolve({
      items: filters['brand'] ? [laterProduct] : [product('first', 'PANEL-1')], nextCursor: null,
    }));
    vi.useFakeTimers();
    page.setSkuPrefix('ARCHIVE-');
    await vi.advanceTimersByTimeAsync(300);
    await flushPromises();
    page.setBrand('Archive Brand');
    page.setCategory('Panels');
    page.setSupplierId('supplier-one');
    await flushPromises();

    expect(api.listProducts).toHaveBeenLastCalledWith(null, {
      skuPrefix: 'ARCHIVE-', brand: 'Archive Brand', category: 'Panels', supplierId: 'supplier-one',
    });
    expect(page.rows()).toEqual([laterProduct]);
    expect(fixture.nativeElement.textContent).toContain('Product api-result');
    expect(fixture.nativeElement.textContent).not.toContain('Product first');
  });

  it('debounces SKU-prefix queries for 300 ms and limits input to 64 characters', async () => {
    await open();
    vi.useFakeTimers();
    const before = api.listProducts.mock.calls.length;
    page.setSkuPrefix('A'.repeat(80));
    expect(page.search()).toHaveLength(64);
    expect(api.listProducts).toHaveBeenCalledTimes(before);
    await vi.advanceTimersByTimeAsync(299);
    expect(api.listProducts).toHaveBeenCalledTimes(before);
    await vi.advanceTimersByTimeAsync(1);
    expect(api.listProducts).toHaveBeenLastCalledWith(null, { skuPrefix: 'A'.repeat(64) });
  });

  it('clears immediately, cancels pending search, resets the cursor, and requests an empty filter set', async () => {
    await open();
    vi.useFakeTimers();
    page.setSkuPrefix('PANEL-');
    await vi.advanceTimersByTimeAsync(100);
    const beforeClear = api.listProducts.mock.calls.length;
    page.clearFilters();
    expect(page.search()).toBe('');
    expect(page.brand()).toBe('');
    expect(page.category()).toBe('');
    expect(page.supplierId()).toBe('');
    expect(page.rows()).toEqual([]);
    expect(page.cursor()).toBeNull();
    expect(api.listProducts).toHaveBeenCalledTimes(beforeClear + 1);
    expect(api.listProducts).toHaveBeenLastCalledWith(null, {});
    await vi.advanceTimersByTimeAsync(300);
    expect(api.listProducts).toHaveBeenCalledTimes(beforeClear + 1);
  });

  it('uses static categories and paginates brand options independently of product results', async () => {
    await open();
    expect(page.categories).toEqual(['Panels', 'Inverters', 'Batteries', 'Mounting', 'Circuit breakers', 'Surge Protection Device', 'ATS', 'PV Isolator', 'MCCB']);
    expect(page.brands()).toEqual(['Sun Co']);
    expect(page.supplierName(inactiveSupplier.id)).toBe('Archived Solar');
    const supplierOptions = [...(fixture.nativeElement.querySelector('#admin-product-supplier') as HTMLSelectElement).options].map(option => option.textContent?.trim());
    expect(supplierOptions).toContain('Archived Solar (inactive)');
    const brandButton = [...(fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>)].find(button => button.textContent?.includes('Load more brand options'))!;
    brandButton.click();
    await settle();
    expect(api.listProductBrands).toHaveBeenLastCalledWith('brand-cursor');
    expect(page.brands()).toEqual(['Sun Co', 'Later Brand']);
    expect(page.brandCursor()).toBeNull();
    expect(api.listProducts).toHaveBeenCalledTimes(1);
  });

  it('restarts supplier and brand option loads when the account revision changes during pagination', async () => {
    await open();
    const oldSupplierPage = deferred<{ items: AdminSupplier[]; nextCursor: string | null }>();
    const oldBrandPage = deferred<{ items: string[]; nextCursor: string | null }>();
    const currentSupplier = { ...supplier, id: 'supplier-current', name: 'Current Solar' };
    api.listSuppliers.mockReturnValueOnce(oldSupplierPage.promise).mockResolvedValueOnce({ items: [currentSupplier], nextCursor: null });
    api.listProductBrands.mockReturnValueOnce(oldBrandPage.promise).mockResolvedValueOnce({ items: ['Current Brand'], nextCursor: null });

    const oldSupplierLoad = page.loadMoreSuppliers();
    const oldBrandLoad = page.loadMoreBrands();
    expect(page.suppliersLoading()).toBe(true);
    expect(page.brandsLoading()).toBe(true);
    revision.set(2);
    fixture.detectChanges();
    expect(api.listSuppliers).toHaveBeenLastCalledWith(null);
    expect(api.listProductBrands).toHaveBeenLastCalledWith(null);
    await flushPromises();

    expect(page.suppliers()).toEqual([currentSupplier]);
    expect(page.brands()).toEqual(['Current Brand']);
    expect(page.suppliersLoading()).toBe(false);
    expect(page.brandsLoading()).toBe(false);

    oldSupplierPage.resolve({ items: [{ ...supplier, id: 'supplier-stale', name: 'Old Solar' }], nextCursor: null });
    oldBrandPage.resolve({ items: ['Old Brand'], nextCursor: null });
    await Promise.all([oldSupplierLoad, oldBrandLoad]);
    expect(page.suppliers()).toEqual([currentSupplier]);
    expect(page.brands()).toEqual(['Current Brand']);
    expect(page.suppliersLoading()).toBe(false);
    expect(page.brandsLoading()).toBe(false);
  });

  it('retains current filters for product pagination and retry', async () => {
    await open();
    page.setSupplierId('supplier-one');
    await settle();
    api.listProducts.mockRejectedValueOnce(new StoreApiError('unavailable'));
    await page.loadMore();
    expect(api.listProducts).toHaveBeenLastCalledWith('opaque-product-cursor', { supplierId: 'supplier-one' });
    api.listProducts.mockResolvedValueOnce({ items: [product('next-page', 'PANEL-2')], nextCursor: null });
    page.retry();
    await settle();
    expect(api.listProducts).toHaveBeenLastCalledWith('opaque-product-cursor', { supplierId: 'supplier-one' });
    expect(page.rows().map(row => row.id)).toEqual(['first', 'next-page']);
  });

  it('ignores an older filter response after a newer query starts', async () => {
    await open();
    const older = deferred<{ items: AdminProduct[]; nextCursor: string | null }>();
    const newer = deferred<{ items: AdminProduct[]; nextCursor: string | null }>();
    api.listProducts.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);
    page.setBrand('Older query');
    page.setCategory('Panels');
    newer.resolve({ items: [product('newer', 'PANEL-NEW')], nextCursor: null });
    await Promise.resolve(); await Promise.resolve();
    older.resolve({ items: [product('stale', 'PANEL-OLD')], nextCursor: null });
    await Promise.resolve(); await Promise.resolve();
    expect(page.rows().map(row => row.id)).toEqual(['newer']);
  });

  it('fences an in-flight product query when the authenticated account revision changes', async () => {
    await open();
    const oldAccount = deferred<{ items: AdminProduct[]; nextCursor: string | null }>();
    api.listProducts.mockReturnValueOnce(oldAccount.promise).mockResolvedValue({ items: [product('new-account', 'PANEL-NEW')], nextCursor: null });
    page.setBrand('Old account filter');
    revision.set(2);
    fixture.detectChanges();
    await settle();
    oldAccount.resolve({ items: [product('old-account', 'PANEL-OLD')], nextCursor: null });
    await Promise.resolve(); await Promise.resolve();
    expect(page.rows().map(row => row.id)).toEqual(['new-account']);
  });

  it('fences an in-flight request on route departure', async () => {
    await open();
    const pending = deferred<{ items: AdminProduct[]; nextCursor: string | null }>();
    api.listProducts.mockReturnValueOnce(pending.promise);
    page.setBrand('Route query');
    await TestBed.inject(Router).navigateByUrl('/elsewhere');
    pending.resolve({ items: [product('stale-route', 'PANEL-ROUTE')], nextCursor: null });
    await Promise.resolve(); await Promise.resolve();
    expect(page.rows()).toEqual([]);
  });

  it('ignores an in-flight response after component destruction', async () => {
    await open();
    const destroyed = deferred<{ items: AdminProduct[]; nextCursor: string | null }>();
    api.listProducts.mockReturnValueOnce(destroyed.promise);
    page.setCategory('Panels');
    fixture.destroy();
    destroyed.resolve({ items: [product('stale-destroyed', 'PANEL-DESTROYED')], nextCursor: null });
    await Promise.resolve(); await Promise.resolve();
    expect(page.rows()).toEqual([]);
  });
});
