import { describe, expect, it } from 'vitest';
import { PRODUCTS } from './demo-data';
import { includedVat, unitPrice } from './pricing';

describe('sample pricing', () => {
  it('applies the cheapest eligible tier at its exact quantity threshold', () => {
    expect(unitPrice(PRODUCTS[0], 30)).toBe(6450);
    expect(unitPrice(PRODUCTS[0], 31)).toBe(5890);
    expect(unitPrice(PRODUCTS[0], 620)).toBe(5350);
  });
  it('extracts included VAT without adding it to the quoted total', () => {
    expect(includedVat(112)).toBe(12);
    expect(includedVat(6450)).toBe(691.07);
    expect(includedVat(0)).toBe(0);
  });
});
