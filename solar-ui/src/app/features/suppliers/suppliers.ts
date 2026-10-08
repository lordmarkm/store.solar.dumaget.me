import { Component, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { PRODUCTS, SUPPLIERS } from '../../core/demo-data';

@Component({
  selector: 'app-suppliers',
  imports: [FormsModule, RouterLink],
  template: `
    <div class="mb-6 flex flex-wrap items-end justify-between gap-4"><div><p class="eyebrow mb-2">Operations / sourcing</p><h1 class="page-title">Supplier portfolio</h1><p class="mt-2 text-sm text-secondary-foreground">Keep equipment lines connected to their sourcing partners.</p></div><a routerLink="/admin/inventory" class="kt-btn kt-btn-light"><i class="ki-outline ki-filter" aria-hidden="true"></i>View equipment</a></div>
    <div class="kt-card mb-6 p-5"><label for="supplier-search" class="mb-2 block text-xs font-medium">Find a supplier</label><input type="search" id="supplier-search" class="kt-input w-full sm:max-w-md" placeholder="Name, equipment line, or region…" [ngModel]="search()" (ngModelChange)="search.set($event)" /></div>
    <div class="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
      @for (supplier of filtered(); track supplier.id) {
        <article class="kt-card p-5"><div class="mb-5 flex items-center gap-3"><span class="flex size-12 items-center justify-center rounded-xl border border-primary/10 bg-primary/5 text-sm font-semibold text-primary">{{ supplier.initials }}</span><div><h2 class="font-semibold">{{ supplier.name }}</h2><p class="mt-1 text-xs text-secondary-foreground">{{ supplier.region }}</p></div></div><p class="eyebrow mb-2">Equipment coverage</p><p class="text-sm">{{ supplier.category }}</p><dl class="mt-5 grid grid-cols-2 gap-4 border-t border-border pt-5 text-sm"><div><dt class="text-xs text-secondary-foreground">Sample lead time</dt><dd class="mt-1 font-semibold">{{ supplier.leadDays }} days</dd></div><div><dt class="text-xs text-secondary-foreground">Mapped SKUs</dt><dd class="mt-1 font-semibold">{{ productCount(supplier.id) }}</dd></div></dl><p class="mt-4 text-xs text-secondary-foreground">Reference MOQ: {{ supplier.orderUnit }}</p><div class="mt-auto border-t border-border pt-4 mt-5"><span class="kt-badge kt-badge-sm kt-badge-outline">Sample sourcing profile</span></div></article>
      } @empty { <section class="kt-card col-span-full p-10 text-center"><h2 class="text-lg font-semibold">No matching suppliers</h2><p class="mt-2 text-sm text-secondary-foreground">Try a different search term.</p><button type="button" class="kt-btn kt-btn-light mx-auto mt-5" (click)="search.set('')">Clear search</button></section> }
    </div>
    <div class="kt-card mt-6 p-5"><h2 class="text-sm font-semibold">A foundation for multi-supplier sourcing</h2><p class="mt-2 text-xs leading-6 text-secondary-foreground">The scaffold links each SKU to a primary supplier. Alternate sources, supplier quotations, inbound purchase orders, and reorder rules are planned integrations. Supplier names, lead times, and order minimums here are sample data.</p></div>
  `,
})
export class Suppliers {
  readonly search = signal('');
  readonly filtered = computed(() => SUPPLIERS.filter(s => `${s.name} ${s.region} ${s.category}`.toLowerCase().includes(this.search().trim().toLowerCase())));
  productCount(id: string): number { return PRODUCTS.filter(p => p.supplierId === id).length; }
}
