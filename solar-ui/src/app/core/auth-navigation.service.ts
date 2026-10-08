import { DestroyRef, effect, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationStart, Router } from '@angular/router';
import { AdminAccessService } from './admin-access.service';
import { AuthSessionService } from './auth-session.service';

interface LoginRequest {
  id: number; baseline: number; completed: boolean;
  uid: string | null; revision: number | null;
}

/** A user-initiated popup, followed by server-confirmed admin navigation only. */
@Injectable({ providedIn: 'root' })
export class AuthNavigationService {
  private readonly auth = inject(AuthSessionService);
  private readonly admin = inject(AdminAccessService);
  private readonly router = inject(Router);
  private readonly request = signal<LoginRequest | null>(null);
  private sequence = 0;
  private disposed = false;
  private seenSignOut = this.auth.signOutRevision();

  constructor() {
    inject(DestroyRef).onDestroy(() => { this.disposed = true; this.request.set(null); });
    this.router.events.pipe(takeUntilDestroyed()).subscribe(event => {
      // Never let a delayed login/API response hijack navigation or an editor.
      if (event instanceof NavigationStart) this.request.set(null);
    });
    effect(() => {
      const revision = this.auth.signOutRevision();
      if (revision === this.seenSignOut) return;
      this.seenSignOut = revision;
      this.request.set(null);
      if (this.auth.status() === 'signed-out' && this.auth.session() === null) {
        void this.router.navigateByUrl('/goodbye', { replaceUrl: true }).catch(() => false);
      }
    });
    effect(() => {
      const request = this.request();
      if (!request) return;
      const session = this.auth.session();
      const revision = this.auth.sessionRevision();
      const status = this.auth.status();
      if (status === 'unavailable' || (request.uid !== null &&
        (status !== 'signed-in' || session?.customerId !== request.uid || revision !== request.revision))) {
        this.request.set(null);
        return;
      }
      if (status !== 'signed-in' || session?.source !== 'firebase' || revision <= request.baseline) return;
      if (request.uid === null) {
        this.request.set({ ...request, uid: session.customerId, revision });
        return;
      }
      if (!request.completed || this.auth.busy()) return;
      if (this.admin.authorized()) {
        this.request.set(null);
        void this.router.navigateByUrl('/admin').catch(() => false);
      } else if (this.admin.status() === 'forbidden' || this.admin.status() === 'unavailable') {
        this.request.set(null);
      }
    });
  }

  async signInGoogle(): Promise<void> {
    if (this.disposed || this.request() || this.auth.busy() || this.auth.status() !== 'signed-out') return;
    const id = ++this.sequence;
    this.request.set({ id, baseline: this.auth.sessionRevision(), completed: false, uid: null, revision: null });
    // No lazy import, dialog, timer or awaited preparation before the popup call.
    await this.auth.signInGoogle();
    const request = this.request();
    if (this.disposed || request?.id !== id) return;
    this.request.set(this.auth.error() ? null : { ...request, completed: true });
  }
}
