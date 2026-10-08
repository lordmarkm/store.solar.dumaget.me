import { DOCUMENT } from '@angular/common';
import { inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  private readonly router = inject(Router);
  readonly dark = signal(false);
  constructor() {
    try { this.dark.set(localStorage.getItem('solar.theme') === 'dark'); } catch { /* Default to light. */ }
    this.apply();
    this.applyRouteTheme();
    this.router.events.pipe(filter(event => event instanceof NavigationEnd), takeUntilDestroyed())
      .subscribe(() => this.applyRouteTheme());
  }
  toggle(): void {
    this.dark.update(value => !value);
    this.apply();
    try { localStorage.setItem('solar.theme', this.dark() ? 'dark' : 'light'); } catch { /* Theme still applies. */ }
  }
  private apply(): void { this.document.documentElement.classList.toggle('dark', this.dark()); }
  private applyRouteTheme(): void {
    let route = this.router.routerState.snapshot.root;
    let appearance = route.data['appearance'];
    while (route.firstChild) {
      route = route.firstChild;
      appearance = route.data['appearance'] ?? appearance;
    }
    // Apply on the document so toasts, tooltips, and dialogs inherit the active palette.
    this.document.documentElement.dataset['solarTheme'] = appearance === 'public' ? 'public' : 'workspace';
  }
}
