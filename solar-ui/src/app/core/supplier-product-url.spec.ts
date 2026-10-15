import { describe, expect, it } from 'vitest';
import { normalizeSupplierProductUrl, supplierProductUrlError } from './supplier-product-url';

describe('supplier product URL', () => {
  it('allows blank optional links and requires a Shopee link for the normalized Shopee supplier', () => {
    expect(supplierProductUrlError('', 'Other Supplier')).toBeNull();
    expect(supplierProductUrlError('  ', ' SHopee ')).toContain('Shopee product URL');
    expect(supplierProductUrlError('https://shopee.ph/product/1', ' SHopee ')).toBeNull();
    expect(supplierProductUrlError('https://seller.shopee.ph/product/1', 'shopee')).toBeNull();
    expect(supplierProductUrlError('https://not-shopee.ph/product/1', 'shopee')).toContain('shopee.ph');
  });

  it('rejects insecure URLs, credentials, nondefault ports, controls, lone surrogates, whitespace, backslashes, and overlong raw values', () => {
    const valid = 'https://example.com/p';
    for (const value of ['http://example.com/p', 'https://user:pass@example.com/p', 'https://example.com:444/p', 'https://example.com/\n', 'https://example.com/\ud800', `https://example.com/${'a'.repeat(2040)}`, 'https://example.com/a b', 'https://example.com\\p', `${' '.repeat(2049 - valid.length)}${valid}`]) {
      expect(supplierProductUrlError(value)).not.toBeNull();
    }
    expect(supplierProductUrlError('https://example.com:443/p')).toBeNull();
  });

  it('trims only the outside of a supplier URL and preserves its full query', () => {
    const value = '  https://shop.example/item?x=a%2Fb&redirect=https%3A%2F%2Fexample.com%2Fp%3Fq%3Done  ';
    expect(normalizeSupplierProductUrl(value)).toBe('https://shop.example/item?x=a%2Fb&redirect=https%3A%2F%2Fexample.com%2Fp%3Fq%3Done');
  });
});
