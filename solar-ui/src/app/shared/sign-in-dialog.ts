import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Component, inject } from '@angular/core';
import { SignInPanel } from './sign-in-panel';

export interface SignInDialogData {
  readonly context?: string;
  readonly pendingLabel?: string;
  readonly warning?: string | null;
}

@Component({
  selector: 'app-sign-in-dialog',
  standalone: true,
  imports: [SignInPanel],
  template: `
    <section class="solar-dialog-panel w-[calc(100vw-32px)] max-w-md bg-card text-card-foreground" aria-labelledby="sign-in-title">
      <header class="flex items-start justify-end p-3 pb-0">
        <button type="button" class="kt-btn kt-btn-sm kt-btn-icon kt-btn-light" aria-label="Close sign-in dialog" title="Close sign-in dialog" (click)="close()">
          <i class="ki-outline ki-cross" aria-hidden="true"></i>
        </button>
      </header>

      <app-sign-in-panel [context]="data?.context ?? 'Sign in to access your projects.'" [pendingLabel]="data?.pendingLabel ?? ''" />
      @if (data?.warning) { <p class="px-5 pb-4 text-sm text-muted-foreground" role="status">{{ data?.warning }}</p> }

      <footer class="flex flex-col gap-3 border-t border-border p-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p class="text-xs leading-5 text-secondary-foreground">Sign-in does not copy your cart or import browser-local previews. Review the destination before saving.</p>
        <button type="button" class="kt-btn kt-btn-light shrink-0" (click)="close()">Continue browsing</button>
      </footer>
    </section>
  `,
})
export class SignInDialog {
  readonly data = inject<SignInDialogData | null>(DIALOG_DATA, { optional: true });
  private readonly ref = inject<DialogRef<void>>(DialogRef);

  close(): void {
    this.ref.close();
  }
}
