import { Component, computed, DestroyRef, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AdminAccessService } from '../../core/admin-access.service';
import { AdminCatalogApiService } from '../../core/admin-catalog-api.service';
import type { AdminPage, AdminSupplier } from '../../core/admin-catalog.models';
import { AuthSessionService } from '../../core/auth-session.service';
import { AuthNavigationService } from '../../core/auth-navigation.service';
import { STOREFRONT_AUTH_ENABLED } from '../../core/firebase-config';
import { StoreApiError } from '../../core/store-api.service';

@Component({
  selector: 'app-admin-suppliers',
  imports: [FormsModule, RouterLink],
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
  readonly error = signal<string | null>(null);
  readonly search = signal('');
  readonly filtered = computed(() => {
    const query = this.search().trim().toLocaleLowerCase();
    return this.rows().filter(supplier => !query ||
      `${supplier.name} ${supplier.region} ${supplier.email} ${supplier.phone} ${supplier.website} ${supplier.description}`.toLocaleLowerCase().includes(query));
  });
  private fetchSequence = 0;
  private seenRevision = -1;
  private wasAuthorized = false;

  constructor() {
    this.destroyRef.onDestroy(() => { this.fetchSequence++; });
    effect(() => {
      const revision = this.auth.sessionRevision();
      const authorized = this.access.authorized();
      if (!authorized) {
        this.fetchSequence++;
        this.rows.set([]); this.cursor.set(null); this.error.set(null); this.loading.set(false);
        this.search.set(''); this.wasAuthorized = false; this.seenRevision = revision; this.authorizedRevision.set(-1);
        return;
      }
      this.authorizedRevision.set(revision);
      if (!this.wasAuthorized || revision !== this.seenRevision) {
        this.wasAuthorized = true; this.seenRevision = revision;
        this.rows.set([]); this.cursor.set(null); this.search.set('');
        void this.load(null, true, revision);
      }
    });
  }

  async loadMore(): Promise<void> {
    const next = this.cursor();
    if (next) await this.load(next, false, this.auth.sessionRevision());
  }

  retry(): void {
    if (!this.canAccess() || this.loading()) return;
    void this.load(this.rows().length ? this.cursor() : null, !this.rows().length, this.auth.sessionRevision());
  }

  private async load(cursor: string | null, replace: boolean, revision: number): Promise<void> {
    if (!this.canAccess() || revision !== this.auth.sessionRevision() || this.loading()) return;
    const sequence = ++this.fetchSequence;
    this.loading.set(true); this.error.set(null);
    try {
      const page: AdminPage<AdminSupplier> = await this.api.listSuppliers(cursor);
      if (sequence !== this.fetchSequence || !this.canAccess() || revision !== this.auth.sessionRevision()) return;
      this.rows.set(replace ? page.items : [...this.rows(), ...page.items]);
      this.cursor.set(page.nextCursor);
    } catch (error) {
      if (sequence === this.fetchSequence && this.canAccess() && revision === this.auth.sessionRevision()) {
        this.error.set(error instanceof StoreApiError ? error.message : 'Unable to load suppliers. Try again.');
      }
    } finally { if (sequence === this.fetchSequence) this.loading.set(false); }
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
