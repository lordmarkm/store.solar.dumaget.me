import { Dialog, DialogRef } from '@angular/cdk/dialog';
import { computed, effect, inject, Injectable, InjectionToken, Signal, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationStart, Router } from '@angular/router';
import { PendingProduct, resolveProduct } from './project-bom';
import { PendingGuestList } from './guest-lists';
import { isPlanningQuantity } from './models';
import { LOCAL_CUSTOMER_ID } from './project.service';
import { AuthSessionService } from './auth-session.service';
import { AuthNavigationService } from './auth-navigation.service';
import { PLANNING_PRODUCTS } from './product-source';

export interface CustomerSession { readonly customerId: string; readonly displayName?: string | null; readonly source?: 'firebase'; }
/** Production supplies the Firebase-owned session; tests default to signed-out without network. */
export const CUSTOMER_SESSION = new InjectionToken<Signal<CustomerSession | null>>('Customer session', {
  providedIn: 'root', factory: () => signal<CustomerSession | null>(null).asReadonly(),
});
export type PendingCustomerAction =
  | { kind: 'route'; returnUrl: string }
  | { kind: 'product'; returnUrl: string; pending: PendingProduct }
  | { kind: 'guest-list'; returnUrl: string; guest: PendingGuestList };
export const PENDING_CUSTOMER_ACTION_KEY = 'solar.sign-in.pending.v1';
const MAX_AGE = 24 * 60 * 60 * 1000;
/** Only implemented public/customer routes; never an external URL or encoded redirect. */
export function safeCustomerReturnUrl(value: unknown): string {
  if (typeof value !== 'string' || value.length > 2048 || /[%\\\s]/.test(value)) return '/catalog';
  return /^\/(?:catalog|draft|my(?:\/(?:projects(?:\/[a-zA-Z0-9_-]+(?:\/bom)?)?|favorites|profile|settings))?)(?:[?#][a-zA-Z0-9_=&.#/-]*)?$/.test(value) ? value : '/catalog';
}
function validAction(value: unknown): value is PendingCustomerAction {
  if (!value || typeof value !== 'object') return false;
  const a = value as Record<string, unknown>;
  if (safeCustomerReturnUrl(a['returnUrl']) !== a['returnUrl']) return false;
  if (a['kind'] === 'route') return true;
  if (a['kind'] === 'guest-list') {
    const g = a['guest'] as PendingGuestList | undefined;
    return !!g && typeof g.listId === 'string' && g.listId.length > 0 && g.listId.length <= 256 && typeof g.fingerprint === 'string' && g.fingerprint.length <= 100000;
  }
  if (a['kind'] !== 'product') return false;
  const p = a['pending'] as PendingProduct | undefined;
  return !!p && isPlanningQuantity(p.quantity) && !!p.product &&
    typeof p.product.productId === 'string' && p.product.productId.length > 0 && p.product.productId.length <= 256 &&
    typeof p.product.unitCode === 'string' && p.product.unitCode.length > 0 && p.product.unitCode.length <= 64 &&
    (p.product.variantId === null || typeof p.product.variantId === 'string' && p.product.variantId.length <= 256);
}

@Injectable({ providedIn: 'root' })
export class CustomerAccessService {
  private readonly products = inject(PLANNING_PRODUCTS);
  private readonly session = inject(CUSTOMER_SESSION);
  private readonly dialog = inject(Dialog);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthSessionService);
  private readonly login = inject(AuthNavigationService);
  readonly signedIn = computed(() => this.session() !== null);
  readonly customerId = computed(() => this.session()?.customerId ?? null);
  /** Captured by UI operations so a true-to-true UID switch still revokes old results. */
  readonly projectSessionKey = computed(() => JSON.stringify([
    this.session()?.source ?? 'preview', this.customerId(),
    this.session()?.source === 'firebase' ? this.auth.sessionRevision() : null,
  ]));
  readonly projectAccessHint = computed(() => !this.signedIn() ? 'Sign in to add to project'
    : this.canAccessProjects() ? 'Add to project'
    : this.auth.status() === 'initializing' ? 'Checking sign-in…'
    : this.auth.busy() ? 'Finish the current account action before editing projects.'
    : 'Project access is unavailable. Review your account and retry.');
  readonly accountActionLabel = computed(() => this.signedIn() ? 'Review account' : 'Sign in');
  readonly canAccessProjects = computed(() => {
    const session = this.session();
    if (session?.source !== 'firebase') return session?.customerId === LOCAL_CUSTOMER_ID;
    return this.auth.status() === 'signed-in' && !this.auth.busy()
      && this.auth.session()?.source === 'firebase' && this.auth.session()?.customerId === session.customerId
      && typeof session.customerId === 'string' && session.customerId.length > 0;
  });
  private readonly pendingState = signal<PendingCustomerAction | null>(this.restore());
  readonly pending = this.pendingState.asReadonly();
  readonly retentionWarning = signal<string | null>(null);
  private signInRef?: DialogRef<void>;
  private opening = false;
  constructor() {
    let owner = this.projectSessionKey();
    effect(() => {
      const next = this.projectSessionKey();
      if (next !== owner) { owner = next; this.signInRef?.close(); }
    });
    this.router.events.pipe(takeUntilDestroyed()).subscribe(event => {
      if (event instanceof NavigationStart) this.signInRef?.close();
    });
  }
  retain(action: PendingCustomerAction): void {
    if (!validAction(action)) return;
    const clean: PendingCustomerAction = action.kind === 'product'
      ? { kind: 'product', returnUrl: action.returnUrl, pending: { quantity: action.pending.quantity, product: { productId: action.pending.product.productId, variantId: action.pending.product.variantId, unitCode: action.pending.product.unitCode } } }
      : action.kind === 'guest-list' ? { kind: 'guest-list', returnUrl: action.returnUrl, guest: { listId: action.guest.listId, fingerprint: action.guest.fingerprint } }
      : { kind: 'route', returnUrl: action.returnUrl };
    this.pendingState.set(clean);
    this.retentionWarning.set(null);
    try { sessionStorage.setItem(PENDING_CUSTOMER_ACTION_KEY, JSON.stringify({ version: 1, savedAt: Date.now(), action: clean })); }
    catch { this.retentionWarning.set('The request is kept for this visit only. Your cart is unchanged.'); }
  }
  async requestSignIn(action?: PendingCustomerAction): Promise<void> {
    if (this.signInRef || this.opening) return;
    const originalUrl = this.router.url;
    const owner = this.projectSessionKey();
    // A retry keeps the original intent (including its retention age) unchanged.
    if (action) this.retain(action);
    else if (!this.pending()) this.retain({ kind: 'route', returnUrl: safeCustomerReturnUrl(originalUrl) });
    if (this.auth.status() === 'signed-out') {
      await this.login.signInGoogle();
      return;
    }
    // Keep account review/unavailable explanations; they are not login gates.
    if (this.auth.status() === 'initializing' || this.auth.busy()) return;
    this.opening = true;
    try {
      const { SignInDialog } = await import('../shared/sign-in-dialog');
      if (this.router.url !== originalUrl || this.projectSessionKey() !== owner) return;
      const pending = this.pending();
      const ref = this.dialog.open<void>(SignInDialog, {
        data: { context: 'Sign in before creating projects or adding equipment to a project.', pendingLabel: pending?.kind === 'product' ? `${pending.pending.quantity} × ${resolveProduct(pending.pending.product, this.products())?.name ?? pending.pending.product.productId}. Kept for later review; nothing added.` : pending?.kind === 'guest-list' ? 'Your cart request is kept for later review. Nothing copied.' : '', warning: this.retentionWarning() },
        width: '520px', maxWidth: 'calc(100vw - 32px)', ariaLabelledBy: 'sign-in-title',
        panelClass: 'solar-dialog-panel', backdropClass: 'solar-dialog-backdrop',
      });
      this.signInRef = ref;
      ref.closed.subscribe(() => { if (this.signInRef === ref) this.signInRef = undefined; });
    } catch { this.retentionWarning.set('Unable to open sign-in. Continue browsing and try again.'); }
    finally { this.opening = false; }
  }
  private restore(): PendingCustomerAction | null {
    try {
      const raw = sessionStorage.getItem(PENDING_CUSTOMER_ACTION_KEY);
      if (!raw || raw.length > 105000) return null;
      const stored = JSON.parse(raw);
      if (stored.version !== 1 || !Number.isFinite(stored.savedAt) || stored.savedAt > Date.now() || Date.now() - stored.savedAt > MAX_AGE || !validAction(stored.action)) return null;
      return stored.action;
    } catch { return null; }
  }
}
