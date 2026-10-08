import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { CurrencyPipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import type { PreviewProductDraft } from './product-draft';

@Component({
  selector: 'app-preview-draft-dialog',
  imports: [CurrencyPipe],
  template: `
    <section class="bg-card text-foreground">
      <header class="border-b border-border px-6 py-5"><p class="eyebrow mb-2">{{ draft.sku }} · Preview draft</p><h2 id="preview-draft-heading" class="break-words text-xl font-semibold">{{ draft.name }}</h2></header>
      <div class="px-6 py-5 text-sm">
        <p class="mb-5 leading-6 text-secondary-foreground">In-memory development draft only. It is not published or available for customer lists or orders. Refreshing clears it.</p>
        <dl class="grid grid-cols-2 gap-4">
          <div><dt class="text-secondary-foreground">Brand</dt><dd class="mt-1 break-words font-medium">{{ draft.brand || 'Not set' }}</dd></div>
          <div><dt class="text-secondary-foreground">Category</dt><dd class="mt-1 font-medium">{{ draft.category || 'Not set' }}</dd></div>
          <div><dt class="text-secondary-foreground">Sellable unit</dt><dd class="mt-1 font-medium">{{ draft.unitCode || 'Not set' }}</dd></div>
          <div><dt class="text-secondary-foreground">Provisional price</dt><dd class="mt-1 font-medium">@if (draft.basePrice; as price) { {{ price.amountMinor / 100 | currency:price.currency:'symbol':'1.2-2' }} } @else { Unpriced }</dd></div>
        </dl>
        <p class="mt-5 whitespace-pre-wrap break-words leading-6">{{ draft.description || 'No description entered.' }}</p>
        <p class="mt-5 text-xs leading-5 text-secondary-foreground">Tax is unspecified. Images, specifications, supplier offers and stock are not configured. No snapshots or PO revisions exist for this draft.</p>
      </div>
      <footer class="flex justify-end border-t border-border px-6 py-4"><button type="button" class="kt-btn kt-btn-light" (click)="ref.close()"><i class="ki-outline ki-cross" aria-hidden="true"></i>Close</button></footer>
    </section>
  `,
})
export class PreviewDraftDialog {
  readonly draft = inject<PreviewProductDraft>(DIALOG_DATA);
  readonly ref = inject(DialogRef);
}
