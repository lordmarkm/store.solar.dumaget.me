import { computed, DestroyRef, effect, inject, Injectable, signal } from '@angular/core';
import { AuthSessionService } from './auth-session.service';
import { StoreApiError, StoreApiService } from './store-api.service';

export type AdminAccessStatus = 'signed-out' | 'checking' | 'authorized' | 'forbidden' | 'unavailable';

@Injectable({ providedIn: 'root' })
export class AdminAccessService {
  private readonly auth = inject(AuthSessionService);
  private readonly api = inject(StoreApiService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly retryRevision = signal(0);
  private readonly authorizedRevision = signal<number | null>(null);
  private operation = 0;
  private disposed = false;

  readonly status = signal<AdminAccessStatus>('checking');
  readonly identity = signal<Awaited<ReturnType<StoreApiService['me']>> | null>(null);
  readonly apiError = signal<StoreApiError | null>(null);
  readonly authorized = computed(() => {
    const acceptedRevision = this.authorizedRevision();
    const identity = this.identity();
    const session = this.auth.session();
    return acceptedRevision !== null && identity?.adminAuthorized === true
      && this.auth.status() === 'signed-in' && !this.auth.busy()
      && session?.source === 'firebase' && session.customerId === identity.uid
      && this.auth.sessionRevision() === acceptedRevision;
  });

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.disposed = true;
      this.operation++;
      this.authorizedRevision.set(null);
      this.identity.set(null);
    });
    effect(() => {
      const authStatus = this.auth.status();
      const session = this.auth.session();
      const revision = this.auth.sessionRevision();
      const busy = this.auth.busy();
      this.retryRevision();
      const operation = ++this.operation;
      this.authorizedRevision.set(null);

      if (authStatus === 'signed-out') {
        this.identity.set(null);
        this.apiError.set(null);
        this.status.set('signed-out');
        return;
      }
      if (authStatus !== 'signed-in' || busy || session?.source !== 'firebase'
        || typeof session.customerId !== 'string' || session.customerId.length === 0) {
        this.identity.set(null);
        this.apiError.set(null);
        this.status.set(authStatus === 'signed-in' || authStatus === 'initializing' ? 'checking' : 'unavailable');
        return;
      }

      const customerId = session.customerId;
      this.identity.set(null);
      this.apiError.set(null);
      this.status.set('checking');
      void this.api.me().then(identity => {
        if (!this.isCurrent(operation, revision, customerId)) return;
        this.identity.set(identity);
        if (identity.adminAuthorized) this.authorizedRevision.set(revision);
        this.status.set(identity.adminAuthorized ? 'authorized' : 'forbidden');
      }).catch(error => {
        if (!this.isCurrent(operation, revision, customerId)) return;
        const safeError = error instanceof StoreApiError ? error : new StoreApiError('unavailable');
        this.identity.set(null);
        this.apiError.set(safeError);
        this.status.set(safeError.code === 'forbidden' ? 'forbidden' : 'unavailable');
      });
    });
  }

  retry(): void {
    this.authorizedRevision.set(null);
    this.retryRevision.update(value => value + 1);
  }

  private isCurrent(operation: number, revision: number, customerId: string): boolean {
    const session = this.auth.session();
    return !this.disposed && operation === this.operation && this.auth.status() === 'signed-in' && !this.auth.busy()
      && this.auth.sessionRevision() === revision && session?.source === 'firebase' && session.customerId === customerId;
  }
}
