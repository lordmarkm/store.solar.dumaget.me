import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthSessionService } from '../core/auth-session.service';
import { AdminCatalogApiService } from '../core/admin-catalog-api.service';
import type { ProductImage } from '../core/product-images';
import { ProductImageUploader } from './product-image-uploader';

const image: ProductImage = {
  id: 'a'.repeat(64),
  url: `https://storage.googleapis.com/dumaget-me-solar-store-images-dev/products/${'a'.repeat(64)}/detail.webp`,
  thumbnailUrl: `https://storage.googleapis.com/dumaget-me-solar-store-images-dev/products/${'a'.repeat(64)}/thumb.webp`,
  width: 1200, height: 900,
};
function pasteEvent(items: readonly unknown[]): ClipboardEvent {
  const event = new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent;
  Object.defineProperty(event, 'clipboardData', { value: { items } });
  return event;
}
function fileItem(file: File, type = file.type) {
  return { kind: 'file', type, getAsFile: () => file };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(yes => { resolve = yes; });
  return { promise, resolve };
}

describe('product image uploader', () => {
  let fixture: ComponentFixture<ProductImageUploader>;
  let upload: ReturnType<typeof vi.fn>;
  let revision: ReturnType<typeof signal<number>>;
  beforeEach(() => {
    revision = signal(1);
    upload = vi.fn().mockResolvedValue(image);
    TestBed.configureTestingModule({ providers: [
      { provide: AuthSessionService, useValue: { sessionRevision: revision } },
      { provide: AdminCatalogApiService, useValue: { uploadProductImage: upload } },
    ] });
    fixture = TestBed.createComponent(ProductImageUploader);
    fixture.detectChanges();
  });
  afterEach(() => TestBed.resetTestingModule());

  it('shows upload controls without unsolicited storage-policy notices', () => {
    expect(fixture.nativeElement.querySelector('[role="note"]')).toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain('Public image notice');
    expect(fixture.nativeElement.querySelector('input[type="file"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.product-image-paste-zone')).not.toBeNull();
  });

  it('uploads a pasted image from the dedicated zone and preserves ordinary text paste', async () => {
    const emitted = vi.fn();
    fixture.componentInstance.imagesChange.subscribe(emitted);
    const zone = fixture.nativeElement.querySelector('.product-image-paste-zone') as HTMLElement;
    const textPaste = pasteEvent([{ kind: 'string', type: 'text/plain', getAsFile: () => null }]);
    zone.dispatchEvent(textPaste);
    expect(textPaste.defaultPrevented).toBe(false);
    expect(upload).not.toHaveBeenCalled();

    const png = new File(['image'], 'panel.png', { type: 'image/png' });
    const imagePaste = pasteEvent([fileItem(png)]);
    zone.dispatchEvent(imagePaste);
    expect(imagePaste.defaultPrevented).toBe(true);
    await vi.waitFor(() => expect(upload).toHaveBeenCalledWith(png));
    await vi.waitFor(() => expect(emitted).toHaveBeenCalledWith([image]));
  });

  it('rejects unsupported image types and files larger than 5 MiB without uploading', async () => {
    const zone = fixture.nativeElement.querySelector('.product-image-paste-zone') as HTMLElement;
    zone.dispatchEvent(pasteEvent([fileItem(new File(['gif'], 'panel.gif', { type: 'image/gif' }))]));
    await vi.waitFor(() => expect(fixture.nativeElement.textContent).toContain('JPEG, PNG, or WebP'));
    await vi.waitFor(() => expect(fixture.componentInstance.uploading()).toBe(false));
    expect(upload).not.toHaveBeenCalled();

    const large = new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'large.png', { type: 'image/png' });
    zone.dispatchEvent(pasteEvent([fileItem(large)]));
    await vi.waitFor(() => expect(fixture.nativeElement.textContent).toContain('5 MiB'));
    expect(upload).not.toHaveBeenCalled();
  });

  it('uploads multiple pasted images sequentially', async () => {
    const second: ProductImage = {
      ...image, id: 'b'.repeat(64),
      url: `https://storage.googleapis.com/dumaget-me-solar-store-images-dev/products/${'b'.repeat(64)}/detail.webp`,
      thumbnailUrl: `https://storage.googleapis.com/dumaget-me-solar-store-images-dev/products/${'b'.repeat(64)}/thumb.webp`,
    };
    const firstUpload = deferred<ProductImage>();
    upload.mockReturnValueOnce(firstUpload.promise).mockResolvedValueOnce(second);
    const zone = fixture.nativeElement.querySelector('.product-image-paste-zone') as HTMLElement;
    zone.dispatchEvent(pasteEvent([
      fileItem(new File(['one'], 'one.png', { type: 'image/png' })),
      fileItem(new File(['two'], 'two.png', { type: 'image/png' })),
    ]));
    await vi.waitFor(() => expect(upload).toHaveBeenCalledOnce());
    firstUpload.resolve(image);
    await vi.waitFor(() => expect(upload).toHaveBeenCalledTimes(2));
    expect(upload.mock.calls[1][0]).toMatchObject({ name: 'two.png' });
    await vi.waitFor(() => expect(fixture.componentInstance.uploading()).toBe(false));
  });

  it('keeps all six sequentially uploaded images when host input bindings update after each success', async () => {
    const uploaded = Array.from({ length: 6 }, (_, index) => {
      const hash = String(index + 1).repeat(64);
      return {
        id: hash,
        url: `https://storage.googleapis.com/dumaget-me-solar-store-images-dev/products/${hash}/detail.webp`,
        thumbnailUrl: `https://storage.googleapis.com/dumaget-me-solar-store-images-dev/products/${hash}/thumb.webp`,
        width: 1200, height: 900,
      } satisfies ProductImage;
    });
    for (const item of uploaded) upload.mockResolvedValueOnce(item);
    fixture.componentInstance.imagesChange.subscribe(next => fixture.componentRef.setInput('images', next));
    const zone = fixture.nativeElement.querySelector('.product-image-paste-zone') as HTMLElement;
    zone.dispatchEvent(pasteEvent(uploaded.map((_, index) => fileItem(
      new File([String(index)], `image-${index + 1}.png`, { type: 'image/png' }),
    ))));
    await vi.waitFor(() => expect(upload).toHaveBeenCalledTimes(6));
    await vi.waitFor(() => expect(fixture.componentInstance.uploading()).toBe(false));
    expect(fixture.componentInstance.images()).toEqual(uploaded);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('6 of 6 added');
    expect(fixture.nativeElement.textContent).toContain('Primary');
    expect(fixture.nativeElement.querySelectorAll('button[aria-label^="Remove image"]')).toHaveLength(6);
  });

  it('ignores a late upload completion after the account revision changes', async () => {
    const pending = deferred<ProductImage>();
    upload.mockReturnValueOnce(pending.promise);
    const emitted = vi.fn();
    fixture.componentInstance.imagesChange.subscribe(emitted);
    const zone = fixture.nativeElement.querySelector('.product-image-paste-zone') as HTMLElement;
    zone.dispatchEvent(pasteEvent([fileItem(new File(['png'], 'panel.png', { type: 'image/png' }))]));
    await vi.waitFor(() => expect(upload).toHaveBeenCalledOnce());
    revision.set(2);
    pending.resolve(image);
    await vi.waitFor(() => expect(fixture.componentInstance.uploading()).toBe(false));
    expect(emitted).not.toHaveBeenCalled();
  });
});
