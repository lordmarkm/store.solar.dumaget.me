import { CurrencyPipe } from '@angular/common';
import { Component, computed, DestroyRef, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NavigationStart, Router, RouterLink } from '@angular/router';
import { AdminAccessService } from '../../core/admin-access.service';
import { AdminCatalogApiService } from '../../core/admin-catalog-api.service';
import type { ProductListFilters } from '../../core/admin-catalog-api.service';
import type { AdminPage, AdminProduct, AdminSupplier } from '../../core/admin-catalog.models';
import { AuthSessionService } from '../../core/auth-session.service';
import { AuthNavigationService } from '../../core/auth-navigation.service';
import { STOREFRONT_AUTH_ENABLED } from '../../core/firebase-config';
import { StoreApiError } from '../../core/store-api.service';
import { KtuiTable, KtuiTableColumn } from '../../shared/ktui-table';
import { Tooltip } from '../../shared/tooltip';
import { ProductLightboxDirective } from '../../shared/product-lightbox';

import { PRODUCT_CATEGORIES } from '../../core/product-categories';

@Component({
  selector: 'app-admin-products',
  imports: [CurrencyPipe, FormsModule, RouterLink, KtuiTable, KtuiTableColumn, Tooltip, ProductLightboxDirective],
  templateUrl: './admin-products.html',
})
export class AdminProductsPage {
  readonly access = inject(AdminAccessService);
  readonly auth = inject(AuthSessionService);
  readonly login = inject(AuthNavigationService);
  readonly authorizedRevision = signal(-1);
  readonly canAccess = computed(() => this.access.authorized() && this.auth.sessionRevision() === this.authorizedRevision());
  private readonly api = inject(AdminCatalogApiService);
  private readonly destroyRef = inject(DestroyRef);
  readonly rows = signal<AdminProduct[]>([]);
  readonly tableRowKey = (product: AdminProduct): string => product.id;
  readonly cursor = signal<string | null>(null);
  readonly loading = signal(false);
  readonly searchPending = signal(false);
  readonly error = signal<string | null>(null);
  readonly search = signal('');
  readonly brand = signal('');
  readonly category = signal('');
  readonly supplierId = signal('');
  readonly suppliers = signal<AdminSupplier[]>([]);
  readonly supplierCursor = signal<string | null>(null);
  readonly suppliersLoading = signal(false);
  readonly suppliersError = signal<string | null>(null);
  readonly categories = PRODUCT_CATEGORIES;
  readonly brands = signal<string[]>([]);
  readonly brandCursor = signal<string | null>(null);
  readonly brandsLoading = signal(false);
  readonly brandsError = signal<string | null>(null);

  private fetchSequence = 0;
  private queryGeneration = 0;
  private supplierSequence = 0;
  private brandSequence = 0;
  private seenRevision = -1;
  private suppliersRevision = -1;
  private wasAuthorized = false;
  private destroyed = false;
  private routeGeneration = 0;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly router = inject(Router);

  constructor() {
    const routeSubscription = this.router.events.subscribe(event => {
      if (event instanceof NavigationStart && event.url.split(/[?#]/, 1)[0] !== '/admin/products') {
        this.routeGeneration++;
        this.queryGeneration++; this.fetchSequence++; this.supplierSequence++; this.brandSequence++;
        this.cancelSearchDebounce();
        this.loading.set(false); this.suppliersLoading.set(false); this.brandsLoading.set(false);
      }
    });
    this.destroyRef.onDestroy(() => {
      this.destroyed = true;
      this.queryGeneration++; this.fetchSequence++; this.supplierSequence++; this.brandSequence++;
      this.cancelSearchDebounce(); routeSubscription.unsubscribe();
    });
    effect(() => {
      const revision = this.auth.sessionRevision();
      const authorized = this.access.authorized();
      if (!authorized) {
        this.queryGeneration++; this.fetchSequence++; this.supplierSequence++; this.brandSequence++;
        this.cancelSearchDebounce();
        this.rows.set([]); this.cursor.set(null); this.error.set(null); this.loading.set(false);
        this.search.set(''); this.brand.set(''); this.category.set(''); this.supplierId.set('');
        this.suppliers.set([]); this.supplierCursor.set(null); this.suppliersError.set(null); this.suppliersLoading.set(false);
        this.brands.set([]); this.brandCursor.set(null); this.brandsError.set(null); this.brandsLoading.set(false);
        this.suppliersRevision = -1;
        this.wasAuthorized = false;
        this.seenRevision = revision;
        this.authorizedRevision.set(-1);
        return;
      }
      this.authorizedRevision.set(revision);
      const revisionChanged = revision !== this.seenRevision;
      const authorizationChanged = !this.wasAuthorized;
      if (authorizationChanged || revisionChanged) {
        this.wasAuthorized = true;
        this.seenRevision = revision;
        this.cancelSearchDebounce();
        this.queryGeneration++; this.fetchSequence++;
        this.rows.set([]); this.cursor.set(null); this.error.set(null); this.loading.set(false); this.search.set('');
        this.brand.set(''); this.category.set(''); this.supplierId.set('');
        void this.load(null, true, revision);
      }
      if (this.suppliersRevision !== revision) {
        this.suppliersRevision = revision;
        this.supplierSequence++; this.brandSequence++;
        this.suppliers.set([]); this.supplierCursor.set(null);
        this.suppliersLoading.set(false); this.suppliersError.set(null);
        this.brands.set([]); this.brandCursor.set(null);
        this.brandsLoading.set(false); this.brandsError.set(null);
        void this.loadSuppliers(null, true, revision);
        void this.loadBrands(null, true, revision);
      }
    });
  }

  async loadMore(): Promise<void> {
    const next = this.cursor();
    if (next) await this.load(next, false, this.auth.sessionRevision());
  }

  async loadMoreSuppliers(): Promise<void> {
    const next = this.supplierCursor();
    if (next) await this.loadSuppliers(next, false, this.auth.sessionRevision());
  }

  async loadMoreBrands(): Promise<void> {
    const next = this.brandCursor();
    if (next) await this.loadBrands(next, false, this.auth.sessionRevision());
  }

  supplierName(id: string): string {
    return this.suppliers().find(supplier => supplier.id === id)?.name ?? 'Supplier record not loaded';
  }

  setSkuPrefix(value: string): void {
    this.cancelSearchDebounce();
    this.search.set(value.slice(0, 64));
    const generation = this.resetProductQuery();
    if (!this.canAccess()) return;
    this.searchPending.set(true);
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      this.searchPending.set(false);
      if (generation === this.queryGeneration) void this.load(null, true, this.auth.sessionRevision());
    }, 300);
  }

  setBrand(value: string): void { this.brand.set(value); this.applyDropdownFilter(); }
  setCategory(value: string): void { this.category.set(value); this.applyDropdownFilter(); }
  setSupplierId(value: string): void { this.supplierId.set(value); this.applyDropdownFilter(); }

  clearFilters(): void {
    this.cancelSearchDebounce();
    this.search.set(''); this.brand.set(''); this.category.set(''); this.supplierId.set('');
    this.resetProductQuery();
    if (this.canAccess()) void this.load(null, true, this.auth.sessionRevision());
  }

  productFilters(): ProductListFilters {
    const filters: ProductListFilters = {};
    const skuPrefix = this.search().trim();
    if (skuPrefix) filters.skuPrefix = skuPrefix;
    if (this.brand()) filters.brand = this.brand();
    if (this.category()) filters.category = this.category();
    if (this.supplierId()) filters.supplierId = this.supplierId();
    return filters;
  }

  private applyDropdownFilter(): void {
    this.cancelSearchDebounce();
    this.resetProductQuery();
    if (this.canAccess()) void this.load(null, true, this.auth.sessionRevision());
  }

  private resetProductQuery(): number {
    this.queryGeneration++; this.fetchSequence++;
    this.rows.set([]); this.cursor.set(null); this.error.set(null); this.loading.set(false);
    return this.queryGeneration;
  }

  private cancelSearchDebounce(): void {
    if (this.debounceTimer !== null) clearTimeout(this.debounceTimer);
    this.debounceTimer = null;
    this.searchPending.set(false);
  }

  private async load(cursor: string | null, replace: boolean, revision: number): Promise<void> {
    if (!this.canAccess() || revision !== this.auth.sessionRevision() || this.destroyed || this.loading()) return;
    const sequence = ++this.fetchSequence;
    const generation = this.queryGeneration;
    const routeGeneration = this.routeGeneration;
    const filters = this.productFilters();
    this.loading.set(true); this.error.set(null);
    try {
      const page: AdminPage<AdminProduct> = await this.api.listProducts(cursor, filters);
      if (!this.isCurrentRequest(sequence, generation, routeGeneration, revision)) return;
      this.rows.set(replace ? page.items : [...this.rows(), ...page.items]);
      this.cursor.set(page.nextCursor);
    } catch (error) {
      if (this.isCurrentRequest(sequence, generation, routeGeneration, revision)) {
        this.error.set(error instanceof StoreApiError ? error.message : 'Unable to load products. Try again.');
      }
    } finally {
      if (this.isCurrentRequest(sequence, generation, routeGeneration, revision)) this.loading.set(false);
    }
  }

  private isCurrentRequest(sequence: number, generation: number, routeGeneration: number, revision: number): boolean {
    return !this.destroyed && sequence === this.fetchSequence && generation === this.queryGeneration
      && routeGeneration === this.routeGeneration && this.canAccess() && revision === this.auth.sessionRevision();
  }

  retry(): void {
    if (!this.canAccess() || this.loading()) return;
    const cursor = this.rows().length ? this.cursor() : null;
    void this.load(cursor, !this.rows().length, this.auth.sessionRevision());
  }

  retrySuppliers(): void {
    if (!this.canAccess() || this.suppliersLoading()) return;
    void this.loadSuppliers(this.suppliers().length ? this.supplierCursor() : null, !this.suppliers().length, this.auth.sessionRevision());
  }

  private async loadSuppliers(cursor: string | null, replace: boolean, revision: number): Promise<void> {
    if (!this.canAccess() || revision !== this.auth.sessionRevision() || this.destroyed || this.suppliersLoading()) return;
    const sequence = ++this.supplierSequence;
    const routeGeneration = this.routeGeneration;
    this.suppliersLoading.set(true); this.suppliersError.set(null);
    try {
      const page = await this.api.listSuppliers(cursor);
      if (!this.isCurrentOptionRequest(sequence, this.supplierSequence, routeGeneration, revision)) return;
      this.suppliers.set(replace ? page.items : [...this.suppliers(), ...page.items]);
      this.supplierCursor.set(page.nextCursor);
    } catch (error) {
      if (this.isCurrentOptionRequest(sequence, this.supplierSequence, routeGeneration, revision)) {
        this.suppliersError.set(error instanceof StoreApiError ? error.message : 'Unable to load supplier filter options. Try again.');
      }
    } finally { if (this.isCurrentOptionRequest(sequence, this.supplierSequence, routeGeneration, revision)) this.suppliersLoading.set(false); }
  }

  private async loadBrands(cursor: string | null, replace: boolean, revision: number): Promise<void> {
    if (!this.canAccess() || revision !== this.auth.sessionRevision() || this.destroyed || this.brandsLoading()) return;
    const sequence = ++this.brandSequence;
    const routeGeneration = this.routeGeneration;
    this.brandsLoading.set(true); this.brandsError.set(null);
    try {
      const page = await this.api.listProductBrands(cursor);
      if (!this.isCurrentOptionRequest(sequence, this.brandSequence, routeGeneration, revision)) return;
      this.brands.set(replace ? page.items : [...this.brands(), ...page.items]);
      this.brandCursor.set(page.nextCursor);
    } catch (error) {
      if (this.isCurrentOptionRequest(sequence, this.brandSequence, routeGeneration, revision)) {
        this.brandsError.set(error instanceof StoreApiError ? error.message : 'Unable to load brand filter options. Try again.');
      }
    } finally { if (this.isCurrentOptionRequest(sequence, this.brandSequence, routeGeneration, revision)) this.brandsLoading.set(false); }
  }

  private isCurrentOptionRequest(sequence: number, currentSequence: number, routeGeneration: number, revision: number): boolean {
    return !this.destroyed && sequence === currentSequence && routeGeneration === this.routeGeneration
      && this.canAccess() && revision === this.auth.sessionRevision();
  }

  retryBrands(): void {
    if (!this.canAccess() || this.brandsLoading()) return;
    void this.loadBrands(this.brands().length ? this.brandCursor() : null, !this.brands().length, this.auth.sessionRevision());
  }

  statusMessage(): string {
    if (!STOREFRONT_AUTH_ENABLED && this.auth.status() === 'unavailable') return 'Google sign-in is disabled pending Firebase Auth setup approval. No private product records were opened.';
    switch (this.access.status()) {
      case 'checking': return 'Checking administrator access…';
      case 'signed-out': return 'Sign in with an authorized Google account to view private product records.';
      case 'forbidden': return 'This account is not authorized to view administrator product records.';
      case 'unavailable': return 'Administrator access is unavailable. Retry when the service is reachable.';
      default: return '';
    }
  }
}
