import { Component } from '@angular/core';
import { DIALOG_DATA, Dialog, DialogRef } from '@angular/cdk/dialog';
import { By } from '@angular/platform-browser';
import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { GalleryComponent, ImageItem } from 'ng-gallery';
import type { GalleryState } from 'ng-gallery';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProductImage } from '../core/product-images';
import { ToastService } from '../core/toast.service';
import { ProductLightboxDirective } from './product-lightbox';
import { ProductImageLightbox } from './product-image-lightbox';

vi.mock('ng-gallery', async () => {
  const angular = await import('@angular/core');
  class GalleryComponentDouble {
    items: Array<{ data: { src?: string; thumb?: string; alt?: string } }> = [];
    nav = true;
    thumbs = true;
    counter = true;
    loop = true;
    imageSize = 'cover';
    disableScroll = false;
    disableMouseScroll = false;
    indexChange = new angular.EventEmitter<GalleryState>();
    error = new angular.EventEmitter<unknown>();
    galleryRef = {
      stateSnapshot: { currIndex: 0 },
      get configSnapshot() {
        return {
          nav: thisComponent.nav, thumbs: thisComponent.thumbs, counter: thisComponent.counter,
          loop: thisComponent.loop, imageSize: thisComponent.imageSize,
          disableScroll: thisComponent.disableScroll, disableMouseScroll: thisComponent.disableMouseScroll,
        };
      },
      set: (index: number) => { this.galleryRef.stateSnapshot.currIndex = index; },
      prev: () => {},
      next: () => {},
    };
    constructor() { thisComponent = this; }
  }
  let thisComponent: GalleryComponentDouble;
  angular.Component({
    selector: 'gallery', standalone: true, template: '',
    inputs: ['items', 'nav', 'thumbs', 'counter', 'loop', 'imageSize', 'disableScroll', 'disableMouseScroll'],
    outputs: ['indexChange', 'error'],
  })(GalleryComponentDouble);
  class ImageItemDouble {
    readonly type = 'image';
    constructor(readonly data: { src?: string; thumb?: string; alt?: string }) {}
  }
  return { GalleryComponent: GalleryComponentDouble, ImageItem: ImageItemDouble };
});

const image = (letter: string): ProductImage => {
  const id = letter.repeat(64);
  const base = `https://storage.googleapis.com/dumaget-me-solar-store-images-dev/products/${id}/`;
  return { id, url: `${base}detail.webp`, thumbnailUrl: `${base}thumb.webp`, width: 1200, height: 900 };
};

@Component({
  standalone: true,
  imports: [ProductLightboxDirective],
  template: `<button [productLightbox]="images" [lightboxIndex]="index" [lightboxLabel]="label">Open</button>`,
})
class LightboxHost {
  images: ProductImage[] | undefined = [image('a'), image('b')];
  index = 1;
  label = 'Solar panel';
}

describe('product lightbox directive', () => {
  afterEach(() => TestBed.resetTestingModule());

  function setup(images: ProductImage[] | undefined = [image('a'), image('b')], index = 1) {
    const closed = new Subject<void>();
    const viewerRef = { close: vi.fn(() => closed.next()), closed };
    const open = vi.fn((_component: unknown, _config: unknown) => viewerRef);
    const toast = { error: vi.fn() };
    TestBed.configureTestingModule({
      imports: [LightboxHost],
      providers: [{ provide: Dialog, useValue: { open } }, { provide: ToastService, useValue: toast }],
    });
    const fixture = TestBed.createComponent(LightboxHost);
    fixture.componentInstance.images = images;
    fixture.componentInstance.index = index;
    fixture.detectChanges();
    return { fixture, open, viewerRef, toast, trigger: fixture.nativeElement.querySelector('button') as HTMLButtonElement };
  }

  it('opens a copied image snapshot with the selected index and accessible dialog settings', async () => {
    const { fixture, open, trigger } = setup();
    const initialImages = fixture.componentInstance.images!.map(image => ({ ...image }));
    trigger.click();
    fixture.componentInstance.images![0].url = 'https://changed-after-click.test/photo.webp';
    fixture.componentInstance.index = 0;
    fixture.componentInstance.label = 'Changed after click';
    await vi.waitFor(() => expect(open).toHaveBeenCalledTimes(1));
    expect(open).toHaveBeenCalledTimes(1);
    const [component, rawConfig] = open.mock.calls[0];
    const config = rawConfig as {
      data: { images: ProductImage[]; label: string; index: number };
      ariaLabel: string;
      panelClass: string[];
      maxWidth: string;
    };
    expect(component).toBe(ProductImageLightbox);
    expect(config.data).toEqual({ images: initialImages, label: 'Solar panel', index: 1 });
    expect(config.data.images).not.toBe(fixture.componentInstance.images);
    expect(config.data.images[0]).not.toBe(fixture.componentInstance.images?.[0]);
    expect(config.ariaLabel).toBe('Images: Solar panel');
    expect(config.panelClass).toContain('solar-dialog-panel');
    expect(config.maxWidth).toBe('calc(100vw - 32px)');
  });

  it('does nothing when the image list is empty or the selected index is invalid', () => {
    const empty = setup([], 0);
    empty.trigger.click();
    expect(empty.open).not.toHaveBeenCalled();
    empty.fixture.destroy();
    TestBed.resetTestingModule();

    const negative = setup([image('a')], -1);
    negative.trigger.click();
    expect(negative.open).not.toHaveBeenCalled();
    negative.fixture.destroy();
    TestBed.resetTestingModule();

    const outside = setup([image('a')], 1);
    outside.trigger.click();
    expect(outside.open).not.toHaveBeenCalled();
    outside.fixture.destroy();
    TestBed.resetTestingModule();

    const fractional = setup([image('a')], 0.5);
    fractional.trigger.click();
    expect(fractional.open).not.toHaveBeenCalled();
    fractional.fixture.destroy();
  });

  it('keeps only one viewer open during import and allows reopening after close', async () => {
    const { fixture, open, trigger, viewerRef } = setup();
    trigger.click();
    trigger.click();
    await vi.waitFor(() => expect(open).toHaveBeenCalledTimes(1));
    expect(open).toHaveBeenCalledTimes(1);
    viewerRef.close();
    trigger.click();
    await vi.waitFor(() => expect(open).toHaveBeenCalledTimes(2));
    expect(open).toHaveBeenCalledTimes(2);
    fixture.destroy();
  });

  it('closes its viewer when the trigger owner is destroyed', async () => {
    const { fixture, viewerRef } = setup();
    const directive = fixture.debugElement.query(By.directive(ProductLightboxDirective)).injector.get(ProductLightboxDirective);
    await directive.open();
    fixture.destroy();
    expect(viewerRef.close).toHaveBeenCalledTimes(1);
  });

  it('does not open or report an error when destroyed while the viewer import is pending', async () => {
    const { fixture, open, toast } = setup();
    const directive = fixture.debugElement.query(By.directive(ProductLightboxDirective)).injector.get(ProductLightboxDirective);
    const pending = directive.open();
    fixture.destroy();
    await pending;
    expect(open).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('reports a viewer-open failure through the toast service', async () => {
    const { fixture, open, toast, trigger } = setup();
    open.mockImplementation(() => { throw new Error('dialog failed'); });
    trigger.click();
    await vi.waitFor(() => expect(toast.error).toHaveBeenCalledWith('The image could not be opened. Please try again.'));
    fixture.destroy();
  });
});

describe('product image lightbox', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.unstubAllGlobals();
  });

  function setup() {
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
    vi.stubGlobal('IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } });
    const images = [image('a'), image('b'), image('c')];
    const close = vi.fn();
    TestBed.configureTestingModule({
      imports: [ProductImageLightbox],
      providers: [
        { provide: DIALOG_DATA, useValue: { images, label: 'Panel photo', index: 1 } },
        { provide: DialogRef, useValue: { close } },
      ],
    });
    const fixture = TestBed.createComponent(ProductImageLightbox);
    fixture.detectChanges();
    const gallery = fixture.debugElement.query(x => x.componentInstance instanceof GalleryComponent).componentInstance as GalleryComponent;
    return { fixture, component: fixture.componentInstance, gallery, images, close };
  }

  it('uses ng-gallery with full image URLs, thumbnail URLs, descriptive alt text, and the selected image', () => {
    const { fixture, component, gallery, images } = setup();
    expect(component.items.every(item => item instanceof ImageItem)).toBe(true);
    expect(component.items.map(item => item.data)).toEqual(images.map((photo, index) => ({
      src: photo.url, thumb: photo.thumbnailUrl, alt: `Panel photo — image ${index + 1}`,
    })));
    expect(gallery.galleryRef.stateSnapshot.currIndex).toBe(1);
    expect(gallery.galleryRef.configSnapshot).toMatchObject({
      nav: false, thumbs: false, counter: false, loop: false, imageSize: 'contain',
      disableScroll: true, disableMouseScroll: true,
    });
    expect(fixture.nativeElement.querySelector('gallery')).not.toBeNull();
  });

  it('routes previous and next through the gallery and handles left/right keyboard navigation', () => {
    const { fixture, component, gallery } = setup();
    const previous = vi.spyOn(gallery.galleryRef, 'prev');
    const next = vi.spyOn(gallery.galleryRef, 'next');
    component.changed({ currIndex: 1 } as GalleryState);
    component.previous();
    component.next();
    expect(previous).toHaveBeenCalledWith('instant', false);
    expect(next).toHaveBeenCalledWith('instant', false);

    const left = new KeyboardEvent('keydown', { key: 'ArrowLeft', cancelable: true });
    fixture.nativeElement.dispatchEvent(left);
    const right = new KeyboardEvent('keydown', { key: 'ArrowRight', cancelable: true });
    fixture.nativeElement.dispatchEvent(right);
    expect(left.defaultPrevented).toBe(true);
    expect(right.defaultPrevented).toBe(true);
    expect(previous).toHaveBeenCalledTimes(2);
    expect(next).toHaveBeenCalledTimes(2);
  });

  it('keeps Close at the lower right footer and exposes image loading failures accessibly', () => {
    const { fixture, component, gallery, close: closeDialog } = setup();
    const close = fixture.nativeElement.querySelector('[data-image-close]') as HTMLButtonElement;
    expect(close.textContent.trim()).toBe('Close');
    expect(close.closest('footer')).not.toBeNull();
    expect(close.closest('header')).toBeNull();
    expect(close.closest('.solar-image-lightbox-body')).toBeNull();
    expect(close.closest('footer')?.className).toContain('justify-end');
    close.click();
    expect(closeDialog).toHaveBeenCalledTimes(1);

    gallery.error.emit({ itemIndex: 0, error: new ErrorEvent('error') });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="alert"]')?.textContent).toContain('image could not be loaded');
    gallery.indexChange.emit({ currIndex: 2 } as GalleryState);
    fixture.detectChanges();
    expect(component.activeIndex()).toBe(2);
    expect(component.failed()).toBe(false);
    expect(fixture.nativeElement.querySelector('[role="alert"]')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('3 of 3');
  });
});
