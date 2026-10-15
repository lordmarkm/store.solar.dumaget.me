import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Product } from '../core/models';
import { ProductDialog } from './product-dialog';

const panel: Product = { id: 'panel-id', sku: 'PANEL-1', name: 'Panel', brand: 'Solar', category: 'Panels',
  description: 'Manufacturer details', spec: '620 Wp', secondarySpec: '', source: 'published', price: 100,
  stock: 0, unit: 'panel', depot: '', supplierId: '', visual: 'panel', tiers: [],
  panelSpecifications: { ratedMaximumPower: '620 Wp', eanCode: '0123456789012', warranty: '15 years product\n30 years / 85% output' } };
describe('product dialog specifications', () => {
  afterEach(() => TestBed.resetTestingModule());
  function open(product: Product) {
    TestBed.configureTestingModule({ providers: [{ provide: DIALOG_DATA, useValue: product }, { provide: DialogRef, useValue: { close: vi.fn() } }] });
    const fixture = TestBed.createComponent(ProductDialog); fixture.detectChanges(); return fixture;
  }
  it('displays every panel parameter, keeps unknowns honest, and preserves EAN/warranty text', () => {
    const fixture = open(panel);
    const body = fixture.nativeElement as HTMLElement;
    const specs = body.querySelector('section[aria-labelledby="panel-specifications-title"]')!;
    expect(specs.querySelectorAll('dt')).toHaveLength(15);
    expect(specs.textContent).toContain('0123456789012');
    expect(specs.textContent).toContain('15 years product\n30 years / 85% output');
    expect(specs.textContent).toContain('Not specified');
    expect(body.textContent).not.toContain('Specifications, media, tax and inventory are not configured');
  });
  it('does not show panel-specific fields for other categories', () => {
    const fixture = open({ ...panel, category: 'Inverters', visual: 'inverter', panelSpecifications: null });
    expect(fixture.nativeElement.querySelector('#panel-specifications-title')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Specification');
  });
  it('shows labeled MCB type and amperage without changing the product image', () => {
    const product = { ...panel, category: 'Circuit breakers' as const, visual: 'combiner' as const,
      protectionType: 'MCB' as const, mcbSpecifications: { type: 'AC' as const, amperage: 16.25 } };
    const fixture = open(product);
    const body = fixture.nativeElement as HTMLElement;
    expect(body.textContent).toContain('MCB type');
    expect(body.textContent).toContain('AC');
    expect(body.textContent).toContain('Amperage');
    expect(body.textContent).toContain('16.25 A');
    expect(fixture.componentInstance.product.visual).toBe('combiner');
  });
  it('shows unknown ATS amperage honestly without MCB electrical details', () => {
    const fixture = open({ ...panel, category: 'ATS', visual: 'combiner', protectionType: 'ATS' });
    const body = fixture.nativeElement as HTMLElement;
    expect(body.textContent).toContain('Subcategory');
    expect(body.textContent).toContain('ATS');
    expect(body.textContent).not.toContain('MCB type');
    expect(body.textContent).toContain('Amperage');
    expect(body.textContent).toContain('Not specified');
  });
  it('shows the separate ATS amperage including fractional ratings', () => {
    const fixture = open({ ...panel, category: 'ATS', visual: 'combiner', protectionType: 'ATS', atsSpecifications: { amperage: 63.5 } });
    expect(fixture.nativeElement.textContent).toContain('63.5 A');
    expect(fixture.nativeElement.textContent).not.toContain('MCB type');
  });
  it('switches full-size photos through gallery thumbnails without changing the primary image', () => {
    const images = ['a', 'b'].map(character => {
      const id = character.repeat(64);
      const base = 'https://storage.googleapis.com/dumaget-me-solar-store-images-dev/products/' + id + '/';
      return { id, url: base + 'detail.webp', thumbnailUrl: base + 'thumb.webp', width: 1200, height: 900 };
    });
    const fixture = open({ ...panel, images });
    const body = fixture.nativeElement as HTMLElement;
    const buttons = body.querySelectorAll<HTMLButtonElement>('.product-gallery-thumb');
    expect(buttons).toHaveLength(2);
    expect(body.querySelector<HTMLImageElement>('.product-stage img')?.src).toBe(images[0].url);
    expect(buttons[0].getAttribute('aria-pressed')).toBe('true');
    expect(buttons[1].querySelector<HTMLImageElement>('img')?.src).toBe(images[1].thumbnailUrl);
    buttons[1].click();
    fixture.detectChanges();
    const detail = body.querySelector<HTMLImageElement>('.product-stage img')!;
    expect(detail.src).toBe(images[1].url);
    expect(detail.alt).toBe('Panel image 2');
    expect(buttons[0].getAttribute('aria-pressed')).toBe('false');
    expect(buttons[1].getAttribute('aria-pressed')).toBe('true');
    expect(body.querySelector('.product-stage svg')).toBeNull();
    expect(body.textContent).toContain('Photo 2 of 2');
    expect(body.querySelectorAll('.product-gallery-thumb + span')).toHaveLength(1);
    expect(fixture.componentInstance.product.images?.[0].id).toBe(images[0].id);
  });
});
