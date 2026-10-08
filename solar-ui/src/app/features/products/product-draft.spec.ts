import { describe, expect, it } from 'vitest';
import { emptyProductInput, normalizePreviewSku, parsePreviewPrice, productListReturnUrl, validateProductInput } from './product-draft';

describe('new-product preview input', () => {
  const input = { ...emptyProductInput(), sku: ' new-panel ', name: ' New panel ' };
  it('requires SKU/name but permits incomplete draft content', () => {
    expect(validateProductInput(emptyProductInput(), [])).toHaveProperty('sku');
    expect(validateProductInput(emptyProductInput(), [])).toHaveProperty('name');
    expect(validateProductInput(input, [])).toEqual({});
  });
  it('normalizes SKU and checks exact case-insensitive uniqueness', () => {
    expect(normalizePreviewSku(' osd-620n-bf ')).toBe('OSD-620N-BF');
    expect(validateProductInput(input, ['NEW-PANEL'])).toHaveProperty('sku');
    expect(validateProductInput(input, ['NEW-PANEL-2'])).toEqual({});
    for (const sku of ['bad sku', '-invalid', 'a'.repeat(65), '<script>']) expect(validateProductInput({ ...input, sku }, [])).toHaveProperty('sku');
  });
  it('converts decimal strings exactly into PHP centavos and keeps blank unpriced', () => {
    expect(parsePreviewPrice(' 6450.50 ')).toEqual({ currency: 'PHP', amountMinor: 645050 });
    expect(parsePreviewPrice('0.01')?.amountMinor).toBe(1);
    expect(parsePreviewPrice('0')?.amountMinor).toBe(0);
    expect(parsePreviewPrice('1.2')?.amountMinor).toBe(120);
    expect(parsePreviewPrice('')).toBeNull();
  });
  it('rejects negative, fractional-cent, comma, exponent and unbounded prices', () => {
    for (const priceText of ['-1', '1.001', '6,450', '1e3', 'Infinity', '9007199254740991', '.5', '12.']) {
      expect(parsePreviewPrice(priceText)).toBeNull();
      expect(validateProductInput({ ...input, priceText }, [])).toHaveProperty('priceText');
    }
  });
  it('validates optional category/unit and text bounds instead of inventing defaults', () => {
    expect(validateProductInput({ ...input, category: 'Panels', unitCode: 'panel' }, [])).toEqual({});
    const errors = validateProductInput({ ...input, name: 'a'.repeat(161), brand: 'a'.repeat(81), category: 'unknown', unitCode: 'box', description: 'a'.repeat(4001) }, []);
    expect(Object.keys(errors).sort()).toEqual(['brand', 'category', 'description', 'name', 'unitCode']);
  });
  it('permits only local product-list return destinations', () => {
    expect(productListReturnUrl('/admin/products?brand=SRNE&size=5')).toBe('/admin/products?brand=SRNE&size=5');
    for (const value of [null, 'https://evil.test', '//evil.test', '/catalog', '/admin/products/new', '/admin/products#anything', '/admin/products?' + 'x'.repeat(2001)]) expect(productListReturnUrl(value)).toBe('/admin/products');
  });
});
