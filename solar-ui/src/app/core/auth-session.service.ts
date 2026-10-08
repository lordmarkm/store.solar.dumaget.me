import { computed, DestroyRef, inject, Injectable, InjectionToken, signal } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import type { CustomerSession } from './customer-access.service';

export type AuthStatus = 'initializing' | 'signed-out' | 'signed-in' | 'unavailable';
export interface AuthDriver {
  observe(next: (session: CustomerSession | null) => void, failure: () => void): () => void;
  signInGoogle(): Promise<void>;
  signOut(): Promise<void>;
  getIdToken?(customerId: string, forceRefresh?: boolean): Promise<string | null>;
}
/** The production app supplies Firebase; isolated component tests make no network calls. */
export const AUTH_DRIVER = new InjectionToken<AuthDriver | null>('Auth driver', { providedIn: 'root', factory: () => null });
export const SIGN_IN_RETURN_GRACE_MS = 8000;
export const SIGN_IN_MAX_WAIT_MS = 120000;

export function authErrorMessage(error: unknown): string {
  const code = (error as { code?: string } | null)?.code;
  switch (code) {
    case 'auth/popup-closed-by-user': return 'Sign-in was canceled. Your cart and pending request are unchanged.';
    case 'auth/sign-in-interrupted': return 'Sign-in did not finish. Click Sign in to try again. Your cart is unchanged.';
    case 'auth/sign-in-timeout': return 'Sign-in took too long. Click Sign in to try again. Your cart is unchanged.';
    case 'auth/cancelled-popup-request': return 'Another sign-in attempt is already open. Finish it or try again.';
    case 'auth/popup-blocked': return 'Your browser blocked the sign-in window. Allow popups for this site and try again.';
    case 'auth/unauthorized-domain': return 'Sign-in is not enabled for this website address yet.';
    case 'auth/operation-not-allowed':
    case 'auth/configuration-not-found': return 'Google sign-in is not enabled in the Firebase project yet.';
    case 'auth/network-request-failed': return 'Unable to reach sign-in. Check your connection and try again.';
    case 'auth/user-disabled': return 'This account is disabled. Contact support.';
    case 'auth/account-exists-with-different-credential': return 'This account uses another sign-in method. Contact support; accounts were not linked.';
    default: return 'Unable to complete sign-in. Please try again. Your cart is unchanged.';
  }
}

@Injectable({ providedIn: 'root' })
export class AuthSessionService {
  private readonly driver = inject(AUTH_DRIVER);
  private readonly window = inject(DOCUMENT).defaultView;
  private cancelPopupWait?: () => void;
  private readonly sessionState = signal<CustomerSession | null>(null);
  readonly session = this.sessionState.asReadonly();
  private readonly sessionRevisionState = signal(0);
  readonly sessionRevision = this.sessionRevisionState.asReadonly();
  private readonly signOutRevisionState = signal(0);
  readonly signOutRevision = this.signOutRevisionState.asReadonly();
  readonly signOutPending = signal(false);
  private pendingSignOut?: { operation: number; baseline: number; completed: boolean; observed: boolean };
  private readonly statusState = signal<AuthStatus>(this.driver ? 'initializing' : 'unavailable');
  readonly status = this.statusState.asReadonly();
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly displayName = computed(() => this.session()?.displayName?.trim() || 'Your account');
  private disposed = false;
  private operation = 0;
  constructor() {
    const destroy = inject(DestroyRef);
    destroy.onDestroy(() => {
      if (this.disposed) return;
      this.disposed = true; this.operation++; this.sessionRevisionState.update(value => value + 1);
      this.cancelPopupWait?.();
      this.pendingSignOut = undefined;
    });
    if (!this.driver) return;
    try {
      const unsubscribe = this.driver.observe(session => {
        if (this.disposed) return;
        this.sessionRevisionState.update(value => value + 1);
        this.sessionState.set(session);
        this.statusState.set(session ? 'signed-in' : 'signed-out');
        if (this.pendingSignOut) {
          if (session) { this.pendingSignOut = undefined; this.signOutPending.set(false); }
          else { this.pendingSignOut.observed = true; this.completeSignOut(); }
        }
      }, () => {
        if (this.disposed) return;
        this.sessionRevisionState.update(value => value + 1);
        this.sessionState.set(null); this.statusState.set('unavailable');
        this.pendingSignOut = undefined; this.signOutPending.set(false);
        this.error.set('Unable to restore your sign-in session. No private project data was opened.');
      });
      destroy.onDestroy(unsubscribe);
    } catch {
      this.sessionRevisionState.update(value => value + 1);
      this.statusState.set('unavailable'); this.error.set('Unable to initialize sign-in. Please reload and try again.');
    }
  }
  async idToken(forceRefresh = false): Promise<string | null> {
    const session = this.session();
    const revision = this.sessionRevision();
    const customerId = session?.customerId;
    if (this.disposed || !this.driver?.getIdToken || this.busy() || this.status() !== 'signed-in'
      || session?.source !== 'firebase' || typeof customerId !== 'string' || customerId.length === 0) return null;
    const unchanged = () => !this.disposed && !this.busy() && this.status() === 'signed-in'
      && this.sessionRevision() === revision && this.session()?.source === 'firebase'
      && this.session()?.customerId === customerId;
    if (!unchanged()) return null;
    try {
      const token = await this.driver.getIdToken(customerId, forceRefresh);
      return unchanged() && typeof token === 'string' && token.length > 0 ? token : null;
    } catch {
      return null;
    }
  }
  async signInGoogle(): Promise<void> {
    if (!this.driver || this.busy() || this.status() !== 'signed-out') return;
    this.busy.set(true); this.error.set(null);
    const operation = ++this.operation;
    try { await this.popupWithRecovery(); }
    catch (error) { if (!this.disposed && operation === this.operation) this.error.set(authErrorMessage(error)); }
    finally { if (!this.disposed && operation === this.operation) this.busy.set(false); }
  }
  /** Cancels only our UI wait; Firebase remains authoritative for the session. */
  cancelSignIn(): void { this.cancelPopupWait?.(); }

  private popupWithRecovery(): Promise<void> {
    return new Promise((resolve, reject) => {
      let settled = false;
      let leftPage = false;
      let returnTimer: ReturnType<typeof setTimeout> | undefined;
      const baseline = this.sessionRevision();
      const finish = (error?: unknown) => {
        if (settled) return;
        settled = true;
        clearTimeout(deadline);
        clearTimeout(returnTimer);
        this.window?.removeEventListener('blur', onBlur);
        this.window?.removeEventListener('focus', onFocus);
        if (this.cancelPopupWait === cancel) this.cancelPopupWait = undefined;
        error ? reject(error) : resolve();
      };
      const cancel = () => finish({ code: 'auth/sign-in-interrupted' });
      const onBlur = () => { leftPage = true; clearTimeout(returnTimer); };
      const onFocus = () => {
        if (!leftPage || settled) return;
        clearTimeout(returnTimer);
        // Focus is not proof that a popup closed. Allow Firebase's documented
        // local SDK close-event grace; recover only an unconfirmed UI wait.
        returnTimer = setTimeout(() => {
          if (this.status() !== 'signed-in' || this.sessionRevision() <= baseline) cancel();
        }, SIGN_IN_RETURN_GRACE_MS);
      };
      const deadline = setTimeout(() => finish({ code: 'auth/sign-in-timeout' }), SIGN_IN_MAX_WAIT_MS);
      this.cancelPopupWait = cancel;
      this.window?.addEventListener('blur', onBlur);
      this.window?.addEventListener('focus', onFocus);
      try { this.driver!.signInGoogle().then(() => finish(), error => finish(error)); }
      catch (error) { finish(error); }
    });
  }
  async signOut(): Promise<void> {
    if (!this.driver || this.busy() || !this.session()) return;
    this.busy.set(true); this.error.set(null);
    const operation = ++this.operation;
    this.pendingSignOut = { operation, baseline: this.sessionRevision(), completed: false, observed: false };
    this.signOutPending.set(true);
    try {
      await this.driver.signOut();
      if (!this.disposed && this.pendingSignOut?.operation === operation) {
        this.pendingSignOut.completed = true;
        this.completeSignOut();
      }
    }
    catch {
      if (!this.disposed && operation === this.operation) {
        this.pendingSignOut = undefined; this.signOutPending.set(false);
        this.error.set('Unable to sign out. Please try again; your session may still be active.');
      }
    }
    finally { if (!this.disposed && operation === this.operation) this.busy.set(false); }
  }

  private completeSignOut(): void {
    const pending = this.pendingSignOut;
    if (!pending || this.disposed || pending.operation !== this.operation || !pending.completed || !pending.observed
      || this.status() !== 'signed-out' || this.session() !== null || this.sessionRevision() <= pending.baseline) return;
    this.pendingSignOut = undefined;
    this.signOutPending.set(false);
    this.signOutRevisionState.update(value => value + 1);
  }
}
