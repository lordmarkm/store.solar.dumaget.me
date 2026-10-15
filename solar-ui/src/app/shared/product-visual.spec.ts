import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { ProductVisualComponent } from './product-visual';

describe('product visual', () => {
  let fixture: ComponentFixture<ProductVisualComponent>;
  beforeEach(() => {
    fixture = TestBed.createComponent(ProductVisualComponent);
    fixture.componentRef.setInput('kind', 'panel');
  });

  it('renders the uploaded image with product-specific alternative text when available', () => {
    const url = 'https://storage.googleapis.com/dumaget-me-solar-store-images-dev/products/' + 'a'.repeat(64) + '/detail.webp';
    fixture.componentRef.setInput('images', [{
      id: 'a'.repeat(64), url, thumbnailUrl: url.replace('detail.webp', 'thumb.webp'), width: 1200, height: 900,
    }]);
    fixture.componentRef.setInput('alt', 'Solar panel product image');
    fixture.detectChanges();
    const image = fixture.nativeElement.querySelector('img') as HTMLImageElement;
    expect(image.src).toBe(url);
    expect(image.alt).toBe('Solar panel product image');
    const trigger = image.closest('button') as HTMLButtonElement | null;
    expect(trigger).not.toBeNull();
    expect(trigger?.getAttribute('aria-label')).toBe('Enlarge Solar panel product image');
    expect(trigger?.title).toBe('Enlarge Solar panel product image');
    expect(fixture.nativeElement.querySelector('svg')).toBeNull();
  });

  it('uses the thumbnail object for compact product views', () => {
    const hash = 'b'.repeat(64);
    const detailUrl = `https://storage.googleapis.com/dumaget-me-solar-store-images-dev/products/${hash}/detail.webp`;
    const thumbUrl = detailUrl.replace('detail.webp', 'thumb.webp');
    fixture.componentRef.setInput('images', [{ id: hash, url: detailUrl, thumbnailUrl: thumbUrl, width: 1200, height: 900 }]);
    fixture.componentRef.setInput('variant', 'thumb');
    fixture.detectChanges();
    const image = fixture.nativeElement.querySelector('img') as HTMLImageElement;
    expect(image.src).toBe(thumbUrl);
    expect(image.closest('button')).not.toBeNull();
  });

  it('renders the selected full-size image in the detail view', () => {
    const firstId = 'c'.repeat(64);
    const secondId = 'd'.repeat(64);
    const base = (hash: string) => `https://storage.googleapis.com/dumaget-me-solar-store-images-dev/products/${hash}/`;
    fixture.componentRef.setInput('images', [
      { id: firstId, url: base(firstId) + 'detail.webp', thumbnailUrl: base(firstId) + 'thumb.webp', width: 1200, height: 900 },
      { id: secondId, url: base(secondId) + 'detail.webp', thumbnailUrl: base(secondId) + 'thumb.webp', width: 1200, height: 900 },
    ]);
    fixture.componentRef.setInput('imageIndex', 1);
    fixture.detectChanges();
    const image = fixture.nativeElement.querySelector('img') as HTMLImageElement;
    expect(image.src).toBe(base(secondId) + 'detail.webp');
    expect(image.closest('button')).not.toBeNull();
  });

  it('keeps the illustrative category SVG as fallback when no photo is supplied', () => {
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('img')).toBeNull();
    expect(fixture.nativeElement.querySelector('svg')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('button')).toBeNull();
  });
});
