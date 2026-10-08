import { describe, expect, it } from 'vitest';
import { PANEL_SPECIFICATION_FIELDS, normalizePanelSpecifications, panelSpecificationPayload, validPanelSpecifications } from './panel-specifications';
import { parsePublishedProduct, publishedView, type PublishedProduct } from './public-catalog.service';

const product: PublishedProduct = { id: '11111111-1111-4111-8111-111111111111', schemaVersion: 1, version: 2,
  publishedAt: '2026-10-08T00:00:00.000Z', sku: 'PANEL-1', name: 'Panel', brand: 'Solar', category: 'Panels',
  unitCode: 'panel', description: 'Manufacturer panel', amountMinor: 12345, currency: 'PHP' };

describe('panel specification contracts', () => {
  it('covers all 15 panel parameters without duplicating Brand, and preserves literal units and EAN zeroes', () => {
    expect(PANEL_SPECIFICATION_FIELDS).toHaveLength(15);
    expect(normalizePanelSpecifications({ eanCode: ' 0123456789012 ', dimensions: ' 2382 × 1134 × 30 mm ',
      grossWeight: '33,000 kg', warranty: '15 years product\n30 years / 85% output' })).toEqual({
      eanCode: '0123456789012', dimensions: '2382 × 1134 × 30 mm', grossWeight: '33,000 kg',
      warranty: '15 years product\n30 years / 85% output',
    });
  });
  it('rejects unknown keys, numeric EAN, bad controls, undefined values and excess lengths', () => {
    for (const invalid of [{ supplierId: 'private' }, { eanCode: 123 }, { cable: undefined }, { cable: 'a\nb' },
      { warranty: 'bad\ttab' }, { productCode: 'x'.repeat(201) }, { standardTestConditions: 'x'.repeat(501) },
      { warranty: 'x'.repeat(1001) }, [], 1]) expect(validPanelSpecifications(invalid)).toBe(false);
    expect(validPanelSpecifications(null)).toBe(true);
    expect(validPanelSpecifications({ warranty: 'line 1\nline 2', standardTestConditions: 'AM 1.5\n25°C' })).toBe(true);
    expect(validPanelSpecifications({ productCode: ' code ' }, true)).toBe(false);
  });
  it('omits empty legacy fields, sends populated panel specs, and explicitly clears previously saved maps', () => {
    expect(panelSpecificationPayload('Panels', {})).toEqual({});
    expect(panelSpecificationPayload('Panels', { eanCode: ' 001234 ', cable: '' })).toEqual({ panelSpecifications: { eanCode: '001234' } });
    expect(panelSpecificationPayload('Panels', { cable: ' ' }, true)).toEqual({ panelSpecifications: null });
    expect(panelSpecificationPayload('Inverters', { cable: '4 mm²' }, true)).toEqual({ panelSpecifications: null });
    expect(panelSpecificationPayload('Inverters', { cable: '4 mm²' })).toEqual({});
  });
  it('retains specifications through the public DTO/view while rejecting private injection and non-panel maps', () => {
    const panelSpecifications = { eanCode: '0123456789012', ratedMaximumPower: '620 Wp', dimensions: '2382 × 1134 × 30 mm' };
    const view = publishedView(parsePublishedProduct({ ...product, panelSpecifications }));
    expect(view.panelSpecifications).toEqual(panelSpecifications);
    expect(view.spec).toBe('620 Wp');
    expect(view.secondarySpec).toBe(panelSpecifications.dimensions);
    expect(publishedView(parsePublishedProduct(product)).panelSpecifications).toBeUndefined();
    expect(() => parsePublishedProduct({ ...product, panelSpecifications: { supplierId: 'private' } })).toThrow();
    expect(() => parsePublishedProduct({ ...product, category: 'Inverters', panelSpecifications })).toThrow();
    expect(() => parsePublishedProduct({ ...product, panelSpecifications, createdBy: 'private' })).toThrow();
  });
});
