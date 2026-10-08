import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PRODUCTS } from '../../core/demo-data';
import { adaptPreviewDrafts } from './product-list';
import { emptyProductInput } from './product-draft';
import { PRODUCT_PREVIEW_ENABLED, ProductPreviewStore } from './product-preview.store';

describe('development-only in-memory product drafts', () => {
  const input = { ...emptyProductInput(), sku: ' preview-panel ', name: ' Preview panel ' };
  beforeEach(() => TestBed.configureTestingModule({ providers: [{ provide: PRODUCT_PREVIEW_ENABLED, useValue: true }] }));
  afterEach(() => vi.restoreAllMocks());
  it('creates an incomplete draft without mutating fixtures, stock, or browser storage', () => {
    const store = TestBed.inject(ProductPreviewStore);
    const before = JSON.stringify(PRODUCTS);
    const storageSpy = vi.spyOn(Storage.prototype, 'setItem');
    const result = store.create(input, 'request-1');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.draft).toMatchObject({ sku: 'PREVIEW-PANEL', name: 'Preview panel', state: 'draft', brand: '', category: null, unitCode: null, basePrice: null });
    expect(Object.isFrozen(result.draft)).toBe(true);
    expect(result.draft.id).toMatch(/^admin-preview-/);
    expect(JSON.parse(JSON.stringify(result.draft))).toEqual(result.draft);
    expect(JSON.stringify(PRODUCTS)).toBe(before);
    expect(storageSpy).not.toHaveBeenCalled();
    expect(adaptPreviewDrafts(store.drafts())[0]).toMatchObject({ publicationState: 'draft', price: null, fixture: null, product: { stock: null, visual: null, unit: '' } });
  });
  it('stores exact provisional pricing separately from unset stock and tax', () => {
    const result = TestBed.inject(ProductPreviewStore).create({ ...input, priceText: '19.99', category: 'Panels', unitCode: 'panel' }, 'price-1');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.draft.basePrice).toEqual({ currency: 'PHP', amountMinor: 1999 });
      expect(result.draft).not.toHaveProperty('stock');
      expect(result.draft).not.toHaveProperty('tax');
      expect(result.draft).not.toHaveProperty('snapshot');
    }
  });
  it('rejects fixture and draft SKU duplicates without a partial save', () => {
    const store = TestBed.inject(ProductPreviewStore);
    expect(store.create({ ...input, sku: ' osd-620n-bf ' }, 'fixture-dup').ok).toBe(false);
    expect(store.drafts()).toHaveLength(0);
    expect(store.create(input, 'first').ok).toBe(true);
    expect(store.create({ ...input, sku: 'PREVIEW-PANEL' }, 'second').ok).toBe(false);
    expect(store.drafts()).toHaveLength(1);
  });
  it('makes retries idempotent and rejects request reuse with changed content', () => {
    const store = TestBed.inject(ProductPreviewStore);
    const first = store.create(input, 'same-request');
    expect(store.create(input, 'same-request')).toEqual(first);
    expect(store.create({ ...input, name: 'Changed' }, 'same-request').ok).toBe(false);
    expect(store.drafts()).toHaveLength(1);
  });
  it('rejects creation with preview disabled even if called without a route guard', () => {
    TestBed.overrideProvider(PRODUCT_PREVIEW_ENABLED, { useValue: false });
    const store = TestBed.inject(ProductPreviewStore);
    expect(store.create(input, 'disabled').ok).toBe(false);
    expect(store.drafts()).toHaveLength(0);
  });
  it('fails safely on ID generation and allows the same request to retry', () => {
    const store = TestBed.inject(ProductPreviewStore);
    const idSpy = vi.spyOn(crypto, 'randomUUID').mockImplementationOnce(() => { throw new Error('unavailable'); });
    expect(store.create(input, 'retry').ok).toBe(false);
    expect(store.drafts()).toHaveLength(0);
    idSpy.mockRestore();
    expect(store.create(input, 'retry').ok).toBe(true);
  });
  it('has no persistence across a new application injector', () => {
    TestBed.inject(ProductPreviewStore).create(input, 'temporary');
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [{ provide: PRODUCT_PREVIEW_ENABLED, useValue: true }] });
    expect(TestBed.inject(ProductPreviewStore).drafts()).toHaveLength(0);
  });
});
