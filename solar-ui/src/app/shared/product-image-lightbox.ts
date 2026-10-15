import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { AfterViewInit, Component, HostListener, inject, signal, viewChild } from '@angular/core';
import { GalleryComponent, ImageItem } from 'ng-gallery';
import type { GalleryState } from 'ng-gallery';
import type { ProductImage } from '../core/product-images';

export interface ProductImageLightboxData { images: ProductImage[]; label: string; index: number }

@Component({
  selector: 'app-product-image-lightbox',
  imports: [GalleryComponent],
  host: { class: 'solar-image-lightbox' },
  template: `
    <header class="border-b border-border px-5 py-4"><h2 class="break-words text-lg font-semibold">{{ data.label }}</h2></header>
    <div class="solar-image-lightbox-body">
      <gallery [items]="items" [nav]="false" [thumbs]="false" [counter]="false" [loop]="false"
        [disableScroll]="true" [disableMouseScroll]="true" imageSize="contain" loadingStrategy="lazy"
        scrollBehavior="instant" [scrollDuration]="0" (indexChange)="changed($event)" (error)="failed.set(true)" />
      @if (failed()) { <p class="px-5 py-2 text-sm text-danger" role="alert">The image could not be loaded.</p> }
    </div>
    <footer class="flex shrink-0 flex-wrap items-center justify-end gap-3 border-t border-border px-5 py-4">
      @if (items.length > 1) {
        <div class="me-auto flex flex-wrap items-center gap-2">
          <button type="button" class="kt-btn kt-btn-sm kt-btn-light" [disabled]="activeIndex() === 0" (click)="previous()">Previous image</button>
          <span class="text-xs" aria-live="polite">{{ activeIndex() + 1 }} of {{ items.length }}</span>
          <button type="button" class="kt-btn kt-btn-sm kt-btn-light" [disabled]="activeIndex() === items.length - 1" (click)="next()">Next image</button>
        </div>
      }
      <button type="button" data-image-close class="kt-btn kt-btn-light ms-auto" (click)="ref.close()">Close</button>
    </footer>
  `,
})
export class ProductImageLightbox implements AfterViewInit {
  readonly data = inject<ProductImageLightboxData>(DIALOG_DATA);
  readonly ref = inject(DialogRef);
  readonly activeIndex = signal(this.data.index);
  readonly failed = signal(false);
  readonly items = this.data.images.map((image, index) => new ImageItem({
    src: image.url, thumb: image.thumbnailUrl, alt: this.data.label + ' — image ' + (index + 1),
  }));
  private readonly gallery = viewChild.required(GalleryComponent);

  ngAfterViewInit(): void { this.gallery().galleryRef.set(this.data.index, 'instant'); }
  changed(state: GalleryState): void { this.activeIndex.set(state.currIndex ?? this.data.index); this.failed.set(false); }
  previous(): void { if (this.activeIndex() > 0) this.gallery().galleryRef.prev('instant', false); }
  next(): void { if (this.activeIndex() < this.items.length - 1) this.gallery().galleryRef.next('instant', false); }

  @HostListener('keydown', ['$event'])
  key(event: KeyboardEvent): void {
    if (event.key === 'ArrowLeft') { event.preventDefault(); this.previous(); }
    if (event.key === 'ArrowRight') { event.preventDefault(); this.next(); }
  }
}
