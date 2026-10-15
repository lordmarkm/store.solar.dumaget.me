import { Dialog, DialogModule, DialogRef } from '@angular/cdk/dialog';
import { Overlay } from '@angular/cdk/overlay';
import { NgTemplateOutlet } from '@angular/common';
import { Component, inject, OnDestroy, signal, TemplateRef, ViewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { Brand } from './brand';
import { ThemeToggle } from './theme-toggle';
import { Tooltip } from './tooltip';
import { AuthSessionService } from '../core/auth-session.service';

@Component({
  selector: 'app-workspace-shell',
  imports: [RouterLink, RouterLinkActive, RouterOutlet, Brand, ThemeToggle, Tooltip, NgTemplateOutlet, DialogModule],
  template: `
    <div class="demo1 kt-sidebar-fixed kt-header-fixed min-h-screen" [class.kt-sidebar-collapse]="collapsed()">
      <aside class="kt-sidebar fixed inset-y-0 start-0 z-30 hidden flex-col overflow-hidden border-e border-border bg-background lg:flex" aria-label="Workspace navigation">
        <div class="kt-sidebar-header flex shrink-0 items-center border-b border-border px-5"><a routerLink="/catalog" title="Dumaget.me Solar catalog"><app-brand /></a></div>
        <div class="kt-sidebar-wrapper grow"><div class="kt-sidebar-content h-full overflow-y-auto px-3 py-6"><ng-container [ngTemplateOutlet]="navigation" /></div></div>
        <div class="border-t border-border p-4"><span class="sidebar-footer-text block text-xs leading-5 text-secondary-foreground">Dumaguete · Negros Oriental<br>Private store administration</span></div>
      </aside>
      <header class="kt-header fixed inset-x-0 top-0 z-20 flex items-center justify-between gap-3 border-b border-border bg-background px-4 sm:px-6">
        <div class="flex min-w-0 items-center gap-3">
          <button class="kt-btn kt-btn-sm kt-btn-icon kt-btn-light lg:hidden" type="button" (click)="openMenu()" aria-label="Open navigation" title="Open navigation"><i class="ki-outline ki-filter text-base" aria-hidden="true"></i></button>
          <span class="hidden lg:inline-flex"><app-tooltip [label]="collapsed() ? 'Expand sidebar' : 'Collapse sidebar'">
            <button class="kt-btn kt-btn-sm kt-btn-icon kt-btn-light" type="button" (click)="collapsed.update(toggle)" [attr.aria-label]="collapsed() ? 'Expand sidebar' : 'Collapse sidebar'" [attr.title]="collapsed() ? 'Expand sidebar' : 'Collapse sidebar'" [attr.aria-expanded]="!collapsed()">
              <i class="ki-outline ki-arrow-right text-base" [class.rotate-180]="!collapsed()" aria-hidden="true"></i>
            </button>
          </app-tooltip></span>
          <span class="text-sm text-secondary-foreground"><span class="hidden sm:inline">Solar Supply <span class="mx-2 text-muted-foreground">/</span></span><span class="font-medium text-foreground">Admin</span></span>
        </div>
        <div class="flex shrink-0 items-center gap-3"><a routerLink="/catalog" class="kt-btn kt-btn-sm kt-btn-light">Continue shopping</a>
          @if (auth.status() === 'signed-in') { <button type="button" class="kt-btn kt-btn-sm kt-btn-light" [disabled]="auth.busy()" (click)="auth.signOut()">Sign out</button> }
          <app-theme-toggle /></div>
      </header>
      <div class="kt-wrapper min-w-0"><main id="main-content" tabindex="-1" class="page-width py-6 sm:py-8">@if (auth.error()) { <p class="kt-card mb-5 p-4 text-sm text-danger" role="alert">{{ auth.error() }}</p> }<router-outlet /></main></div>
    </div>
    <ng-template #navigation>
      <p class="workspace-nav-label mb-3 px-3 text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">Administration</p>
      <nav class="kt-menu kt-menu-default flex-col gap-1" aria-label="Solar workspace">
        @for (link of links; track link.path) {
          <div class="kt-menu-item" routerLinkActive="active">
            <a [routerLink]="link.path" (click)="closeMenu()" class="kt-menu-link min-h-11 gap-3" [title]="link.label" routerLinkActive="font-semibold" ariaCurrentWhenActive="page">
              <span class="kt-menu-icon"><i [class]="'ki-outline ' + link.icon" aria-hidden="true"></i></span><span class="kt-menu-title">{{ link.label }}</span>
            </a>
          </div>
        }
      </nav>
    </ng-template>
    <ng-template #mobileNavigation>
      <div class="flex h-full flex-col bg-background p-4 text-foreground"><div class="mb-6 border-b border-border pb-4"><app-brand /></div><ng-container [ngTemplateOutlet]="navigation" /><div class="mt-auto border-t border-border pt-4"><button class="kt-btn kt-btn-light w-full" type="button" (click)="closeMenu()"><i class="ki-outline ki-cross" aria-hidden="true"></i>Close navigation</button></div></div>
    </ng-template>
  `,
})
export class WorkspaceShell implements OnDestroy {
  readonly auth = inject(AuthSessionService);
  readonly collapsed = signal(false);
  readonly toggle = (value: boolean) => !value;
  private readonly dialog = inject(Dialog);
  private readonly overlay = inject(Overlay);
  private mobileRef?: DialogRef;
  @ViewChild('mobileNavigation') mobileNavigation!: TemplateRef<unknown>;
  readonly links = [
    { label: 'Products', path: '/admin/products', icon: 'ki-clipboard' },
    { label: 'Inventory', path: '/admin/inventory', icon: 'ki-filter' },
    { label: 'Suppliers', path: '/admin/suppliers', icon: 'ki-award' },
  ];
  constructor() { inject(Router).events.pipe(filter(event => event instanceof NavigationEnd), takeUntilDestroyed()).subscribe(() => this.closeMenu()); }
  openMenu(): void {
    if (this.mobileRef) return;
    const ref = this.dialog.open(this.mobileNavigation, { width: '280px', maxWidth: '90vw', height: '100dvh', positionStrategy: this.overlay.position().global().left('0').top('0'), ariaLabel: 'Solar workspace navigation', panelClass: 'solar-menu-panel', backdropClass: 'solar-dialog-backdrop' });
    this.mobileRef = ref;
    ref.closed.subscribe(() => { if (this.mobileRef === ref) this.mobileRef = undefined; });
  }
  closeMenu(): void { this.mobileRef?.close(); this.mobileRef = undefined; }
  ngOnDestroy(): void { this.closeMenu(); }
}
