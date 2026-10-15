import { describe, expect, it } from 'vitest';
import { BUILDER_CATEGORIES, builderSelection, createBuilderRow, type BuilderRow, type NewBuilderRow } from '../models';

const reference = { productId: 'panel-1', variantId: null, unitCode: 'panel' } as const;
const store = (id: string): NewBuilderRow => ({ id, kind: 'store-product', groupId: 'panels', product: reference,
  quantity: 1, bankId: null, notes: '' });
describe('builder foundation contracts', () => {
  it('maps ordered groups only to supported catalog categories', () => {
    expect(BUILDER_CATEGORIES.map(group => group.id)).toEqual(['panels', 'inverters', 'batteries', 'mounting', 'protection', 'cables', 'other']);
    expect(BUILDER_CATEGORIES.flatMap(group => group.catalogCategories)).toEqual(['Panels', 'Inverters', 'Batteries', 'Mounting', 'Circuit breakers', 'Surge Protection Device', 'ATS', 'PV Isolator', 'MCCB']);
    expect(BUILDER_CATEGORIES.slice(-2).every(group => group.catalogCategories.length === 0)).toBe(true);
  });
  it('starts every independent row selected without merging repeated products', () => {
    const first = createBuilderRow(store('row1'));
    const second = createBuilderRow({ ...store('row2'), quantity: 3, notes: 'Different roof' });
    expect(first.id).not.toBe(second.id); expect(first.selected).toBe(true); expect(second.selected).toBe(true);
    expect(first.quantity).toBe(1); expect(second.quantity).toBe(3);
    expect(first.kind === 'store-product' && first.product).toEqual(reference);
    expect(second.kind === 'store-product' && second.product).toEqual(reference);
  });
  it('keeps free-text requirements unpriced with explicit units and no bank guess', () => {
    const row = createBuilderRow({ id: 'manual', kind: 'free-text', groupId: 'cables', quantity: 20,
      bankId: null, notes: '', title: 'Cable', description: 'Installer to specify', unit: 'metre', estimate: { kind: 'unpriced' } });
    expect(row.kind).toBe('free-text'); expect(row.bankId).toBeNull();
    expect(row.kind === 'free-text' && row.estimate).toEqual({ kind: 'unpriced' });
  });
  it('distinguishes all/some/none, including an empty build', () => {
    const rows: readonly BuilderRow[] = [createBuilderRow(store('one')), createBuilderRow(store('two'))];
    expect(builderSelection(rows)).toBe('all');
    expect(builderSelection([rows[0]!, { ...rows[1]!, selected: false }])).toBe('some');
    expect(builderSelection(rows.map(row => ({ ...row, selected: false })))).toBe('none');
    expect(builderSelection([])).toBe('none');
  });
  it('rejects invalid quantities/empty row identity rather than coercing them', () => {
    for (const quantity of [0, -1, 1.5, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => createBuilderRow({ ...store('one'), quantity })).toThrow();
    }
    expect(() => createBuilderRow(store(' '))).toThrow();
  });
});
