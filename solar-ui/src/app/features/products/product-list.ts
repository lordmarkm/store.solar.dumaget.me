import type { Money, Product, ProductVisual } from '../../core/models';
import type { PreviewProductDraft } from './product-draft';

export const PRODUCT_STATES = ['not-configured', 'draft', 'published', 'archived'] as const;
export type ProductListState = typeof PRODUCT_STATES[number];
export const PRODUCT_SORTS = ['name', 'sku', 'price-asc', 'price-desc'] as const;
export type ProductListSort = typeof PRODUCT_SORTS[number];
export const PRODUCT_PAGE_SIZES = [5, 10, 25] as const;
export type ProductPageSize = typeof PRODUCT_PAGE_SIZES[number];

/** Read-only adapter, not a product master or an invented publication record. */
export interface AdminProductListRow {
  readonly product: Pick<Product, 'id' | 'sku' | 'name' | 'brand' | 'unit' | 'spec' | 'images'> & {
    readonly category: string; readonly stock: number | null;
    readonly depot: string | null; readonly visual: ProductVisual | null;
  };
  readonly fixture: Product | null;
  readonly previewDraft: PreviewProductDraft | null;
  readonly supplierId: string | null;
  readonly publicationState: ProductListState;
  readonly price: Money | null;
  readonly updatedAt: string | null;
}

export interface ProductListQuery {
  readonly search: string;
  readonly brand: string;
  readonly category: string;
  readonly supplier: string;
  readonly state: 'all' | ProductListState;
  readonly sort: ProductListSort;
  readonly pageSize: ProductPageSize;
  readonly page: number;
}

export const DEFAULT_PRODUCT_QUERY: ProductListQuery = {
  search: '', brand: '', category: '', supplier: '', state: 'all', sort: 'name', pageSize: 10, page: 1,
};

export const STATE_LABELS: Readonly<Record<ProductListState, string>> = {
  'not-configured': 'Not configured', draft: 'Draft', published: 'Published', archived: 'Archived',
};

export function adaptProductList(products: readonly Product[]): readonly AdminProductListRow[] {
  return products.map(product => {
    const amountMinor = Math.round(product.price * 100);
    return {
      product, fixture: product, previewDraft: null, supplierId: product.supplierId || null,
      publicationState: 'not-configured', updatedAt: null,
      price: Number.isFinite(product.price) && product.price >= 0 && Number.isSafeInteger(amountMinor)
        ? { currency: 'PHP', amountMinor } : null,
    };
  });
}

export function adaptPreviewDrafts(drafts: readonly PreviewProductDraft[]): readonly AdminProductListRow[] {
  return drafts.map(draft => ({
    product: {
      id: draft.id, sku: draft.sku, name: draft.name, brand: draft.brand,
      category: draft.category ?? '', unit: draft.unitCode ?? '', spec: 'Preview draft',
      stock: null, depot: null, visual: null,
    },
    fixture: null, previewDraft: draft, supplierId: null, publicationState: 'draft',
    price: draft.basePrice, updatedAt: draft.updatedAt,
  }));
}

export function readProductQuery(
  params: { get(name: string): string | null }, rows: readonly AdminProductListRow[],
): ProductListQuery {
  const brand = params.get('brand') ?? '';
  const category = params.get('category') ?? '';
  const supplier = params.get('supplier') ?? '';
  const state = params.get('state');
  const sort = params.get('sort');
  const size = params.get('size');
  const page = params.get('page');
  return {
    search: (params.get('q') ?? '').slice(0, 120),
    brand: rows.some(row => row.product.brand === brand) ? brand : '',
    category: rows.some(row => row.product.category === category) ? category : '',
    supplier: rows.some(row => row.supplierId === supplier) ? supplier : '',
    state: PRODUCT_STATES.includes(state as ProductListState) ? state as ProductListState : 'all',
    sort: PRODUCT_SORTS.includes(sort as ProductListSort) ? sort as ProductListSort : 'name',
    pageSize: PRODUCT_PAGE_SIZES.includes(Number(size) as ProductPageSize) ? Number(size) as ProductPageSize : 10,
    page: page && /^[1-9]\d{0,5}$/.test(page) ? Number(page) : 1,
  };
}

export function filterProductList(rows: readonly AdminProductListRow[], query: ProductListQuery): readonly AdminProductListRow[] {
  const term = query.search.trim().toLocaleLowerCase();
  return rows.filter(row =>
    (!query.brand || row.product.brand === query.brand) &&
    (!query.category || row.product.category === query.category) &&
    (!query.supplier || row.supplierId === query.supplier) &&
    (query.state === 'all' || row.publicationState === query.state) &&
    `${row.product.name} ${row.product.sku} ${row.product.brand}`.toLocaleLowerCase().includes(term),
  ).sort((left, right) => {
    if (query.sort === 'price-asc' || query.sort === 'price-desc') {
      // Unknown prices stay last, in either direction; never treat them as zero.
      if (left.price === null && right.price !== null) return 1;
      if (right.price === null && left.price !== null) return -1;
      const difference = (left.price?.amountMinor ?? 0) - (right.price?.amountMinor ?? 0);
      if (difference) return query.sort === 'price-desc' ? -difference : difference;
    }
    const comparison = query.sort === 'sku'
      ? left.product.sku.localeCompare(right.product.sku)
      : left.product.name.localeCompare(right.product.name);
    return comparison || left.product.id.localeCompare(right.product.id);
  });
}

export function paginateProductList(rows: readonly AdminProductListRow[], query: ProductListQuery) {
  const pageCount = Math.max(1, Math.ceil(rows.length / query.pageSize));
  const page = Math.min(Math.max(1, query.page), pageCount);
  const start = (page - 1) * query.pageSize;
  return {
    rows: rows.slice(start, start + query.pageSize), page, pageCount,
    from: rows.length ? start + 1 : 0, to: Math.min(start + query.pageSize, rows.length), total: rows.length,
  };
}
