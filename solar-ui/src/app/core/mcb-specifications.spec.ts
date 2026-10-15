import { describe, expect, it } from 'vitest';
import { parseMcbAmperage, validMcbSpecifications, validAtsSpecifications, validProtectionFields } from './mcb-specifications';

describe('MCB specifications', () => {
  it('parses complete decimal amperage strings without accepting partial numbers', () => {
    expect(parseMcbAmperage('0.5')).toBe(0.5);
    expect(parseMcbAmperage(' 16.25 ')).toBe(16.25);
    expect(parseMcbAmperage(String(Number.MAX_SAFE_INTEGER))).toBe(Number.MAX_SAFE_INTEGER);
    for (const value of ['', '0', '-1', 'NaN', 'Infinity', '16A', '16.5oops', '0x10', '9007199254740992'])
      expect(parseMcbAmperage(value), value).toBeNull();
  });

  it('requires exact AC/DC and positive finite safe-range specification keys', () => {
    expect(validMcbSpecifications({ type: 'DC', amperage: 0.125 })).toBe(true);
    for (const value of [
      { type: 'AC', amperage: 0 }, { type: 'AC', amperage: Infinity },
      { type: 'AC', amperage: Number.MAX_SAFE_INTEGER + 1 }, { type: 'ac', amperage: 1 },
      { type: 'AC', amperage: 1, extra: true }, { type: 'DC' },
    ]) expect(validMcbSpecifications(value)).toBe(false);
  });

  it('requires category-specific ratings and rejects removed Protection on new writes', () => {
    expect(validProtectionFields({ category: 'Panels' })).toBe(true);
    expect(validProtectionFields({ category: 'Protection' })).toBe(false);
    expect(validProtectionFields({ category: 'Protection', protectionType: null, mcbSpecifications: null }, true)).toBe(true);
    expect(validProtectionFields({ category: 'Circuit breakers', protectionType: 'MCB', mcbSpecifications: { type: 'AC', amperage: 16.5 } })).toBe(true);
    expect(validProtectionFields({ category: 'Protection', protectionType: 'ATS' })).toBe(false);
    expect(validProtectionFields({ category: 'ATS', protectionType: 'ATS', atsSpecifications: { amperage: 63 }, mcbSpecifications: null })).toBe(true);
    expect(validProtectionFields({ category: 'Protection', protectionType: 'ATS', mcbSpecifications: { type: 'AC', amperage: 16 } })).toBe(false);
    expect(validProtectionFields({ category: 'Inverters', protectionType: 'ATS' })).toBe(false);
    expect(validProtectionFields({ category: 'Protection', protectionType: 'MCB' })).toBe(false);
    expect(validProtectionFields({ category: 'Inverters', protectionType: 'MCB', mcbSpecifications: { type: 'DC', amperage: 1 } })).toBe(false);
    expect(validProtectionFields({ category: 'Protection', protectionType: null, mcbSpecifications: { type: 'DC', amperage: 1 } })).toBe(false);
  });

  it('requires one exact numeric ATS amperage, tolerating only missing/null legacy ratings on reads', () => {
    for (const amperage of [0.5, 63, Number.MAX_SAFE_INTEGER])
      expect(validAtsSpecifications({ amperage })).toBe(true);
    for (const value of [null, {}, { amperage: '63' }, { amperage: 0 }, { amperage: -1 }, { amperage: NaN },
      { amperage: Infinity }, { amperage: Number.MAX_SAFE_INTEGER + 1 }, { amperage: 63, type: 'AC' }]) {
      expect(validAtsSpecifications(value)).toBe(false);
    }
    const ats = { category: 'ATS', protectionType: 'ATS' };
    expect(validProtectionFields(ats, true)).toBe(true);
    expect(validProtectionFields({ ...ats, atsSpecifications: null }, true)).toBe(true);
    expect(validProtectionFields({ ...ats, atsSpecifications: null })).toBe(false);
    expect(validProtectionFields({ ...ats, atsSpecifications: undefined }, true)).toBe(false);
    expect(validProtectionFields({ ...ats, atsSpecifications: { amperage: 0 } }, true)).toBe(false);
    expect(validProtectionFields({ ...ats, atsSpecifications: { amperage: 0.5 } })).toBe(true);
    for (const protectionType of [null, 'MCB'])
      expect(validProtectionFields({ category: 'Protection', protectionType, mcbSpecifications: { type: 'AC', amperage: 16 }, atsSpecifications: { amperage: 63 } })).toBe(false);
    expect(validProtectionFields({ ...ats, category: 'Panels', atsSpecifications: { amperage: 63 } }, true)).toBe(false);
  });

  it('derives required form ratings from top-level categories, not an optional subtype', () => {
    expect(validProtectionFields({ category: 'Circuit breakers' })).toBe(false);
    expect(validProtectionFields({ category: 'Circuit breakers', mcbSpecifications: { type: 'AC', amperage: 32 } })).toBe(true);
    expect(validProtectionFields({ category: 'ATS' })).toBe(false);
    expect(validProtectionFields({ category: 'ATS', atsSpecifications: { amperage: 63 } })).toBe(true);
    expect(validProtectionFields({ category: 'ATS', protectionType: 'MCB', atsSpecifications: { amperage: 63 } })).toBe(false);
    expect(validProtectionFields({ category: 'Surge Protection Device' })).toBe(true);
    expect(validProtectionFields({ category: 'Surge Protection Device', mcbSpecifications: { type: 'AC', amperage: 32 } })).toBe(false);
    expect(validProtectionFields({ category: 'Protection', protectionType: 'MCB', mcbSpecifications: { type: 'DC', amperage: 16 } }, true)).toBe(true);
  });
});
