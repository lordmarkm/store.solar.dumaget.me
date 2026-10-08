import { inject } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { routes } from '../../app.routes';
import { BomService } from '../../core/bom.service';
import { PLANNING_PRODUCTS } from '../../core/product-source';
import { PublicCatalogService, PublishedProduct } from '../../core/public-catalog.service';
import { STORE_API_FETCH } from '../../core/store-api.service';
import { Dialog } from '@angular/cdk/dialog';

const id = '11111111-1111-4111-8111-111111111111';
const value: PublishedProduct = { id, schemaVersion: 1, version: 2, publishedAt: '2026-10-07T00:00:00.000Z', sku: 'PANEL-1',
  name: 'Published panel', brand: 'Solar', category: 'Panels', unitCode: 'panel', description: 'Panel details', amountMinor: 645050, currency: 'PHP' };
let available: boolean;
const fetcher = vi.fn(async (input: RequestInfo | URL) => {
  const path = String(input);
  if (path === '/api/v1/catalog/products') return new Response(JSON.stringify({ items: [value], nextCursor: null }));
  if (path === '/api/v1/catalog/products/' + id) return new Response(JSON.stringify(available ? { product: value } : {}), { status: available ? 200 : 404 });
  throw new Error('Unexpected test request');
});
beforeEach(() => {
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) });
  available = true; fetcher.mockClear();
  TestBed.configureTestingModule({ providers: [provideRouter(routes),
    { provide: STORE_API_FETCH, useValue: fetcher },
    { provide: PLANNING_PRODUCTS, useFactory: () => inject(PublicCatalogService).products }] });
});
afterEach(() => { TestBed.inject(Dialog).closeAll(); vi.unstubAllGlobals(); });
it('renders a published card and adds its rechecked UUID to the browser cart through the real product source', async () => {
  const harness = await RouterTestingHarness.create('/catalog');
  await harness.fixture.whenStable(); harness.detectChanges();
  const root = harness.routeNativeElement!;
  expect(root.textContent).toContain('Published panel');
  expect(root.textContent).toContain('6,450.50');
  expect(root.textContent).toContain('Availability unconfirmed');
  expect(root.textContent).not.toContain('sample units');
  expect(root.textContent).not.toContain('VAT included');
  root.querySelector<HTMLButtonElement>('button[aria-label="Add to Cart: Published panel"]')!.click();
  await harness.fixture.whenStable(); harness.detectChanges();
  const bom = TestBed.inject(BomService);
  expect(bom.quantity(id)).toBe(1); expect(bom.lines()[0].product.source).toBe('published');
  expect(bom.total()).toBe(6450.5); expect(bom.vat()).toBeNull();
  expect(fetcher.mock.calls.some(call => String(call[0]) === '/api/v1/catalog/products/' + id)).toBe(true);
});
it('does not add a stale unpublished card and keeps any saved quantity as an unavailable reference', async () => {
  const harness = await RouterTestingHarness.create('/catalog');
  await harness.fixture.whenStable(); harness.detectChanges();
  const bom = TestBed.inject(BomService);
  expect(bom.add(id, 3)).toBe(true);
  available = false;
  harness.routeNativeElement!.querySelector<HTMLButtonElement>('button[aria-label="Add to Cart: Published panel"]')!.click();
  await harness.fixture.whenStable(); harness.detectChanges();
  expect(bom.quantity(id)).toBe(3); expect(bom.lines()).toEqual([]);
  expect(bom.unavailable()).toEqual([{ productId: id, quantity: 3 }]);
});
