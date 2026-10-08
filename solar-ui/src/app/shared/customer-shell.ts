import { Dialog, DialogModule, DialogRef } from '@angular/cdk/dialog';
import { Overlay } from '@angular/cdk/overlay';
import { NgTemplateOutlet } from '@angular/common';
import { Component, effect, inject, OnDestroy, signal, TemplateRef, ViewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { ProjectService } from '../core/project.service';
import { CustomerAccessService, safeCustomerReturnUrl } from '../core/customer-access.service';
import { AuthSessionService } from '../core/auth-session.service';
import { Brand } from './brand';
import { ThemeToggle } from './theme-toggle';

@Component({
  selector: 'app-customer-shell',
  imports: [RouterLink, RouterLinkActive, RouterOutlet, Brand, ThemeToggle, NgTemplateOutlet, DialogModule],
  template: `
    @if (access.canAccessProjects() || auth.signOutPending()) {
    <div class="min-h-screen">
      <header class="border-b border-border bg-background"><div class="page-width flex flex-wrap items-center justify-between gap-3 py-4">
        <div class="flex items-center gap-3"><button type="button" class="kt-btn kt-btn-sm kt-btn-light lg:hidden" (click)="openMenu()" aria-label="Open My pages navigation" title="Open My pages navigation" [attr.aria-expanded]="menuOpen()"><i class="ki-outline ki-down" aria-hidden="true"></i>Menu</button><a routerLink="/catalog" aria-label="Dumaget.me Solar home"><app-brand /></a></div>
        <div class="flex flex-wrap items-center gap-3"><app-theme-toggle /><a routerLink="/catalog" class="kt-btn kt-btn-sm kt-btn-light"><i class="ki-outline ki-arrow-right" aria-hidden="true"></i>Continue shopping</a>@if (auth.session()?.source === 'firebase') { <button type="button" class="kt-btn kt-btn-sm kt-btn-light" [disabled]="auth.busy() || auth.signOutPending()" (click)="auth.signOut()">{{ auth.signOutPending() ? 'Signing out…' : 'Sign out' }}</button> }@if (auth.signOutPending()) { <p class="text-sm" role="status">Signing out…</p> }</div>
      </div></header>
      @if (auth.error()) { <p class="page-width py-3 text-sm text-danger" role="alert">{{ auth.error() }}</p> }
      @if (access.canAccessProjects()) {
      <div class="page-width grid min-w-0 gap-6 py-6 sm:py-8 lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside class="hidden self-start lg:block" aria-label="Customer navigation"><div class="kt-card p-4"><ng-container [ngTemplateOutlet]="navigation" /><p class="mt-6 border-t border-border pt-4 text-xs leading-5 text-muted-foreground">{{ service.accountBacked() ? 'Projects and BOMs are saved to your account. Browser-local previews are not imported.' : 'Browser-local prototype. Projects are saved only here and are not synced to an account.' }}</p></div></aside>
        <main id="main-content" tabindex="-1" class="min-w-0"><router-outlet /></main>
      </div>
      }
    </div>
    }
    <ng-template #navigation>
      <p class="eyebrow mb-4 px-3">My pages</p>
      <nav class="flex flex-col gap-2" aria-label="My pages navigation">
        @for (link of links; track link.path) {
          <a [routerLink]="link.path" (click)="closeMenu()" class="public-panel flex min-h-11 items-center gap-3 border border-transparent px-3 py-3 text-sm text-muted-foreground hover:bg-muted hover:text-foreground" routerLinkActive="!border-primary !bg-primary !text-primary-foreground font-semibold" ariaCurrentWhenActive="page"><i [class]="'ki-outline ' + link.icon" aria-hidden="true"></i>{{ link.label }}</a>
        }
      </nav>
      <div class="public-panel mt-5 border border-border bg-muted/40 p-3"><p class="public-label text-xs text-muted-foreground">{{ service.accountBacked() ? 'Active account project' : 'Active local project' }}</p>@if (activeProject(); as project) { <a [routerLink]="['/my/projects', project.id]" (click)="closeMenu()" class="mt-2 block break-words text-sm font-semibold text-primary">{{ project.name }}</a> } @else { <p class="mt-2 text-sm text-muted-foreground">None selected</p> }</div>
      <a routerLink="/catalog" (click)="closeMenu()" class="kt-btn kt-btn-light mt-6 w-full"><i class="ki-outline ki-arrow-right" aria-hidden="true"></i>Continue shopping</a>
    </ng-template>
    <ng-template #mobileNavigation>
      <div class="flex h-full flex-col bg-background p-4 text-foreground"><div class="mb-5 flex items-center justify-between gap-3 border-b border-border pb-4"><h2 class="font-semibold">My pages</h2><button type="button" class="kt-btn kt-btn-sm kt-btn-icon kt-btn-light" (click)="closeMenu()" aria-label="Close My pages navigation" title="Close My pages navigation"><i class="ki-outline ki-cross" aria-hidden="true"></i></button></div><ng-container [ngTemplateOutlet]="navigation" /><p class="mt-auto pt-6 text-xs leading-5 text-muted-foreground">{{ service.accountBacked() ? 'Account-backed planning. No reservation or order is created.' : 'Local preview only. No account sync.' }}</p></div>
    </ng-template>
  `,
})
export class CustomerShell implements OnDestroy {
  readonly access = inject(CustomerAccessService);
  readonly auth = inject(AuthSessionService);
  readonly service = inject(ProjectService);
  readonly activeProject = this.service.activeProject;
  private readonly dialog = inject(Dialog);
  private readonly overlay = inject(Overlay);
  mobileRef?: DialogRef;
  readonly menuOpen = signal(false);
  @ViewChild('mobileNavigation') mobileNavigation!: TemplateRef<unknown>;
  readonly links = [
    { label: 'My projects', path: '/my/projects', icon: 'ki-clipboard' },
    { label: 'Favorites', path: '/my/favorites', icon: 'ki-star' },
    { label: 'Profile', path: '/my/profile', icon: 'ki-pencil' },
    { label: 'Account settings', path: '/my/settings', icon: 'ki-screen' },
  ];
  constructor() {
    const router = inject(Router);
    const auth = this.auth;
    const signOutAtMount = auth.signOutRevision();
    let owner = this.access.projectSessionKey();
    router.events.pipe(filter(event => event instanceof NavigationEnd), takeUntilDestroyed()).subscribe(() => this.closeMenu());
    effect(() => {
      const nextOwner = this.access.projectSessionKey();
      if (nextOwner !== owner) { owner = nextOwner; this.dialog.closeAll(); this.closeMenu(); }
      if (!this.access.canAccessProjects()) {
        this.dialog.closeAll();
        if (auth.signOutPending() || auth.signOutRevision() !== signOutAtMount) return;
        const returnUrl = safeCustomerReturnUrl(router.url);
        void router.navigate(['/sign-in'], { queryParams: { returnUrl }, replaceUrl: true });
      }
    });
  }
  openMenu(): void {
    if (this.mobileRef) return;
    const ref = this.dialog.open(this.mobileNavigation, { width: '280px', maxWidth: '90vw', height: '100dvh', positionStrategy: this.overlay.position().global().left('0').top('0'), ariaLabel: 'My pages navigation', panelClass: 'solar-menu-panel', backdropClass: 'solar-dialog-backdrop' });
    this.mobileRef = ref;
    this.menuOpen.set(true);
    ref.closed.subscribe(() => { if (this.mobileRef === ref) { this.mobileRef = undefined; this.menuOpen.set(false); } });
  }
  closeMenu(): void { this.mobileRef?.close(); this.mobileRef = undefined; this.menuOpen.set(false); }
  ngOnDestroy(): void { this.closeMenu(); }
}
