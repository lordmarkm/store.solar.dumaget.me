import { Dialog } from '@angular/cdk/dialog';
import { DOCUMENT } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { legacyProductRoutes as routes } from './legacy-product-routes.testing';
import { PRODUCTS } from '../../core/demo-data';
import { PRODUCT_PREVIEW_ENABLED } from './product-preview.store';
import { ProductsPage } from './products';

describe('retired fixture Products page (isolated test routes, not the live admin page)', () => {
  let values: Map<string, string>;
  beforeEach(() => {
    values = new Map([
      ['solar.bom.v1', '[{"productId":"osda-620","quantity":32}]'],
      ['solar.projects.preview.v1', '{"preserved":"preview data"}'],
    ]);
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    });
    TestBed.configureTestingModule({ providers: [provideRouter(routes), { provide: PRODUCT_PREVIEW_ENABLED, useValue: false }] });
  });
  afterEach(() => {
    TestBed.inject(Dialog).closeAll();
    const root = TestBed.inject(DOCUMENT).documentElement;
    root.classList.remove('dark');
    delete root.dataset['solarTheme'];
    vi.unstubAllGlobals();
  });

  async function setup(path = '/admin/products') {
    const harness = await RouterTestingHarness.create(path);
    const page = harness.routeDebugElement!.query(By.directive(ProductsPage)).componentInstance as ProductsPage;
    return { harness, page, root: harness.routeNativeElement! };
  }
  async function settle(harness: RouterTestingHarness) {
    await harness.fixture.whenStable();
    harness.fixture.detectChanges();
  }

  it('renders a read-only Products route with disabled writes and no inferred publication records', async () => {
    const { root } = await setup();
    expect(root.querySelector('h1')?.textContent).toBe('Products');
    expect(root.textContent).toContain('Read-only catalog preview');
    expect(root.textContent).toContain('Tax unspecified');
    expect(root.querySelectorAll('tbody tr')).toHaveLength(6);
    const buttons = [...root.querySelectorAll<HTMLButtonElement>('button')];
    expect(buttons.find(button => button.textContent?.includes('New product'))?.disabled).toBe(true);
    expect(buttons.filter(button => button.getAttribute('aria-label')?.startsWith('Edit ')).every(button => button.disabled)).toBe(true);
    expect(root.querySelector('[tabindex="0"][aria-label^="New product:"]')?.getAttribute('aria-label')).toContain('read-only preview');
    expect(root.querySelector('a[href="/admin/products"][aria-current="page"]')).not.toBeNull();
  });

  it('shows the development-only draft editor entry when product preview is enabled', async () => {
    TestBed.overrideProvider(PRODUCT_PREVIEW_ENABLED, { useValue: true });
    const { root } = await setup();
    const link = root.querySelector<HTMLAnchorElement>('a[href^="/admin/products/new"]');
    expect(link).not.toBeNull();
    expect(new URL(link!.href).pathname).toBe('/admin/products/new');
    expect(root.textContent).toContain('Development-only product preview');
  });

  it('redirects direct draft-editor navigation when product preview is disabled', async () => {
    const { harness } = await setup('/admin/products/new');
    expect(TestBed.inject(Router).url).toBe('/admin/products');
    expect(harness.routeNativeElement?.querySelector('h1')?.textContent).toBe('Products');
  });

  it('restores filters from the URL and resets to a recoverable empty state', async () => {
    const { harness, page, root } = await setup('/admin/products?brand=SRNE&category=Batteries');
    expect(page.filtered().map(row => row.product.id)).toEqual(['srne-314']);
    page.update({ state: 'published' });
    await settle(harness);
    expect(root.textContent).toContain('No matching products');
    expect(root.textContent).toContain('Showing 0–0 of 0');
    page.reset();
    await settle(harness);
    expect(page.filtered()).toHaveLength(6);
    expect(TestBed.inject(Router).url).toBe('/admin/products');
  });

  it('updates URL search/filter state using actual form events', async () => {
    const { harness, page, root } = await setup();
    const search = root.querySelector<HTMLInputElement>('#products-search')!;
    search.value = 'SRNE';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    await settle(harness);
    expect(page.filtered()).toHaveLength(2);
    const category = root.querySelector<HTMLSelectElement>('#products-category')!;
    category.value = 'Batteries';
    category.dispatchEvent(new Event('change', { bubbles: true }));
    await settle(harness);
    expect(page.filtered().map(row => row.product.id)).toEqual(['srne-314']);
    expect(TestBed.inject(Router).url).toContain('q=SRNE');
    expect(TestBed.inject(Router).url).toContain('category=Batteries');
  });

  it('renders supplier IDs and names, applies the native filter, resets paging, restores the URL, and clears it', async () => {
    const { harness, page, root } = await setup('/admin/products?size=5');
    const select = root.querySelector<HTMLSelectElement>('#products-supplier')!;
    expect(select).not.toBeNull();
    expect([...select.options].map(option => [option.value, option.textContent?.trim()])).toEqual([
      ['', 'All suppliers'],
      ...page.suppliers().map(supplier => [supplier.id, supplier.name]),
    ]);

    const supplierId = page.suppliers()[0].id;
    page.next();
    await settle(harness);
    expect(page.result().page).toBe(2);
    select.value = supplierId;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await settle(harness);
    expect(page.query().supplier).toBe(supplierId);
    expect(page.result().page).toBe(1);
    expect(page.filtered().every(row => row.supplierId === supplierId)).toBe(true);
    expect(TestBed.inject(Router).url).toContain(`supplier=${encodeURIComponent(supplierId)}`);

    await harness.navigateByUrl(`/admin/products?supplier=${encodeURIComponent(supplierId)}`);
    expect(page.query().supplier).toBe(supplierId);
    expect(page.filtered().every(row => row.supplierId === supplierId)).toBe(true);
    page.reset();
    await settle(harness);
    expect(page.query().supplier).toBe('');
    expect(page.filtered()).toHaveLength(6);
    expect(TestBed.inject(Router).url).toBe('/admin/products');
  });

  it('pages results and resets to the first page when a filter changes', async () => {
    const { harness, page } = await setup('/admin/products?size=5');
    expect(page.result().rows).toHaveLength(5);
    page.next();
    await settle(harness);
    expect(page.result().page).toBe(2);
    expect(page.result().rows).toHaveLength(1);
    page.update({ search: 'SRNE' });
    await settle(harness);
    expect(page.result().page).toBe(1);
    expect(page.result().rows).toHaveLength(2);
    page.previous();
    await settle(harness);
    expect(page.result().page).toBe(1);
    page.setPageSize('25');
    await settle(harness);
    expect(page.query().pageSize).toBe(25);
    page.setPageSize('999');
    await settle(harness);
    expect(page.query().pageSize).toBe(25);
  });

  it('retains filters while navigating to inventory and back to the Products URL', async () => {
    const { harness, page } = await setup();
    page.update({ brand: 'SRNE', sort: 'price-desc', pageSize: 5 });
    await settle(harness);
    const url = TestBed.inject(Router).url;
    await harness.navigateByUrl('/admin/inventory');
    await harness.navigateByUrl(url);
    const restored = harness.routeDebugElement!.query(By.directive(ProductsPage)).componentInstance as ProductsPage;
    expect(restored.query()).toMatchObject({ brand: 'SRNE', sort: 'price-desc', pageSize: 5 });
    expect(restored.filtered()[0].product.id).toBe('srne-314');
  });

  it('opens read-only details without changing filters, fixture products or stored customer data', async () => {
    const { harness, page, root } = await setup('/admin/products?brand=OSDA');
    const before = JSON.stringify(PRODUCTS);
    const stored = [...values];
    root.querySelector<HTMLButtonElement>('button[aria-label="View OSD-620N-BF details"]')!.click();
    await settle(harness);
    expect(TestBed.inject(Dialog).openDialogs).toHaveLength(1);
    expect(document.querySelector('[role="dialog"]')?.getAttribute('aria-labelledby')).toBe('product-dialog-title');
    expect(document.body.textContent).toContain('620W N-Type Bifacial Solar Panel');
    TestBed.inject(Dialog).closeAll();
    await settle(harness);
    expect(page.query().brand).toBe('OSDA');
    expect(JSON.stringify(PRODUCTS)).toBe(before);
    expect([...values]).toEqual(stored);
  });
});
