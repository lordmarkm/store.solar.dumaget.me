import { describe, expect, it } from 'vitest';
import { componentBomRows, componentBomTableRows } from './component-bom';
import { PRODUCTS } from './demo-data';
import { projectBomRow } from './project-bom';
import type { BomItem, Product } from './models';

const row = (id: string, product: Product) => projectBomRow({ id, kind: 'store-product', product: { productId: product.id, variantId: null, unitCode: product.unit }, quantity: 1, createdAt: '', updatedAt: '' } as BomItem, [product]);
const freeText = (id: string, title: string, componentCategory?: Extract<BomItem, { kind: 'free-text' }>['componentCategory']) => projectBomRow({ id, kind: 'free-text', ...(componentCategory ? { componentCategory } : {}), title, description: '', unit: 'unit', quantity: 1, notes: '', estimate: { kind: 'unpriced' }, createdAt: '', updatedAt: '' } as BomItem);
const componentCases = [
  { id: 'inverters', category: 'Inverters', label: 'Add another inverter', initial: 'Add inverter' },
  { id: 'panels', category: 'Panels', label: 'Add more panels', initial: 'Add solar panel' },
  { id: 'batteries', category: 'Batteries', label: 'Add another battery', initial: 'Add battery' },
  { id: 'mounting', category: 'Mounting', label: 'Add more mounting', initial: 'Add mounting' },
  { id: 'circuit-breakers', category: 'Circuit breakers', label: 'Add another circuit breaker', initial: 'Add circuit breaker' },
  { id: 'surge-protection', category: 'Surge Protection Device', label: 'Add another surge protection device', initial: 'Add surge protection device' },
  { id: 'pv-isolators', category: 'PV Isolator', label: 'Add another PV isolator', initial: 'Add PV isolator' },
  { id: 'mccb', category: 'MCCB', label: 'Add another MCCB', initial: 'Add MCCB' },
  { id: 'other', category: null, label: 'Add another requirement', initial: 'Add requirement' },
] as const;
describe('component BOM presentation completeness', () => {
  it('places one repeat Add footer after all lines of each populated group', () => {
    const inverter = PRODUCTS.find(product => product.category === 'Inverters')!;
    const grouped = componentBomRows([row('inv-1', inverter), freeText('inv-2', 'Owner inverter', 'Inverters'), freeText('other', 'Site work')], 'hybrid');
    const table = componentBomTableRows(grouped, true);
    const inverters = table.filter(entry => entry.component.id === 'inverters');
    expect(inverters.map(entry => entry.line?.item.id ?? 'add')).toEqual(['inv-1', 'inv-2', 'add']);
    expect(inverters.at(-1)).toMatchObject({ addAction: true, first: false, line: null, addLabel: 'Add another inverter' });
    expect(table.filter(entry => entry.addAction)).toHaveLength(2);
    expect(table.filter(entry => entry.component.id === 'panels')).toMatchObject([{ first: true, line: null, addLabel: 'Add solar panel' }]);
    expect(new Set(table.map(entry => entry.key)).size).toBe(table.length);
    expect(grouped.filter(entry => entry.line)).toHaveLength(3);
  });
  it('does not add footer rows to empty or read-only groups', () => {
    const empty = componentBomRows([], 'hybrid');
    expect(componentBomTableRows(empty, true)).toEqual(empty);
    const grouped = componentBomRows([freeText('other', 'Site work')], 'hybrid');
    expect(componentBomTableRows(grouped, false)).toEqual(grouped);
  });
  it.each(['hybrid', 'grid-tied', 'off-grid', 'undecided'])('requires an inverter for %s', configuration => {
    const rows = componentBomRows([], configuration);
    expect(rows.find(row => row.component.id === 'inverters')).toMatchObject({ required: true, line: null, addLabel: 'Add inverter' });
    expect(rows.find(row => row.component.id === 'batteries')?.required).toBe(configuration === 'hybrid');
    expect(rows.find(row => row.component.id === 'ats')).toMatchObject({ required: true, line: null, addLabel: 'Add ATS' });
  });
  it.each(componentCases)('$id uses its populated label and restores its empty label after the last line is removed', testCase => {
    const item = testCase.id === 'other'
      ? freeText('line', 'Unclassified requirement')
      : row('line', { ...PRODUCTS[0], category: testCase.category });
    const populated = componentBomRows([item], 'hybrid').filter(result => result.component.id === testCase.id);
    expect(populated.map(result => result.addLabel)).toEqual([testCase.label]);
    const afterRemoval = componentBomRows([], 'hybrid').filter(result => result.component.id === testCase.id);
    expect(afterRemoval).toMatchObject([{ line: null, addLabel: testCase.initial }]);
  });
  it('groups typed catalog and free-text ATS separately from other protection without title inference', () => {
    const protection = { ...PRODUCTS[0], category: 'Circuit breakers' as const, protectionType: 'MCB' as const, mcbSpecifications: { type: 'AC' as const, amperage: 32 } };
    const ats = { ...PRODUCTS[0], category: 'ATS' as const, protectionType: 'ATS' as const, atsSpecifications: { amperage: 63 } };
    const text = projectBomRow({ id: 'text-ats', kind: 'free-text', title: 'Owner supplied switch', description: '', unit: 'unit', quantity: 1,
      componentCategory: 'Protection', componentProtectionType: 'ATS', amperage: 100, estimate: { kind: 'unpriced' }, createdAt: '', updatedAt: '' } as BomItem);
    const grouped = componentBomRows([row('catalog-ats', ats), text, row('mcb', protection), freeText('untyped', 'ATS', 'Protection')], 'grid-tied');
    expect(grouped.filter(entry => entry.component.id === 'ats').map(entry => entry.line?.item.id)).toEqual(['catalog-ats', 'text-ats']);
    expect(grouped.filter(entry => entry.component.id === 'circuit-breakers').map(entry => entry.line?.item.id)).toEqual(['mcb']);
    expect(grouped.filter(entry => entry.component.id === 'other').map(entry => entry.line?.item.id)).toEqual(['untyped']);
    const table = componentBomTableRows(grouped, true);
    expect(table.filter(entry => entry.component.id === 'ats').at(-1)).toMatchObject({ addAction: true, required: true, addLabel: 'Add another ATS' });
    expect(componentBomRows([], 'grid-tied').find(entry => entry.component.id === 'ats')?.addLabel).toBe('Add ATS');
  });
  it('keeps repeat labels and independent lines for multiple components and categorized free text', () => {
    const inverter = PRODUCTS.find(product => product.category === 'Inverters')!;
    const panel = PRODUCTS.find(product => product.category === 'Panels')!;
    const rows = componentBomRows([
      row('inv-1', inverter), row('panel', panel), freeText('inv-free', 'Owner supplied inverter', 'Inverters'),
      row('inv-2', inverter), freeText('other', 'Site requirement'),
    ], 'hybrid');
    const inverters = rows.filter(result => result.component.id === 'inverters');
    expect(inverters.map(result => result.line?.item.id)).toEqual(['inv-1', 'inv-free', 'inv-2']);
    expect(inverters.map(result => result.addLabel)).toEqual(Array(3).fill('Add another inverter'));
    expect(inverters.map(result => result.first)).toEqual([true, false, false]);
    expect(rows.filter(result => result.component.id === 'panels')).toMatchObject([{ line: { item: { id: 'panel' } }, addLabel: 'Add more panels' }]);
    expect(rows.filter(result => result.component.id === 'other').map(result => result.line?.item.id)).toEqual(['other']);
    expect(rows.find(result => result.component.id === 'other')?.addLabel).toBe('Add another requirement');
    expect(new Set(rows.filter(result => result.line).map(result => result.key)).size).toBe(5);
  });
  it('never counts free text or an unavailable product named inverter as an inverter', () => {
    const unknown = projectBomRow({ id: 'unknown', kind: 'store-product', product: { productId: 'inverter', variantId: null, unitCode: 'unit' }, quantity: 2, createdAt: '', updatedAt: '' } as BomItem);
    const free = projectBomRow({ id: 'free', kind: 'free-text', title: 'inverter', description: '', unit: 'unit', quantity: 1, notes: '', estimate: { kind: 'unpriced' }, createdAt: '', updatedAt: '' } as BomItem);
    const rows = componentBomRows([unknown, free], 'hybrid');
    expect(rows.filter(row => row.component.id === 'other').map(row => row.line?.item.id)).toEqual(['unknown', 'free']);
    expect(rows.filter(row => row.component.id === 'inverters')).toMatchObject([{ line: null, addLabel: 'Add inverter' }]);
    expect(rows.find(row => row.component.id === 'batteries')?.line).toBeNull();
  });
  it('counts explicitly categorized free text in its selected group and leaves legacy lines in Other', () => {
    const categorized = freeText('typed-inverter', 'Inverter supplied by owner', 'Inverters');
    const legacy = freeText('legacy', 'Battery');
    const rows = componentBomRows([categorized, legacy], 'hybrid');
    expect(rows.filter(row => row.component.id === 'inverters').map(row => row.line?.item.id)).toEqual(['typed-inverter']);
    expect(rows.filter(row => row.component.id === 'other').map(row => row.line?.item.id)).toEqual(['legacy']);
    expect(rows.find(row => row.component.id === 'inverters')).toMatchObject({ required: true, line: { item: { kind: 'free-text', componentCategory: 'Inverters' } } });
  });
});
