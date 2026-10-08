import { Dialog } from '@angular/cdk/dialog';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { PRODUCTS, SUPPLIERS } from '../../core/demo-data';
import { ProductDialog } from '../../shared/product-dialog';
import { ProductVisualComponent } from '../../shared/product-visual';
import { Tooltip } from '../../shared/tooltip';
import {
  adaptProductList, adaptPreviewDrafts, AdminProductListRow, DEFAULT_PRODUCT_QUERY, filterProductList,
  paginateProductList, PRODUCT_PAGE_SIZES, PRODUCT_STATES, ProductListQuery, ProductPageSize,
  readProductQuery, STATE_LABELS,
} from './product-list';
import { ProductPreviewStore } from './product-preview.store';
import { PreviewDraftDialog } from './preview-draft-dialog';

@Component({
  selector: 'app-products',
  imports: [CurrencyPipe, DatePipe, FormsModule, RouterLink, ProductVisualComponent, Tooltip],
  templateUrl: './products.html',
})
export class ProductsPage {
  private readonly dialog = inject(Dialog);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly preview = inject(ProductPreviewStore);
  private readonly fixtureRows = adaptProductList(PRODUCTS);
  readonly rows = computed(() => [...this.fixtureRows, ...adaptPreviewDrafts(this.preview.drafts())]);
  readonly brands = computed(() => [...new Set(this.rows().map(row => row.product.brand).filter(Boolean))].sort());
  readonly categories = computed(() => [...new Set(this.rows().map(row => row.product.category).filter(Boolean))].sort());
  readonly suppliers = computed(() => SUPPLIERS.filter(supplier => this.rows().some(row => row.supplierId === supplier.id))
    .slice().sort((left, right) => left.name.localeCompare(right.name)));
  readonly states = PRODUCT_STATES;
  readonly stateLabels = STATE_LABELS;
  readonly pageSizes = PRODUCT_PAGE_SIZES;
  readonly query = signal<ProductListQuery>(DEFAULT_PRODUCT_QUERY);
  readonly filtered = computed(() => filterProductList(this.rows(), this.query()));
  readonly result = computed(() => paginateProductList(this.filtered(), this.query()));
  readonly hasFilters = computed(() => {
    const query = this.query();
    return !!(query.search || query.brand || query.category || query.supplier || query.state !== 'all');
  });
  readonly mutationReason = 'Product editing is not available in this read-only preview.';

  constructor() {
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe(params => {
      this.query.set(readProductQuery(params, this.rows()));
    });
  }

  update(patch: Partial<ProductListQuery>): void {
    const next = { ...this.query(), page: 1, ...patch };
    void this.router.navigate([], {
      relativeTo: this.route, replaceUrl: true,
      queryParams: {
        q: next.search.slice(0, 120) || null, brand: next.brand || null, category: next.category || null,
        supplier: next.supplier || null,
        state: next.state === 'all' ? null : next.state,
        sort: next.sort === 'name' ? null : next.sort,
        size: next.pageSize === 10 ? null : next.pageSize,
        page: next.page === 1 ? null : next.page,
      },
    });
  }

  reset(): void { this.update({ search: '', brand: '', category: '', supplier: '', state: 'all', page: 1 }); }
  listUrl(): string { return this.router.url; }
  setPageSize(value: string | number): void {
    const size = Number(value);
    if (PRODUCT_PAGE_SIZES.includes(size as ProductPageSize)) this.update({ pageSize: size as ProductPageSize });
  }
  previous(): void { if (this.result().page > 1) this.update({ page: this.result().page - 1 }); }
  next(): void { if (this.result().page < this.result().pageCount) this.update({ page: this.result().page + 1 }); }
  detail(row: AdminProductListRow): void {
    const settings = { width: '520px', maxWidth: 'calc(100vw - 32px)', panelClass: 'solar-dialog-panel', backdropClass: 'solar-dialog-backdrop' };
    if (row.fixture) this.dialog.open(ProductDialog, { ...settings, data: row.fixture, ariaLabelledBy: 'product-dialog-title' });
    else if (row.previewDraft) this.dialog.open(PreviewDraftDialog, { ...settings, data: row.previewDraft, ariaLabelledBy: 'preview-draft-heading' });
  }
}
