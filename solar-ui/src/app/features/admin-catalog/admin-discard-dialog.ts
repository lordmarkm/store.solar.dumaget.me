import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Component, inject } from '@angular/core';

@Component({
  selector: 'app-admin-discard-dialog',
  template: `
    <section class="bg-card text-foreground">
      <header class="border-b border-border px-6 py-5"><h2 id="admin-discard-heading" class="text-xl font-semibold">Leave the {{ data.kind }} editor?</h2></header>
      <p class="px-6 py-5 text-sm leading-6 text-secondary-foreground">Your input will be discarded. Leaving does not undo a save already received by the server. If a save timed out, retry unchanged details or check the list before creating another record.</p>
      <footer class="flex flex-wrap justify-end gap-3 border-t border-border px-6 py-4">
        <button type="button" class="kt-btn kt-btn-primary" (click)="ref.close(false)">Keep editing</button>
        <button type="button" class="kt-btn kt-btn-light" (click)="ref.close(true)">Discard input and leave</button>
      </footer>
    </section>
  `,
})
export class AdminDiscardDialog {
  readonly ref = inject<DialogRef<boolean>>(DialogRef);
  readonly data = inject<{ kind: 'supplier' | 'product' }>(DIALOG_DATA);
}
