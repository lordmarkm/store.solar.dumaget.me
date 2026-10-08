import { DialogRef } from '@angular/cdk/dialog';
import { Component, inject } from '@angular/core';

@Component({
  selector: 'app-discard-product-dialog',
  template: `
    <section class="bg-card text-foreground">
      <header class="border-b border-border px-6 py-5"><h2 id="discard-product-heading" class="text-xl font-semibold">Leave the product editor?</h2></header>
      <p class="px-6 py-5 text-sm leading-6 text-secondary-foreground">Your unsaved product input will be discarded. No product has been created, published or changed.</p>
      <footer class="flex flex-wrap justify-end gap-3 border-t border-border px-6 py-4">
        <button type="button" class="kt-btn kt-btn-primary" (click)="ref.close(false)">Keep editing</button>
        <button type="button" class="kt-btn kt-btn-light" (click)="ref.close(true)">Discard and leave</button>
      </footer>
    </section>
  `,
})
export class DiscardProductDialog { readonly ref = inject<DialogRef<boolean>>(DialogRef); }
