import { CurrencyPipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Product } from '../core/models';
import { SUPPLIERS } from '../core/demo-data';
import { ProductVisualComponent } from './product-visual';
import { PANEL_SPECIFICATION_FIELDS } from '../core/panel-specifications';

@Component({
  selector: 'app-product-dialog',
  imports: [CurrencyPipe, ProductVisualComponent],
  template: `
    <section class="bg-card text-foreground">
      <div class="border-b border-border px-6 py-5"><p class="eyebrow mb-2">{{ product.sku }} · {{ product.source === 'published' ? 'Published product' : 'Sample SKU' }}</p><h2 id="product-dialog-title" class="text-xl font-semibold">{{ product.name }}</h2></div>
      <div class="px-6 py-5">
        <div class="product-stage mb-3 rounded-lg"><app-product-visual [kind]="product.visual" [images]="product.images" [imageIndex]="activeImageIndex()" [alt]="product.name + ' image ' + (activeImageIndex() + 1)" class="mx-auto block h-44 max-w-xs" /></div>
        @if (product.images; as images) {
          @if (images.length) {
          <p class="mb-3 text-center text-xs text-secondary-foreground">Photo {{ activeImageIndex() + 1 }} of {{ images.length }}</p>
          }
          @if (images.length > 1) {
            <ul class="mb-5 flex flex-wrap justify-center gap-2" aria-label="Product photo gallery">
              @for (image of images; track image.id; let index = $index) {
                <li class="relative">
                  <button type="button" class="kt-btn kt-btn-icon kt-btn-light product-gallery-thumb border bg-card p-1" [class.border-primary]="activeImageIndex() === index" [class.border-border]="activeImageIndex() !== index"
                    [attr.aria-label]="'Show image ' + (index + 1) + ' for ' + product.name" [attr.title]="'Show image ' + (index + 1) + ' for ' + product.name" [attr.aria-pressed]="activeImageIndex() === index" (click)="activeImageIndex.set(index)">
                    <img class="h-14 w-16 object-contain" [src]="image.thumbnailUrl" alt="" />
                  </button>
                  @if (index === 0) { <span class="pointer-events-none absolute inset-x-1 bottom-1 bg-card/90 px-1 text-center text-[9px] font-semibold">Primary</span> }
                </li>
              }
            </ul>
          }
        }
        <p class="mb-5 text-sm leading-6 text-secondary-foreground">{{ product.description }}</p>
        <dl class="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
          <div><dt class="text-secondary-foreground">Brand</dt><dd class="mt-1 font-medium">{{ product.brand }}</dd></div>
          @if (product.category !== 'Panels') { <div><dt class="text-secondary-foreground">Specification</dt><dd class="mt-1 font-medium">{{ product.spec }}</dd></div> }
          @if (product.source === 'published') {
            <div><dt class="text-secondary-foreground">Availability</dt><dd class="mt-1 font-medium">Unconfirmed</dd></div>
            <div><dt class="text-secondary-foreground">Tax treatment</dt><dd class="mt-1 font-medium">Not configured</dd></div>
          } @else {
            <div><dt class="text-secondary-foreground">Primary supplier</dt><dd class="mt-1 font-medium">{{ supplier }}</dd></div>
            <div><dt class="text-secondary-foreground">Sample allocation</dt><dd class="mt-1 font-medium">{{ product.stock }} · {{ product.depot }}</dd></div>
          }
        </dl>
        @if (product.category === 'Panels') {
          <section class="mt-6" aria-labelledby="panel-specifications-title">
            <h3 id="panel-specifications-title" class="text-base font-semibold">Panel specifications</h3>
            <dl class="mt-3 grid grid-cols-1 gap-x-6 sm:grid-cols-2">
              @for (field of panelFields; track field.key) {
                <div class="min-w-0 border-b border-border py-3" [class.sm:col-span-2]="field.key === 'warranty' || field.key === 'standardTestConditions'">
                  <dt class="text-xs font-medium text-secondary-foreground">{{ field.label }}</dt>
                  <dd class="mt-1 whitespace-pre-line break-words text-sm font-medium">{{ product.panelSpecifications?.[field.key] || 'Not specified' }}</dd>
                </div>
              }
            </dl>
          </section>
        }
        <div class="public-panel mt-5 rounded-lg border border-border p-4 text-sm">
          <div class="flex justify-between gap-3"><span>Single {{ product.unit }}</span><strong class="public-price">{{ product.price | currency:'PHP':'symbol':'1.2-2' }}</strong></div>
          @for (tier of product.tiers; track tier.quantity) { <div class="mt-3 flex justify-between gap-3"><span>{{ tier.label }}</span><strong class="public-price">{{ tier.unitPrice | currency:'PHP':'symbol':'1.0-0' }}</strong></div> }
        </div>
        <p class="mt-4 text-xs leading-5 text-secondary-foreground">{{ product.source === 'published' ? 'Current catalog estimate. Specifications are supplied by the administrator; blank values are unknown. ' + (product.images?.length ? 'Product images are supplied by the administrator. ' : 'The category illustration is illustrative, not a product photograph. ') + 'Tax and inventory are not configured. Confirm manufacturer datasheets, compatibility, availability and final pricing before purchase.' : 'Illustrative specifications and prices. Confirm manufacturer datasheets and supplier quotations before purchase.' }}</p>
      </div>
      <footer class="flex justify-end border-t border-border px-6 py-4"><button type="button" class="kt-btn kt-btn-light" (click)="ref.close()"><i class="ki-outline ki-cross" aria-hidden="true"></i>Close</button></footer>
    </section>
  `,
})
export class ProductDialog {
  readonly product = inject<Product>(DIALOG_DATA);
  readonly ref = inject(DialogRef);
  readonly panelFields = PANEL_SPECIFICATION_FIELDS;
  readonly activeImageIndex = signal(0);
  readonly supplier = SUPPLIERS.find(s => s.id === this.product.supplierId)?.name ?? 'Unassigned';
}
