import { TestBed } from '@angular/core/testing';
import { signal, WritableSignal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BomService, DRAFT_KEY } from './bom.service';
import { PRODUCTS } from './demo-data';
import { LOCAL_PROJECTS_KEY, ProjectService } from './project.service';
import { PLANNING_PRODUCTS } from './product-source';
import { Product } from './models';

describe('local draft BOM', () => {
  let planningProducts: WritableSignal<readonly Product[]>;
  beforeEach(() => {
    // Node 26 exposes a non-browser localStorage accessor; use a browser-like test store.
    const values = new Map<string, string>();
    const storage: Storage = {
      get length() { return values.size; },
      clear: () => values.clear(),
      getItem: key => values.get(key) ?? null,
      key: index => [...values.keys()][index] ?? null,
      removeItem: key => { values.delete(key); },
      setItem: (key, value) => { values.set(key, String(value)); },
    };
    vi.stubGlobal('localStorage', storage);
    planningProducts = signal(PRODUCTS);
    TestBed.configureTestingModule({ providers: [{ provide: PLANNING_PRODUCTS, useValue: planningProducts }] });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('adds equipment, applies quantity tiers, and calculates VAT already included in the total', () => {
    const bom = TestBed.inject(BomService);
    expect(bom.add('osda-620', 31)).toBe(true);
    expect(bom.add('srne-6200', 3)).toBe(true);
    expect(bom.lines()[0].unitPrice).toBe(5890);
    expect(bom.total()).toBe(31 * 5890 + 3 * 32200);
    expect(bom.savings()).toBe(31 * 560 + 3 * 2300);
    expect(bom.vat()).toBe(Math.round((bom.total() - bom.total() / 1.12) * 100) / 100);
  });

  it('rejects nonexistent SKUs and invalid quantities but allows plans above stock', () => {
    const bom = TestBed.inject(BomService);
    expect(bom.add('unknown')).toBe(false);
    expect(bom.add('osda-620', 0.5)).toBe(false);
    expect(bom.add('osda-620', -1)).toBe(false);
    expect(bom.add('combiner-2', 2)).toBe(true);
    expect(bom.add('combiner-2')).toBe(true);
    expect(bom.setQuantity('combiner-2', 1000)).toBe(true);
    expect(bom.setQuantity('combiner-2', Number.MAX_SAFE_INTEGER + 1)).toBe(false);
    expect(bom.add('combiner-2', Infinity)).toBe(false);
    expect(bom.setQuantity('combiner-2', 0)).toBe(false);
    expect(bom.quantity('combiner-2')).toBe(1000);
  });

  it('recalculates prices when quantities fall below a tier and removes only the chosen line', () => {
    const bom = TestBed.inject(BomService);
    bom.add('osda-620', 31); bom.add('srne-6200');
    bom.setQuantity('osda-620', 30);
    expect(bom.lines().find(line => line.product.id === 'osda-620')?.unitPrice).toBe(6450);
    bom.remove('osda-620');
    expect(bom.lines()).toHaveLength(1);
    expect(bom.total()).toBe(34500);
  });

  it('retains valid legacy quantities above stock and unavailable product references', () => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify([
      { productId: 'osda-620', quantity: 3 }, { productId: 'osda-620', quantity: 999 },
      { productId: 'missing', quantity: 2 }, { productId: 'srne-6200', quantity: -2 },
      { productId: 'srne-314', quantity: '2' }, null,
    ]));
    const bom = TestBed.inject(BomService);
    expect(bom.lines()).toHaveLength(1);
    expect(bom.quantity('osda-620')).toBe(999);
    expect(bom.unavailable()).toEqual([{ productId: 'missing', quantity: 2 }]);
    expect(bom.lineCount()).toBe(2);
    expect(bom.count()).toBe(1001);
    TestBed.tick();
    expect(bom.currentList()?.items.map(item => ({ productId: item.product.productId, quantity: item.quantity }))).toEqual([{ productId: 'osda-620', quantity: 999 }, { productId: 'missing', quantity: 2 }]);
    bom.remove('missing');
    expect(bom.unavailable()).toHaveLength(0);
  });

  it('retains restored and newly added equipment even when sample stock is zero', () => {
    const product = PRODUCTS.find(p => p.id === 'combiner-2')!;
    const stock = product.stock;
    try {
      product.stock = 0;
      localStorage.setItem(DRAFT_KEY, JSON.stringify([{ productId: product.id, quantity: 8 }]));
      const bom = TestBed.inject(BomService);
      expect(bom.quantity(product.id)).toBe(8);
      expect(bom.add(product.id)).toBe(true);
      expect(bom.quantity(product.id)).toBe(9);
    } finally { product.stock = stock; }
  });

  it('does not turn unavailable products into zero-priced equipment or discard them on unrelated edits', () => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify([{ productId: 'deleted-equipment', quantity: 50 }]));
    const bom = TestBed.inject(BomService);
    expect(bom.lines()).toHaveLength(0);
    expect(bom.total()).toBe(0);
    expect(bom.lineCount()).toBe(1);
    bom.add('rail-6', 2);
    TestBed.tick();
    expect(bom.currentList()?.items.some(item => item.product.productId === 'deleted-equipment' && item.quantity === 50)).toBe(true);
    expect(JSON.parse(localStorage.getItem(LOCAL_PROJECTS_KEY)!).guestHistory.lists[0].items).toHaveLength(2);
  });

  it('reacts to arbitrary published UUID products, flat prices, and unpublish while retaining cart quantities', () => {
    const id = '11111111-1111-4111-8111-111111111111';
    const published = { ...PRODUCTS[0], id, sku: 'PUBLIC-UUID', source: 'published' as const, amountMinor: 12345, price: 123.45, publishedVersion: 3, stock: 0, tiers: [] };
    const bom = TestBed.inject(BomService);
    planningProducts.set([...PRODUCTS, published]);
    expect(bom.add(id, 40)).toBe(true);
    expect(bom.lines().find(line => line.product.id === id)).toMatchObject({ unitPrice: 123.45, total: 4938 });
    expect(bom.vat()).toBeNull();
    planningProducts.set(PRODUCTS);
    expect(bom.lines().some(line => line.product.id === id)).toBe(false);
    expect(bom.unavailable()).toContainEqual({ productId: id, quantity: 40 });
    expect(bom.quantity(id)).toBe(40);
    planningProducts.set([...PRODUCTS, { ...published, amountMinor: 99900, price: 999, publishedVersion: 4 }]);
    expect(bom.lines().find(line => line.product.id === id)?.unitPrice).toBe(999);
  });

  it('rejects adding a retained cart reference after its published unit changes but still permits quantity edits', () => {
    const bom = TestBed.inject(BomService);
    expect(bom.add('osda-620', 4)).toBe(true);
    planningProducts.set(PRODUCTS.map(product => product.id === 'osda-620' ? { ...product, unit: 'unit' } : product));
    expect(bom.add('osda-620')).toBe(false);
    expect(bom.quantity('osda-620')).toBe(4);
    expect(bom.unavailable()).toContainEqual({ productId: 'osda-620', quantity: 4 });
    expect(bom.setQuantity('osda-620', 6)).toBe(true);
    expect(bom.quantity('osda-620')).toBe(6);
  });

  it('preserves malformed legacy storage and blocks editing instead of erasing it', () => {
    localStorage.setItem(DRAFT_KEY, '{invalid');
    const bom = TestBed.inject(BomService);
    expect(bom.lines()).toHaveLength(0);
    expect(bom.add('rail-6')).toBe(false);
    expect(localStorage.getItem(DRAFT_KEY)).toBe('{invalid');
  });

  it('persists changes in the browser', () => {
    const bom = TestBed.inject(BomService);
    bom.add('rail-6', 2);
    TestBed.tick();
    expect(new ProjectService(signal(PRODUCTS)).currentGuestList()?.items[0].quantity).toBe(2);
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
  });
});
