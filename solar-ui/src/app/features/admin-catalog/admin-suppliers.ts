import { Component, computed, DestroyRef, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NavigationStart, Router, RouterLink } from '@angular/router';
import { AdminAccessService } from '../../core/admin-access.service';
import { AdminCatalogApiService } from '../../core/admin-catalog-api.service';
import type { AdminPage, AdminSupplier, SupplierListFilters } from '../../core/admin-catalog.models';
import { AuthSessionService } from '../../core/auth-session.service';
import { AuthNavigationService } from '../../core/auth-navigation.service';
import { STOREFRONT_AUTH_ENABLED } from '../../core/firebase-config';
import { StoreApiError } from '../../core/store-api.service';
import { Tooltip } from '../../shared/tooltip';

@Component({
  selector: 'app-admin-suppliers',
  imports: [FormsModule, RouterLink, Tooltip],
  templateUrl: './admin-suppliers.html',
})
export class AdminSuppliersPage {
  readonly access = inject(AdminAccessService);
  readonly auth = inject(AuthSessionService);
  readonly login = inject(AuthNavigationService);
  readonly authorizedRevision = signal(-1);
  readonly canAccess = computed(() => this.access.authorized() && this.auth.sessionRevision() === this.authorizedRevision());
  private readonly api = inject(AdminCatalogApiService);
  private readonly destroyRef = inject(DestroyRef);
  readonly rows = signal<AdminSupplier[]>([]);
  readonly cursor = signal<string | null>(null);
  readonly loading = signal(false);
  readonly searchPending = signal(false);
  readonly error = signal<string | null>(null);
  readonly namePrefix = signal('');
  readonly status = signal<'' | 'active' | 'inactive'>('');
  private fetchSequence = 0;
  private queryGeneration = 0;
  private seenRevision = -1;
  private wasAuthorized = false;
  private destroyed = false;
  private routeGeneration = 0;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly router = inject(Router);

  constructor() {
    const routeSubscription = this.router.events.subscribe(event => {
      if (event instanceof NavigationStart && event.url.split(/[?#]/, 1)[0] !== '/admin/suppliers') {
        this.routeGeneration++;
        this.queryGeneration++; this.fetchSequence++;
        this.cancelSearchDebounce();
        this.loading.set(false);
      }
    });
    this.destroyRef.onDestroy(() => {
      this.destroyed = true;
      this.queryGeneration++; this.fetchSequence++;
      this.cancelSearchDebounce(); routeSubscription.unsubscribe();
    });
    effect(() => {
      const revision = this.auth.sessionRevision();
      const authorized = this.access.authorized();
      if (!authorized) {
        this.queryGeneration++; this.fetchSequence++;
        this.cancelSearchDebounce();
        this.rows.set([]); this.cursor.set(null); this.error.set(null); this.loading.set(false);
        this.namePrefix.set(''); this.status.set(''); this.wasAuthorized = false; this.seenRevision = revision; this.authorizedRevision.set(-1);
        return;
      }
      this.authorizedRevision.set(revision);
      if (!this.wasAuthorized || revision !== this.seenRevision) {
        this.wasAuthorized = true; this.seenRevision = revision;
        this.cancelSearchDebounce();
        this.queryGeneration++; this.fetchSequence++;
        this.rows.set([]); this.cursor.set(null); this.error.set(null); this.loading.set(false);
        this.namePrefix.set(''); this.status.set('');
        void this.load(null, true, revision);
      }
    });
  }

  async loadMore(): Promise<void> {
    const next = this.cursor();
    if (next) await this.load(next, false, this.auth.sessionRevision());
  }

  setNamePrefix(value: string): void {
    this.cancelSearchDebounce();
    this.namePrefix.set(value.slice(0, 160));
    const generation = this.resetSupplierQuery();
    if (!this.canAccess()) return;
    this.searchPending.set(true);
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      this.searchPending.set(false);
      if (generation === this.queryGeneration) void this.load(null, true, this.auth.sessionRevision());
    }, 300);
  }

  setStatus(value: '' | 'active' | 'inactive'): void {
    this.status.set(value);
    this.cancelSearchDebounce();
    this.resetSupplierQuery();
    if (this.canAccess()) void this.load(null, true, this.auth.sessionRevision());
  }

  clearFilters(): void {
    this.cancelSearchDebounce();
    this.namePrefix.set(''); this.status.set('');
    this.resetSupplierQuery();
    if (this.canAccess()) void this.load(null, true, this.auth.sessionRevision());
  }

  supplierFilters(): SupplierListFilters {
    const filters: SupplierListFilters = {};
    const namePrefix = this.namePrefix().trim();
    if (namePrefix) filters.namePrefix = namePrefix;
    const status = this.status();
    if (status) filters.status = status;
    return filters;
  }

  private resetSupplierQuery(): number {
    this.queryGeneration++; this.fetchSequence++;
    this.rows.set([]); this.cursor.set(null); this.error.set(null); this.loading.set(false);
    return this.queryGeneration;
  }

  private cancelSearchDebounce(): void {
    if (this.debounceTimer !== null) clearTimeout(this.debounceTimer);
    this.debounceTimer = null;
    this.searchPending.set(false);
  }

  retry(): void {
    if (!this.canAccess() || this.loading()) return;
    void this.load(this.rows().length ? this.cursor() : null, !this.rows().length, this.auth.sessionRevision());
  }

  private async load(cursor: string | null, replace: boolean, revision: number): Promise<void> {
    if (!this.canAccess() || revision !== this.auth.sessionRevision() || this.destroyed || this.loading()) return;
    const sequence = ++this.fetchSequence;
    const generation = this.queryGeneration;
    const routeGeneration = this.routeGeneration;
    const filters = this.supplierFilters();
    this.loading.set(true); this.error.set(null);
    try {
      const page: AdminPage<AdminSupplier> = await this.api.listSuppliers(cursor, filters);
      if (!this.isCurrentRequest(sequence, generation, routeGeneration, revision)) return;
      this.rows.set(replace ? page.items : [...this.rows(), ...page.items]);
      this.cursor.set(page.nextCursor);
    } catch (error) {
      if (this.isCurrentRequest(sequence, generation, routeGeneration, revision)) {
        this.error.set(error instanceof StoreApiError ? error.message : 'Unable to load suppliers. Try again.');
      }
    } finally { if (this.isCurrentRequest(sequence, generation, routeGeneration, revision)) this.loading.set(false); }
  }

  private isCurrentRequest(sequence: number, generation: number, routeGeneration: number, revision: number): boolean {
    return !this.destroyed && sequence === this.fetchSequence && generation === this.queryGeneration
      && routeGeneration === this.routeGeneration && this.canAccess() && revision === this.auth.sessionRevision();
  }

  statusMessage(): string {
    if (!STOREFRONT_AUTH_ENABLED && this.auth.status() === 'unavailable') return 'Google sign-in is disabled pending Firebase Auth setup approval. No private supplier records were opened.';
    switch (this.access.status()) {
      case 'checking': return 'Checking administrator access…';
      case 'signed-out': return 'Sign in with an authorized Google account to view private supplier records.';
      case 'forbidden': return 'This account is not authorized to view administrator supplier records.';
      case 'unavailable': return 'Administrator access is unavailable. Retry when the service is reachable.';
      default: return '';
    }
  }
}
