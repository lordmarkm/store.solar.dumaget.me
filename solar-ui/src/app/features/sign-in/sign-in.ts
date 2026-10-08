import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { CustomerAccessService, safeCustomerReturnUrl } from '../../core/customer-access.service';
import { SignInPanel } from '../../shared/sign-in-panel';
@Component({
  selector: 'app-sign-in', imports: [RouterLink, SignInPanel],
  template: `
    <section class="kt-card mx-auto max-w-xl">
      <h1 class="sr-only">Sign in</h1>
      <app-sign-in-panel context="My pages and project creation require sign-in." [pendingLabel]="pendingLabel()" />
      @if (access.retentionWarning()) { <p class="px-5 pb-4 text-sm text-muted-foreground sm:px-6" role="status">{{ access.retentionWarning() }}</p> }
      <div class="flex flex-wrap gap-3 border-t border-border px-5 py-5 sm:px-6"><a routerLink="/catalog" class="kt-btn kt-btn-primary">Continue browsing<i class="ki-outline ki-arrow-right" aria-hidden="true"></i></a><a routerLink="/draft" class="kt-btn kt-btn-light">View Cart</a></div>
      <p class="break-all px-5 pb-5 text-xs text-muted-foreground sm:px-6">Requested page: {{ returnUrl() }}</p>
    </section>
  `,
})
export class SignInPage {
  readonly access = inject(CustomerAccessService);
  private readonly route = inject(ActivatedRoute);
  private readonly query = toSignal(this.route.queryParamMap, { initialValue: this.route.snapshot.queryParamMap });
  readonly returnUrl = computed(() => safeCustomerReturnUrl(this.query().get('returnUrl') ?? this.access.pending()?.returnUrl ?? '/my/projects'));
  readonly pendingLabel = computed(() => this.access.pending()?.kind === 'product' ? 'Your selected item and quantity are retained for later review.' : this.access.pending()?.kind === 'guest-list' ? 'Your cart request is retained for later review.' : 'Your requested page is retained. You can continue browsing without signing in.');
  constructor() { if (!this.access.pending()) this.access.retain({ kind: 'route', returnUrl: this.returnUrl() }); }
}
