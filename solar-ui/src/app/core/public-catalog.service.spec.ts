import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { STORE_API_FETCH } from './store-api.service';
import { parsePublishedProduct, publishedView, PublicCatalogService, PublishedProduct } from './public-catalog.service';
const id = '11111111-1111-4111-8111-111111111111';
const value: PublishedProduct = { id, schemaVersion: 1, version: 2, publishedAt: '2026-10-07T00:00:00.000Z', sku: 'PANEL-1',
  name: 'Published panel', brand: 'Solar', category: 'Panels', unitCode: 'panel', description: 'Panel details', amountMinor: 645050, currency: 'PHP' };
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
describe('public catalog boundaries', () => {
  const fetcher = vi.fn<typeof fetch>();
  beforeEach(() => { fetcher.mockReset(); TestBed.configureTestingModule({ providers: [{ provide: STORE_API_FETCH, useValue: fetcher }] }); });
  afterEach(() => vi.useRealTimers());
  it('validates exact public fields without private metadata and preserves centavos and zero', () => {
    expect(publishedView(parsePublishedProduct(value)).price).toBe(6450.5);
    expect(publishedView(parsePublishedProduct({ ...value, amountMinor: 0 })).price).toBe(0);
    expect(publishedView(value).tiers).toEqual([]);
    expect(publishedView(value).source).toBe('published');
    for (const change of [{ supplierId: id }, { createdBy: 'admin' }, { stock: 100 }, { brand: '' }, { amountMinor: null }, { amountMinor: -1 }, { amountMinor: 0.1 }, { version: 0 }, { publishedAt: '2026-02-30T00:00:00.000Z' }]) {
      expect(() => parsePublishedProduct({ ...value, ...change })).toThrow();
    }
  });
  it('fetches anonymously and starts with no demo records', async () => {
    fetcher.mockResolvedValueOnce(json({ items: [value], nextCursor: null }));
    const source = TestBed.inject(PublicCatalogService);
    expect(source.products()).toEqual([]);
    await source.refresh();
    expect(source.items()[0].id).toBe(id);
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe('/api/v1/catalog/products');
    expect(init?.headers).toBeUndefined();
    expect(init?.credentials).toBe('omit');
    expect(init?.redirect).toBe('error');
    expect(init?.cache).toBe('no-store');
  });
  it('does not invent products for an empty response or unavailable backend', async () => {
    const source = TestBed.inject(PublicCatalogService);
    fetcher.mockResolvedValueOnce(json({ items: [], nextCursor: null }));
    await source.refresh();
    expect(source.items()).toEqual([]); expect(source.error()).toBeNull();
    fetcher.mockResolvedValueOnce(json({ error: 'offline' }, 503));
    await source.refresh();
    expect(source.items()).toEqual([]); expect(source.error()).toContain('Unable to load');
  });
  it('fails closed for private fields, invalid pages and duplicate ids', async () => {
    const source = TestBed.inject(PublicCatalogService);
    for (const page of [{ items: [{ ...value, createdBy: 'admin' }], nextCursor: null },
      { items: [value, value], nextCursor: null }, { items: [value], nextCursor: id }, { items: [value], nextCursor: null, private: true }]) {
      fetcher.mockResolvedValueOnce(json(page));
      await source.refresh(); expect(source.items()).toEqual([]); expect(source.error()).not.toBeNull();
    }
  });
  it('loads bounded cursor pages only on demand and retries without losing the first page', async () => {
    const first = Array.from({ length: 50 }, (_, index) => ({ ...value, id: `11111111-1111-4111-8111-${String(index).padStart(12, '0')}` }));
    const cursor = first[49].id;
    fetcher.mockResolvedValueOnce(json({ items: first, nextCursor: cursor }));
    const source = TestBed.inject(PublicCatalogService); await source.refresh();
    expect(fetcher).toHaveBeenCalledTimes(1); expect(source.items()).toHaveLength(50);
    fetcher.mockResolvedValueOnce(json({}, 503)); await source.loadMore();
    expect(source.items()).toHaveLength(50); expect(source.nextCursor()).toBe(cursor);
    fetcher.mockResolvedValueOnce(json({ items: [value], nextCursor: null })); await source.loadMore();
    expect(source.items()).toHaveLength(51); expect(source.nextCursor()).toBeNull();
    expect(fetcher.mock.calls[2][0]).toBe('/api/v1/catalog/products?cursor=' + cursor);
  });
  it('hydrates known referenced products outside the first page without listing private masters', async () => {
    fetcher.mockResolvedValueOnce(json({ items: [value] }));
    const source = TestBed.inject(PublicCatalogService);
    await source.hydrate([id, id, 'osda-620']);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][0]).toBe('/api/v1/catalog/references');
    expect(JSON.parse(fetcher.mock.calls[0][1]!.body as string)).toEqual({ ids: [id] });
    expect(fetcher.mock.calls[0][1]?.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(source.items()).toEqual([]);
    expect(source.resolve({ productId: id, variantId: null, unitCode: 'panel' })?.name).toBe(value.name);
    expect(source.resolve({ productId: id, variantId: null, unitCode: 'unit' })).toBeUndefined();
  });
  it('hydrates large saved lists in bounded batches and rejects unexpected/private records', async () => {
    const ids = Array.from({ length: 25 }, (_, i) => `11111111-1111-4111-8111-${String(i).padStart(12, '0')}`);
    fetcher.mockImplementation(async (_url, init) => {
      const body = JSON.parse(init!.body as string) as { ids: string[] };
      expect(body.ids.length).toBeLessThanOrEqual(20);
      return json({ items: body.ids.map(id => ({ ...value, id })) });
    });
    const source = TestBed.inject(PublicCatalogService);
    await source.hydrate(ids);
    expect(fetcher).toHaveBeenCalledTimes(2); expect(source.products()).toHaveLength(25);
    fetcher.mockResolvedValueOnce(json({ items: [{ ...value, supplierId: id }] }));
    await source.hydrate([id]); expect(source.products().some(p => p.id === id)).toBe(false);
  });
  it('rechecks before adding and removes an unpublished product from resolution', async () => {
    fetcher.mockResolvedValueOnce(json({ items: [value], nextCursor: null }));
    const source = TestBed.inject(PublicCatalogService); await source.refresh();
    fetcher.mockResolvedValueOnce(json({ product: { ...value, version: 4, name: 'Updated live name' } }));
    expect((await source.checkProduct(id)).name).toBe('Updated live name');
    fetcher.mockResolvedValueOnce(json({}, 404));
    await expect(source.checkProduct(id)).rejects.toThrow('no longer available');
    expect(source.products()).toEqual([]);
  });
  it('prioritizes a newly opened account BOM after the bounded reference cache fills', async () => {
    const oldIds = Array.from({ length: 200 }, (_, i) => `11111111-1111-4111-8111-${String(i).padStart(12, '0')}`);
    fetcher.mockImplementation(async (_url, init) => {
      const body = JSON.parse(init!.body as string) as { ids: string[] };
      return json({ items: body.ids.map(id => ({ ...value, id })) });
    });
    const source = TestBed.inject(PublicCatalogService);
    await source.hydrate(oldIds);
    await source.hydrate([id]);
    expect(source.products()).toHaveLength(200);
    expect(source.resolve({ productId: id, variantId: null, unitCode: 'panel' })?.name).toBe(value.name);
    expect(fetcher.mock.calls.at(-1)?.[1]?.body).toBe(JSON.stringify({ ids: [id] }));
  });
  it('explicit BOM refresh updates known prices and removes unpublished references without inventing lines', async () => {
    fetcher.mockResolvedValueOnce(json({ items: [value], nextCursor: null }));
    const source = TestBed.inject(PublicCatalogService); await source.refresh();
    fetcher.mockResolvedValueOnce(json({ items: [{ ...value, version: 4, amountMinor: 99900 }] }));
    await source.hydrate([id], true);
    expect(source.items()[0].price).toBe(999);
    expect(source.resolve({ productId: id, variantId: null, unitCode: 'panel' })?.price).toBe(999);
    fetcher.mockResolvedValueOnce(json({ items: [] }));
    await source.hydrate([id], true);
    expect(source.items()).toEqual([]);
    expect(source.resolve({ productId: id, variantId: null, unitCode: 'panel' })).toBeUndefined();
  });
  it('rejects mismatched product identities and unsafe paths without credentialed requests', async () => {
    const source = TestBed.inject(PublicCatalogService);
    await expect(source.checkProduct('../admin')).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
    fetcher.mockResolvedValueOnce(json({ product: { ...value, id: '22222222-2222-4222-8222-222222222222' } }));
    await expect(source.checkProduct(id)).rejects.toThrow('different product');
    expect(source.products()).toEqual([]);
  });
  it('bounds stalled list requests and releases loading for retry', async () => {
    vi.useFakeTimers(); fetcher.mockImplementation(() => new Promise(() => {}));
    const source = TestBed.inject(PublicCatalogService);
    const pending = source.refresh(); await vi.advanceTimersByTimeAsync(10_000); await pending;
    expect(source.loading()).toBe(false); expect(source.error()).not.toBeNull(); expect(source.items()).toEqual([]);
  });
});
