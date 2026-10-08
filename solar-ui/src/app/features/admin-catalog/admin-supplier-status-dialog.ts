import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Component, inject } from '@angular/core';

export interface SupplierStatusDialogData {
  supplierName: string;
  targetStatus: 'active' | 'inactive';
}

@Component({
  selector: 'app-admin-supplier-status-dialog',
  template: `
    <section class="bg-card text-foreground">
      <header class="border-b border-border px-6 py-5">
        <h2 id="admin-supplier-status-heading" class="text-xl font-semibold">
          {{ data.targetStatus === 'inactive' ? 'Deactivate supplier?' : 'Reactivate supplier?' }}
        </h2>
      </header>
      @if (data.targetStatus === 'inactive') {
        <p class="px-6 py-5 text-sm leading-6">
          Stop <strong>{{ data.supplierName }}</strong> from new sourcing and product publishing? Existing contact details,
          products, and purchase order history remain available. This does not delete products or unpublish existing listings.
        </p>
      } @else {
        <p class="px-6 py-5 text-sm leading-6">
          Reactivate <strong>{{ data.supplierName }}</strong>? The supplier will be available for new sourcing and product publishing again.
        </p>
      }
      <footer class="flex flex-wrap justify-end gap-3 border-t border-border px-6 py-4">
        <button type="button" class="kt-btn kt-btn-light" (click)="ref.close(false)">Cancel</button>
        <button type="button" class="kt-btn kt-btn-primary" (click)="ref.close(true)">
          {{ data.targetStatus === 'inactive' ? 'Deactivate supplier' : 'Reactivate supplier' }}
        </button>
      </footer>
    </section>
  `,
})
export class AdminSupplierStatusDialog {
  readonly ref = inject<DialogRef<boolean>>(DialogRef);
  readonly data = inject<SupplierStatusDialogData>(DIALOG_DATA);
}
