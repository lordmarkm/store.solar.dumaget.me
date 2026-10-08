import { Dialog } from '@angular/cdk/dialog';
import { afterNextRender, Component, computed, ElementRef, HostListener, inject, Injector, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { map, Observable } from 'rxjs';
import { CATEGORIES, PRODUCTS } from '../../core/demo-data';
import { NoticeService } from '../../core/notice.service';
import { Tooltip } from '../../shared/tooltip';
import { DiscardProductDialog } from './discard-product-dialog';
import { emptyProductInput, NewProductInput, PREVIEW_UNITS, productListReturnUrl, ProductInputErrors, validateProductInput } from './product-draft';
import { ProductPreviewStore } from './product-preview.store';

@Component({
  selector: 'app-product-editor',
  imports: [FormsModule, Tooltip],
  templateUrl: './product-editor.html',
})
export class ProductEditorPage {
  private readonly store = inject(ProductPreviewStore);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly dialog = inject(Dialog);
  private readonly notice = inject(NoticeService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly requestId = crypto.randomUUID();
  readonly input = signal<NewProductInput>(emptyProductInput());
  readonly attempted = signal(false);
  readonly saving = signal(false);
  readonly saved = signal(false);
  readonly saveError = signal<string | null>(null);
  readonly serverErrors = signal<ProductInputErrors>({});
  readonly errors = computed(() => ({ ...validateProductInput(this.input(), this.store.existingSkus()), ...this.serverErrors() }));
  readonly dirty = computed(() => JSON.stringify(this.input()) !== JSON.stringify(emptyProductInput()));
  readonly categories = CATEGORIES;
  readonly units = PREVIEW_UNITS;
  readonly brands = [...new Set(PRODUCTS.map(product => product.brand))].sort();
  readonly returnTo = productListReturnUrl(this.route.snapshot.queryParamMap.get('returnTo'));

  update<K extends keyof NewProductInput>(field: K, value: NewProductInput[K]): void {
    this.input.update(input => ({ ...input, [field]: value }));
    this.serverErrors.set({});
    this.saveError.set(null);
  }
  error(field: keyof NewProductInput): string | null { return this.attempted() ? this.errors()[field] ?? null : null; }
  save(): void {
    if (this.saving() || this.saved()) return;
    this.attempted.set(true);
    this.serverErrors.set({});
    if (Object.keys(this.errors()).length) { this.focusError(); return; }
    this.saving.set(true);
    try {
      const result = this.store.create(this.input(), this.requestId);
      if (!result.ok) {
        this.serverErrors.set(result.errors ?? {});
        this.saveError.set(result.message);
        this.focusError();
        return;
      }
      this.saved.set(true);
      this.notice.show('Preview draft saved in memory only. Refreshing this app clears it.');
      void this.router.navigate(['/admin/products'], { queryParams: { q: result.draft.sku, state: 'draft' } });
    } finally { this.saving.set(false); }
  }
  cancel(): void { if (!this.saving()) void this.router.navigateByUrl(this.returnTo); }
  canLeave(): boolean | Observable<boolean> {
    if (!this.dirty() || this.saved()) return true;
    return this.dialog.open<boolean>(DiscardProductDialog, {
      width: '480px', maxWidth: 'calc(100vw - 32px)', ariaLabelledBy: 'discard-product-heading',
      panelClass: 'solar-dialog-panel', backdropClass: 'solar-dialog-backdrop',
    }).closed.pipe(map(result => result === true));
  }
  @HostListener('window:beforeunload', ['$event'])
  beforeUnload(event: BeforeUnloadEvent): void {
    if (this.dirty() && !this.saved()) { event.preventDefault(); event.returnValue = ''; }
  }
  private focusError(): void {
    afterNextRender(() => (this.host.nativeElement.querySelector<HTMLElement>('[aria-invalid="true"]')
      ?? this.host.nativeElement.querySelector<HTMLElement>('[role="alert"]'))?.focus(), { injector: this.injector });
  }
}
