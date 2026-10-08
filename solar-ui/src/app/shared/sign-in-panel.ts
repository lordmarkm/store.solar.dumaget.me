import { Component, inject, input } from '@angular/core';
import { AuthSessionService } from '../core/auth-session.service';
import { AuthNavigationService } from '../core/auth-navigation.service';
import { RouterLink } from '@angular/router';
import { CustomerAccessService } from '../core/customer-access.service';

@Component({
  selector: 'app-sign-in-panel',
  standalone: true,
  imports: [RouterLink],
  template: `
    <section class="bg-card text-card-foreground" aria-labelledby="sign-in-title">
      <div class="p-5 sm:p-6">
        <div class="mb-4 flex items-start gap-3">
          <span class="flex size-10 shrink-0 items-center justify-center border border-border bg-muted text-primary" aria-hidden="true">
            <i class="ki-outline ki-clipboard text-xl" aria-hidden="true"></i>
          </span>
          <div class="min-w-0">
            <p class="eyebrow mb-1">Account access</p>
            <h2 id="sign-in-title" class="text-xl font-semibold tracking-tight">{{ auth.session() ? 'Your account' : 'Sign in to continue' }}</h2>
          </div>
        </div>

        <p class="mb-4 text-sm leading-6 text-secondary-foreground">{{ context() }}</p>

        @if (auth.status() === 'initializing') {
          <p class="public-panel border border-border bg-muted/40 p-4 text-sm text-secondary-foreground" role="status">Checking sign-in…</p>
        } @else if (auth.status() === 'signed-in') {
          <div class="public-panel border border-border bg-muted/40 p-4">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <div class="flex min-w-0 items-center gap-2">
                <span class="kt-badge kt-badge-outline shrink-0">Signed in</span>
                <p class="truncate text-sm font-semibold" [attr.title]="auth.displayName()">{{ auth.displayName() }}</p>
              </div>
              <button type="button" class="kt-btn kt-btn-light shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary" [disabled]="auth.busy()" (click)="auth.signOut()">{{ auth.busy() ? 'Signing out…' : 'Sign out' }}</button>
            </div>
            <p class="mt-3 text-xs leading-5 text-secondary-foreground">Account projects and BOMs are saved to your signed-in account. Old browser-local previews are not assigned to this account or imported automatically. Cart copying requires your explicit review.</p>
            @if (access.canAccessProjects()) { <a routerLink="/my/projects" class="kt-btn kt-btn-light mt-4">Open My projects</a> }
          </div>
        } @else {
          <div class="public-panel border border-border bg-muted/40 p-4">
            @if (auth.status() === 'unavailable') {
              <div class="mb-3 flex items-start gap-2">
                <span class="kt-badge kt-badge-outline shrink-0">Unavailable</span>
                <p class="text-sm font-medium">Google sign-in is unavailable right now.</p>
              </div>
            }
            <button type="button" class="kt-btn kt-btn-primary w-full justify-center focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary" [disabled]="auth.status() !== 'signed-out' || auth.busy()" (click)="login.signInGoogle()">
              {{ auth.busy() ? 'Opening Google sign-in…' : 'Continue with Google' }}
            </button>
            @if (auth.busy()) { <p class="sr-only" role="status" aria-live="polite">Opening Google sign-in…</p> }
            @if (auth.status() === 'unavailable') {
              <p class="mt-3 text-xs leading-5 text-secondary-foreground">Google sign-in setup is not complete yet. You can keep browsing and editing your cart.</p>
            }
          </div>
        }
        @if (auth.error()) {
          <p class="mt-3 text-sm leading-5 text-secondary-foreground" role="status" aria-live="polite">{{ auth.error() }}</p>
        }

        @if (pendingLabel()) {
          <div class="mt-4 border-s-2 border-primary ps-3" aria-label="Retained request">
            <p class="public-label text-[11px] text-secondary-foreground">Request to continue</p>
            <p class="mt-1 break-words text-sm font-medium">{{ pendingLabel() }}</p>
          </div>
        }
      </div>
    </section>
  `,
})
export class SignInPanel {
  readonly auth = inject(AuthSessionService);
  readonly login = inject(AuthNavigationService);
  readonly access = inject(CustomerAccessService);
  readonly context = input('Sign in to access your projects.');
  readonly pendingLabel = input('');
}
