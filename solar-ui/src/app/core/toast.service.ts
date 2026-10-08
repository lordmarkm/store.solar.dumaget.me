import { DOCUMENT } from '@angular/common';
import { DestroyRef, Injectable, inject } from '@angular/core';
import { KTToast } from '@keenthemes/ktui/components/toast';

/** Root-owned KTUI notifications survive successful form-to-list navigation. */
@Injectable({ providedIn: 'root' })
export class ToastService {
  private readonly document = inject(DOCUMENT);
  private readonly active = new Map<string, () => void>();

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      for (const dismiss of this.active.values()) dismiss();
      this.active.clear();
    });
  }

  success(message: string): void { this.show(message, false); }
  error(message: string): void { this.show(message, true); }

  private show(message: string, failure: boolean): void {
    // Build text nodes: KTUI serializes custom content to HTML internally.
    // Never pass a product name or API message as unsanitized HTML.
    const content = this.document.createElement('div');
    content.className = 'solar-toast-content';
    const icon = this.document.createElement('i');
    icon.className = 'kt-alert-icon ki-outline ' + (failure ? 'ki-cross' : 'ki-check-circle');
    icon.setAttribute('aria-hidden', 'true');
    const text = this.document.createElement('span');
    text.className = 'kt-alert-title';
    text.textContent = message;
    const close = this.document.createElement('button');
    close.type = 'button';
    close.className = 'kt-alert-close';
    close.setAttribute('data-kt-toast-dismiss', 'true');
    close.setAttribute('aria-label', 'Dismiss notification');
    close.title = 'Dismiss notification';
    const closeIcon = this.document.createElement('i');
    closeIcon.className = 'ki-outline ki-cross';
    closeIcon.setAttribute('aria-hidden', 'true');
    close.append(closeIcon);
    content.append(icon, text, close);

    // Feedback must not change an already-completed mutation into an API failure.
    try {
      if (this.active.size >= 3) {
        const oldest = this.active.entries().next().value;
        if (oldest) { oldest[1](); this.active.delete(oldest[0]); }
      }
      const toast = KTToast.show({
        content, variant: failure ? 'destructive' : 'success', appearance: 'outline',
        position: 'top-end', duration: failure ? 0 : 5000, pauseOnHover: true,
        maxToasts: 3, role: failure ? 'alert' : 'status', className: 'solar-operation-toast',
      });
      if (!toast) return;
      toast.element.setAttribute('aria-live', failure ? 'assertive' : 'polite');
      // KTUI's onDismiss option is not retained by this pinned version.
      toast.element.addEventListener('kt.toast.hidden', () => this.active.delete(toast.id), { once: true });
      this.active.set(toast.id, toast.dismiss);
    } catch {
      // Inline form/status messages remain the durable fallback.
    }
  }
}
