import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { BomService } from '../core/bom.service';
import { CustomerAccessService } from '../core/customer-access.service';
import { AuthSessionService } from '../core/auth-session.service';
import { Brand } from './brand';
import { ThemeToggle } from './theme-toggle';

@Component({
  selector: 'app-shopping-shell',
  imports: [RouterLink, RouterLinkActive, RouterOutlet, Brand, ThemeToggle],
  template: `
    <div class="flex min-h-screen flex-col">
      <div class="border-b border-border bg-primary text-primary-foreground"><div class="page-width flex flex-wrap items-center justify-between gap-2 py-2 text-[11px]"><span>Dumaguete solar equipment supply</span><span class="flex items-center gap-1.5"><span class="size-1.5 rounded-full bg-secondary" aria-hidden="true"></span>Development store · availability unconfirmed</span></div></div>
      <header class="border-b border-border bg-background">
        <div class="page-width flex flex-wrap items-center justify-between gap-4 py-5">
          <a routerLink="/catalog" aria-label="Dumaget.me Solar home"><app-brand /></a>
          <div class="flex flex-wrap items-center gap-3"><app-theme-toggle /><a routerLink="/draft" class="kt-btn kt-btn-light"><i class="ki-outline ki-handcart text-lg" aria-hidden="true"></i>Cart<span class="kt-badge kt-badge-sm kt-badge-outline" aria-label="Planned units">{{ bom.count() }}</span></a>
            @if (auth.status() === 'signed-in') {
              <button type="button" class="kt-btn kt-btn-light max-w-40" [attr.title]="auth.displayName()" (click)="access.requestSignIn()"><span class="truncate">{{ auth.displayName() }}</span></button>
              <button type="button" class="kt-btn kt-btn-light focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary" [disabled]="auth.busy()" (click)="auth.signOut()">{{ auth.busy() ? 'Signing out…' : 'Sign out' }}</button>
            } @else if (auth.status() === 'initializing') {
              <button type="button" class="kt-btn kt-btn-light" disabled aria-disabled="true">Checking sign-in…</button>
            } @else {
              <button type="button" class="kt-btn kt-btn-light focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary" [disabled]="auth.busy()" (click)="access.requestSignIn()">{{ auth.busy() ? 'Opening Google sign-in…' : 'Sign in' }}</button>
            }
          </div>
          @if (auth.error()) { <p class="w-full text-xs text-muted-foreground" role="status">{{ auth.error() }}</p> }
        </div>
        <nav class="page-width flex flex-wrap gap-x-6 gap-y-2 text-sm" aria-label="Shopping navigation">
          @for (link of links; track link.path) {
            <a [routerLink]="link.path" class="border-b-2 border-transparent pb-3 text-muted-foreground hover:text-primary" routerLinkActive="!border-primary !text-primary font-semibold" ariaCurrentWhenActive="page">{{ link.label }}</a>
          }
        </nav>
      </header>
      <main id="main-content" tabindex="-1" class="page-width grow py-6 sm:py-8"><router-outlet /></main>
      <footer class="mt-6 border-t border-border bg-background"><div class="page-width flex flex-wrap items-center justify-between gap-4 py-6 text-xs text-muted-foreground"><span>Dumaget.me Solar Supply · Dumaguete, Negros Oriental</span><span>Browser-local preview · no orders placed</span></div></footer>
    </div>
  `,
})
export class ShoppingShell {
  readonly access = inject(CustomerAccessService);
  readonly auth = inject(AuthSessionService);
  readonly bom = inject(BomService);
  readonly links = [
    { label: 'Trade catalog', path: '/catalog' },
    { label: 'Cart', path: '/draft' },
    { label: 'My pages', path: '/my' },
  ];
}
