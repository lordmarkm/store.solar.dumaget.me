import { describe, expect, it } from 'vitest';
import { PRODUCTS } from '../../core/demo-data';
import {
  adaptPreviewDrafts, adaptProductList, DEFAULT_PRODUCT_QUERY, filterProductList,
  paginateProductList, readProductQuery,
} from './product-list';

describe('read-only admin product-list projection', () => {
  const rows = adaptProductList(PRODUCTS);

  it('converts fixture pesos to centavos without inventing lifecycle or dates', () => {
    expect(rows).toHaveLength(6);
    expect(rows[0].price).toEqual({ currency: 'PHP', amountMinor: 645000 });
    expect(rows.every(row => row.publicationState === 'not-configured' && row.updatedAt === null)).toBe(true);
    expect(rows[0].product).toBe(PRODUCTS[0]);
  });

  it('leaves invalid, negative or unsafe prices unknown instead of zero', () => {
    const prices = [NaN, Infinity, -1, Number.MAX_SAFE_INTEGER];
    expect(adaptProductList(prices.map(price => ({ ...PRODUCTS[0], price }))).every(row => row.price === null)).toBe(true);
    expect(adaptProductList([{ ...PRODUCTS[0], price: 0 }])[0].price?.amountMinor).toBe(0);
  });

  it('searches normalized SKU, name and brand and intersects filters', () => {
    expect(filterProductList(rows, { ...DEFAULT_PRODUCT_QUERY, search: '  osd-620N  ' }).map(row => row.product.id)).toEqual(['osda-620']);
    expect(filterProductList(rows, { ...DEFAULT_PRODUCT_QUERY, search: 'LiFePO4', brand: 'SRNE', category: 'Batteries' }).map(row => row.product.id)).toEqual(['srne-314']);
    expect(filterProductList(rows, { ...DEFAULT_PRODUCT_QUERY, brand: 'OSDA', category: 'Batteries' })).toHaveLength(0);
  });

  it('filters by supplier identity, intersects other filters, and never substitutes brand or name', () => {
    const supplierId = rows.find(row => row.product.brand === 'SRNE')?.supplierId;
    expect(supplierId).toBeTruthy();
    expect(filterProductList(rows, { ...DEFAULT_PRODUCT_QUERY, supplier: supplierId!, brand: 'SRNE' })
      .map(row => row.product.id)).toEqual(['srne-314', 'srne-6200']);
    expect(filterProductList(rows, { ...DEFAULT_PRODUCT_QUERY, supplier: supplierId!, category: 'Batteries', search: 'LiFePO4', state: 'not-configured' })
      .map(row => row.product.id)).toEqual(['srne-314']);

    const sameBrandDifferentSupplier = [
      { ...rows[0], product: { ...rows[0].product, name: 'supplier-a' }, supplierId: 'supplier-a' },
      { ...rows[0], product: { ...rows[0].product, id: 'same-brand-other-supplier', name: 'supplier-a' }, supplierId: 'supplier-b' },
    ];
    expect(filterProductList(sameBrandDifferentSupplier, { ...DEFAULT_PRODUCT_QUERY, supplier: 'supplier-a' }).map(row => row.supplierId))
      .toEqual(['supplier-a']);
    expect(filterProductList(sameBrandDifferentSupplier, { ...DEFAULT_PRODUCT_QUERY, supplier: 'supplier-A' })).toHaveLength(0);
    expect(filterProductList(sameBrandDifferentSupplier, { ...DEFAULT_PRODUCT_QUERY, supplier: 'supplier-a', search: 'supplier-a' })).toHaveLength(1);
  });

  it('keeps supplier-less preview drafts visible only when no supplier is selected', () => {
    const [draft] = adaptPreviewDrafts([{
      id: 'supplier-less-preview', schemaVersion: 1, state: 'draft', sku: 'SUPPLIER-LESS',
      name: 'Supplier-less preview draft', brand: 'SRNE', category: null, unitCode: null,
      description: '', basePrice: null, createdAt: '2026-10-06T00:00:00Z', updatedAt: '2026-10-06T00:00:00Z',
    }]);
    expect(draft.supplierId).toBeNull();
    expect(filterProductList([...rows, draft], DEFAULT_PRODUCT_QUERY)).toContain(draft);
    const supplierId = rows.find(row => row.supplierId)!.supplierId!;
    expect(filterProductList([...rows, draft], { ...DEFAULT_PRODUCT_QUERY, supplier: supplierId })).not.toContain(draft);
  });

  it('does not infer publication from appearing in customer fixtures', () => {
    expect(filterProductList(rows, { ...DEFAULT_PRODUCT_QUERY, state: 'published' })).toHaveLength(0);
    expect(filterProductList(rows, { ...DEFAULT_PRODUCT_QUERY, state: 'not-configured' })).toHaveLength(6);
  });

  it('sorts names, SKUs and prices without mutating the fixtures or input rows', () => {
    const before = JSON.stringify(PRODUCTS);
    const rowIds = rows.map(row => row.product.id);
    expect(filterProductList(rows, { ...DEFAULT_PRODUCT_QUERY, sort: 'sku' })[0].product.sku).toBe('AN-LFP24100C');
    expect(filterProductList(rows, { ...DEFAULT_PRODUCT_QUERY, sort: 'price-asc' })[0].product.id).toBe('combiner-2');
    expect(filterProductList(rows, { ...DEFAULT_PRODUCT_QUERY, sort: 'price-desc' })[0].product.id).toBe('srne-314');
    expect(rows.map(row => row.product.id)).toEqual(rowIds);
    expect(JSON.stringify(PRODUCTS)).toBe(before);
  });

  it('keeps unknown prices last in both price sort directions', () => {
    const unknownRows = [{ ...rows[0], price: null }, rows[1]];
    for (const sort of ['price-asc', 'price-desc'] as const) {
      expect(filterProductList(unknownRows, { ...DEFAULT_PRODUCT_QUERY, sort })[1].price).toBeNull();
    }
  });

  it('validates restored URL state against known values and bounds search length', () => {
    const supplier = rows.find(row => row.supplierId)!.supplierId!;
    const valid = readProductQuery(new URLSearchParams(`q=SRNE&brand=SRNE&category=Batteries&supplier=${supplier}&state=draft&sort=price-desc&size=5&page=2`), rows);
    expect(valid).toEqual({ ...DEFAULT_PRODUCT_QUERY, search: 'SRNE', brand: 'SRNE', category: 'Batteries', supplier, state: 'draft', sort: 'price-desc', pageSize: 5, page: 2 });
    const invalid = readProductQuery(new URLSearchParams({ q: 'x'.repeat(500), brand: 'missing', category: 'missing', supplier: 'missing', state: 'deleted', sort: 'random', size: '100000', page: '-1' }), rows);
    expect(invalid).toEqual({ ...DEFAULT_PRODUCT_QUERY, search: 'x'.repeat(120) });
    expect(readProductQuery(new URLSearchParams({ supplier: 'SRNE' }), rows).supplier).toBe('');
    for (const page of ['Infinity', '1.5', '0', '99999999999', '1e3']) {
      expect(readProductQuery(new URLSearchParams({ page }), rows).page).toBe(1);
    }
  });

  it('paginates, clamps stale page URLs and gives a zero-result range', () => {
    expect(paginateProductList(rows, { ...DEFAULT_PRODUCT_QUERY, pageSize: 5, page: 2 })).toMatchObject({ page: 2, pageCount: 2, from: 6, to: 6, total: 6 });
    expect(paginateProductList(rows, { ...DEFAULT_PRODUCT_QUERY, page: 999 })).toMatchObject({ page: 1, from: 1, to: 6 });
    expect(paginateProductList([], DEFAULT_PRODUCT_QUERY)).toEqual({ rows: [], page: 1, pageCount: 1, from: 0, to: 0, total: 0 });
  });
});
