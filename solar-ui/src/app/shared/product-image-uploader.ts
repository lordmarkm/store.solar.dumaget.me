import { Component, DestroyRef, inject, input, output, signal } from '@angular/core';
import type { ProductImage } from '../core/product-images';
import { AuthSessionService } from '../core/auth-session.service';
import { AdminCatalogApiService } from '../core/admin-catalog-api.service';
import { ProductLightboxDirective } from './product-lightbox';

const MAX_BYTES = 5 * 1024 * 1024;
const SUPPORTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

@Component({
  selector: 'app-product-image-uploader',
  imports: [ProductLightboxDirective],
  host: { class: 'block' },
  template: `
    <section class="space-y-4" aria-label="Product images">
      <div class="flex flex-wrap items-end justify-between gap-2">
        <div><h3 class="text-sm font-semibold">Product images</h3><p class="mt-1 text-xs text-secondary-foreground">Up to 6 images. JPEG, PNG, or WebP, up to 5 MiB each.</p></div>
        <span class="text-xs text-secondary-foreground">{{ images().length }} of 6 added</span>
      </div>
      @if (images().length) {
        <ul class="grid grid-cols-2 gap-3 sm:grid-cols-3" aria-label="Uploaded product images">
          @for (image of images(); track image.id; let index = $index) {
            <li class="kt-card min-w-0 overflow-hidden p-2">
              <div class="relative"><button type="button" class="solar-product-image-trigger h-32 w-full" [productLightbox]="images()" [lightboxIndex]="index" [lightboxLabel]="productName()"
                  [attr.aria-label]="'Enlarge image ' + (index + 1) + ' for ' + productName()" [attr.title]="'Enlarge image ' + (index + 1) + ' for ' + productName()">
                  <img class="product-image-preview h-32 w-full object-contain" [src]="image.thumbnailUrl" [alt]="productName() + ' image ' + (index + 1)" />
                </button>
                @if (index === 0) { <span class="pointer-events-none absolute start-1 top-1 border border-primary bg-card px-2 py-1 text-[10px] font-semibold text-foreground">Primary</span> }
              </div>
              <div class="mt-2 flex items-center justify-between gap-2">
                <span class="truncate text-xs text-secondary-foreground">{{ image.width }} × {{ image.height }}</span>
                <button type="button" class="kt-btn kt-btn-sm kt-btn-light" [disabled]="disabled() || uploading()" [attr.aria-label]="'Remove image ' + (index + 1) + ' from product'" [attr.title]="'Remove image ' + (index + 1) + ' from product'" (click)="remove(image.id)"><i class="ki-outline ki-trash" aria-hidden="true"></i><span>Remove</span></button>
              </div>
            </li>
          }
        </ul>
      }
      <div class="product-image-paste-zone border border-dashed border-input bg-muted/40 p-4 sm:p-5"
        [attr.tabindex]="disabled() ? -1 : 0" [attr.aria-disabled]="disabled()" role="group"
        aria-label="Image paste area. Focus here and press Control plus V to paste an image."
        (paste)="paste($event)">
        <label class="mb-2 block text-xs font-medium" for="product-image-file">Choose an image</label>
        <input id="product-image-file" class="kt-input block w-full max-w-xl" type="file" accept="image/jpeg,image/png,image/webp" multiple
          [disabled]="disabled() || uploading() || images().length >= 6" (change)="selectFiles($event)" />
        <p class="mt-3 text-xs text-secondary-foreground">Or focus this area and press Ctrl+V to paste an image from your clipboard.</p>
        @if (uploading()) { <p class="mt-3 text-sm" role="status">Uploading image…</p> }
        @if (error()) { <p class="mt-3 text-sm text-danger" role="alert">{{ error() }}</p> }
      </div>
    </section>
  `,
})
export class ProductImageUploader {
  readonly images = input<ProductImage[]>([]);
  readonly productName = input('Product');
  readonly disabled = input(false);
  readonly imagesChange = output<ProductImage[]>();
  readonly pendingChange = output<boolean>();
  readonly uploading = signal(false);
  readonly error = signal<string | null>(null);
  private readonly api = inject(AdminCatalogApiService);
  private readonly auth = inject(AuthSessionService);
  private readonly destroyRef = inject(DestroyRef);
  private generation = 0;

  constructor() { this.destroyRef.onDestroy(() => { this.generation++; }); }

  selectFiles(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    void this.upload(files);
  }

  paste(event: ClipboardEvent): void {
    if (this.disabled() || this.uploading()) return;
    const files = Array.from(event.clipboardData?.items ?? [])
      .filter(item => item.kind === 'file' && item.type.startsWith('image/'))
      .map(item => item.getAsFile())
      .filter((file): file is File => file !== null);
    if (!files.length) return;
    event.preventDefault();
    void this.upload(files);
  }

  remove(id: string): void {
    if (this.disabled() || this.uploading()) return;
    this.imagesChange.emit(this.images().filter(image => image.id !== id));
  }

  private async upload(files: readonly File[]): Promise<void> {
    if (this.disabled() || this.uploading() || !files.length) return;
    this.error.set(null);
    const generation = ++this.generation;
    const revision = this.auth.sessionRevision();
    let working = [...this.images()];
    this.uploading.set(true);
    this.pendingChange.emit(true);
    try {
      for (const file of files) {
        if (this.destroyRef.destroyed || generation !== this.generation || revision !== this.auth.sessionRevision()) return;
        if (!SUPPORTED_TYPES.includes(file.type) || file.size < 1 || file.size > MAX_BYTES) {
          this.error.set('Choose a JPEG, PNG, or WebP image no larger than 5 MiB.');
          continue;
        }
        const current = this.images();
        if (current.length > working.length) working = [...current];
        if (working.length >= 6) {
          this.error.set('A product can have at most 6 images.');
          break;
        }
        try {
          const image = await this.api.uploadProductImage(file);
          if (this.destroyRef.destroyed || generation !== this.generation || revision !== this.auth.sessionRevision()) return;
          const latest = this.images();
          if (latest.length > working.length) working = [...latest];
          if (working.length >= 6) { this.error.set('A product can have at most 6 images.'); break; }
          if (working.some(existing => existing.id === image.id)) continue;
          working = [...working, image];
          this.imagesChange.emit(working);
        } catch {
          if (this.destroyRef.destroyed || generation !== this.generation || revision !== this.auth.sessionRevision()) return;
          this.error.set('The image could not be uploaded. Your product details are preserved; choose the file again to retry.');
          break;
        }
      }
    } finally {
      if (!this.destroyRef.destroyed && generation === this.generation) {
        this.uploading.set(false);
        this.pendingChange.emit(false);
      }
    }
  }
}
