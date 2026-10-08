import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { routes } from '../../app.routes';
import { AUTH_DRIVER, AuthDriver, AuthSessionService } from '../../core/auth-session.service';
import { StoreApiService } from '../../core/store-api.service';
import { AdminCatalogApiService } from '../../core/admin-catalog-api.service';
import type { AdminProduct, AdminSupplier, ProductCreateInput, SupplierCreateInput } from '../../core/admin-catalog.models';
import { Dialog } from '@angular/cdk/dialog';

describe('canonical admin UI creation routes (isolated API test double)', () => {
  let publish: (session: { customerId: string; source: 'firebase' } | null) => void;
  let supplierRows: AdminSupplier[];
  let productRows: AdminProduct[];
  let api: { listSuppliers: ReturnType<typeof vi.fn>; listProducts: ReturnType<typeof vi.fn>; createSupplier: ReturnType<typeof vi.fn>; createProduct: ReturnType<typeof vi.fn> };
  const metadata = { schemaVersion: 1 as const, version: 1 as const, createdBy: 'test-admin', createdAt: '2026-10-07T06:00:00.000Z', updatedAt: '2026-10-07T06:00:00.000Z' };
  const supplierId = '123e4567-e89b-42d3-a456-426614174000';

  beforeEach(() => {
    supplierRows = []; productRows = [];
    const driver: AuthDriver = { observe: next => { publish = next; return () => {}; }, signInGoogle: async () => {}, signOut: async () => { publish(null); } };
    api = {
      listSuppliers: vi.fn(async () => ({ items: [...supplierRows], nextCursor: null })),
      listProducts: vi.fn(async () => ({ items: [...productRows], nextCursor: null })),
      createSupplier: vi.fn(async ({ requestId: _requestId, ...input }: SupplierCreateInput) => {
        const supplier: AdminSupplier = { ...input, ...metadata, id: supplierId, status: 'active' };
        supplierRows.push(supplier); return { supplier };
      }),
      createProduct: vi.fn(async ({ requestId: _requestId, ...input }: ProductCreateInput) => {
        const product: AdminProduct = { ...input, ...metadata, id: '223e4567-e89b-42d3-a456-426614174000', currency: 'PHP', state: 'draft' };
        productRows.push(product); return { product };
      }),
    };
    TestBed.configureTestingModule({ providers: [provideRouter(routes),
      { provide: AUTH_DRIVER, useValue: driver }, { provide: AdminCatalogApiService, useValue: api },
      { provide: StoreApiService, useValue: { me: vi.fn(async () => ({ uid: 'test-admin', email: 'mark@solar.dumaget.me', emailVerified: true, adminEligible: true, adminAuthorized: true })) } },
    ] });
    TestBed.inject(AuthSessionService);
  });
  afterEach(() => { TestBed.inject(Dialog).closeAll(); TestBed.resetTestingModule(); });

  async function settle(harness: RouterTestingHarness) {
    await harness.fixture.whenStable(); harness.fixture.detectChanges();
    await harness.fixture.whenStable(); harness.fixture.detectChanges();
  }
  function fill(harness: RouterTestingHarness, selector: string, value: string) {
    const element = harness.routeNativeElement!.querySelector<HTMLInputElement>(selector)!;
    element.value = value; element.dispatchEvent(new Event('input', { bubbles: true }));
  }

  it('creates a supplier then a draft product from form events and returns to populated lists through real leave guards', async () => {
    publish({ customerId: 'test-admin', source: 'firebase' });
    const harness = await RouterTestingHarness.create('/admin/suppliers/new');
    await settle(harness);
    fill(harness, '#supplier-name', 'UI Test Supplier');
    fill(harness, '#supplier-region', 'Visayas');
    await settle(harness);
    harness.routeNativeElement!.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await settle(harness);
    expect(api.createSupplier).toHaveBeenCalledOnce();
    expect(TestBed.inject(Router).url).toBe('/admin/suppliers');
    expect(harness.routeNativeElement!.textContent).toContain('UI Test Supplier');

    await harness.navigateByUrl('/admin/products/new'); await settle(harness);
    fill(harness, '#product-name', 'UI Test Panel'); fill(harness, '#product-sku', 'ui-panel-1');
    fill(harness, '#product-price', '99.50');
    const select = harness.routeNativeElement!.querySelector<HTMLSelectElement>('#product-supplier')!;
    select.value = supplierId; select.dispatchEvent(new Event('change', { bubbles: true }));
    await settle(harness);
    harness.routeNativeElement!.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await settle(harness);
    expect(api.createProduct).toHaveBeenCalledOnce();
    expect(api.createProduct.mock.calls[0][0]).toMatchObject({ sku: 'UI-PANEL-1', amountMinor: 9950, supplierId });
    expect(TestBed.inject(Router).url).toBe('/admin/products');
    expect(harness.routeNativeElement!.textContent).toContain('UI Test Panel');
    expect(productRows[0].state).toBe('draft');
  });

  it('direct signed-out URLs never expose forms, fixture contacts or private lists', async () => {
    publish(null);
    const harness = await RouterTestingHarness.create('/admin/suppliers/new');
    for (const path of ['/admin/suppliers/new', '/admin/products/new', '/admin/suppliers', '/admin/products']) {
      await harness.navigateByUrl(path); await settle(harness);
      expect(harness.routeNativeElement!.querySelector('form')).toBeNull();
      expect(harness.routeNativeElement!.textContent).toContain('Sign in with Google');
    }
    expect(api.listSuppliers).not.toHaveBeenCalled(); expect(api.listProducts).not.toHaveBeenCalled();
    expect(api.createSupplier).not.toHaveBeenCalled(); expect(api.createProduct).not.toHaveBeenCalled();
  });
});
