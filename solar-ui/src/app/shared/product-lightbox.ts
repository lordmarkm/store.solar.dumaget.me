import { Dialog, DialogRef } from '@angular/cdk/dialog';
import { DestroyRef, Directive, inject, input } from '@angular/core';
import type { ProductImage } from '../core/product-images';
import type { ProductImageLightbox } from './product-image-lightbox';
import { ToastService } from '../core/toast.service';

/** Read-only viewer shared by product thumbnails and editor previews. */
@Directive({ selector: 'button[productLightbox]', host: { '(click)': 'open()' } })
export class ProductLightboxDirective {
  readonly productLightbox = input<ProductImage[] | undefined>();
  readonly lightboxLabel = input('Product image');
  readonly lightboxIndex = input(0);
  private readonly dialog = inject(Dialog);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);
  private ref?: DialogRef<unknown, ProductImageLightbox>;
  private opening = false;

  constructor() { this.destroyRef.onDestroy(() => this.ref?.close()); }

  async open(): Promise<void> {
    const images = this.productLightbox();
    const index = this.lightboxIndex();
    if (this.ref || this.opening || !images?.length || !Number.isInteger(index) || index < 0 || index >= images.length) return;
    const data = { images: images.map(image => ({ ...image })), label: this.lightboxLabel(), index };
    this.opening = true;
    try {
      const { ProductImageLightbox } = await import('./product-image-lightbox');
      if (this.destroyRef.destroyed) return;
      const ref = this.dialog.open(ProductImageLightbox, {
        data,
        width: '1024px', maxWidth: 'calc(100vw - 32px)', maxHeight: 'calc(100dvh - 32px)',
        ariaLabel: 'Images: ' + data.label, autoFocus: '[data-image-close]',
        panelClass: ['solar-dialog-panel', 'solar-image-lightbox-panel'],
        backdropClass: 'solar-dialog-backdrop', closeOnNavigation: true,
      });
      this.ref = ref;
      ref.closed.subscribe(() => { if (this.ref === ref) this.ref = undefined; });
    } catch {
      if (!this.destroyRef.destroyed) this.toast.error('The image could not be opened. Please try again.');
    } finally { this.opening = false; }
  }
}
