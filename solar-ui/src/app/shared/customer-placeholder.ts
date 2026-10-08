import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';

@Component({
  selector: 'app-customer-placeholder',
  imports: [RouterLink],
  template: `
    <div class="mb-6"><p class="eyebrow mb-2">Customer layout preview</p><h1 class="page-title">{{ heading() }}</h1><p class="mt-3 text-sm leading-6 text-muted-foreground">{{ description() }}</p></div>
    <section class="kt-card p-6 sm:p-8"><span class="kt-badge kt-badge-outline mb-4">Not connected</span><h2 class="text-lg font-semibold">This account feature is coming later.</h2><p class="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">This page demonstrates the customer navigation and theme only. It does not represent a signed-in account or saved account records. Favorites, profile editing, and account settings are not available yet.</p><div class="mt-6 flex flex-wrap gap-3"><a routerLink="/catalog" class="kt-btn kt-btn-primary">Explore equipment</a><a routerLink="/my/projects" class="kt-btn kt-btn-light">Open local projects</a></div></section>
  `,
})
export class CustomerPlaceholder {
  private readonly data = toSignal(inject(ActivatedRoute).data);
  readonly heading = computed(() => this.data()?.['heading'] ?? 'My pages');
  readonly description = computed(() => this.data()?.['description'] ?? 'A dedicated space for your solar equipment planning.');
}
