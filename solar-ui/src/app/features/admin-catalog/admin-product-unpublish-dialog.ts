import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Component, inject } from '@angular/core';

@Component({
  selector: 'app-admin-product-unpublish-dialog',
  template: `
    <section class="bg-card text-foreground">
      <header class="border-b border-border px-6 py-5"><h2 id="admin-unpublish-heading" class="text-xl font-semibold">Unpublish product?</h2></header>
      <p class="px-6 py-5 text-sm leading-6">Remove <strong>{{ data.name }}</strong> from the public catalog? The record remains available to administrators as a private draft. This does not change stock, tax, or media.</p>
      <footer class="flex flex-wrap justify-end gap-3 border-t border-border px-6 py-4">
        <button type="button" class="kt-btn kt-btn-light" (click)="ref.close(false)">Keep published</button>
        <button type="button" class="kt-btn kt-btn-primary" (click)="ref.close(true)">Unpublish listing</button>
      </footer>
    </section>
  `,
})
export class AdminProductUnpublishDialog {
  readonly ref = inject<DialogRef<boolean>>(DialogRef);
  readonly data = inject<{ name: string }>(DIALOG_DATA);
}
