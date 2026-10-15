import { Category } from './models';
import { ProjectBomRow } from './project-bom';
import { legacyProductCategory } from './product-categories';

export interface ComponentDefinition { readonly id: string; readonly label: string; readonly addLabel: string; readonly repeatAddLabel: string; readonly category: Category | null; readonly protectionType?: 'ATS' }
export const COMPONENTS: readonly ComponentDefinition[] = [
  { id: 'inverters', label: 'Inverter', addLabel: 'Add inverter', repeatAddLabel: 'Add another inverter', category: 'Inverters' },
  { id: 'panels', label: 'Solar panels', addLabel: 'Add solar panel', repeatAddLabel: 'Add more panels', category: 'Panels' },
  { id: 'batteries', label: 'Battery', addLabel: 'Add battery', repeatAddLabel: 'Add another battery', category: 'Batteries' },
  { id: 'ats', label: 'ATS', addLabel: 'Add ATS', repeatAddLabel: 'Add another ATS', category: 'ATS', protectionType: 'ATS' },
  { id: 'mounting', label: 'Mounting', addLabel: 'Add mounting', repeatAddLabel: 'Add more mounting', category: 'Mounting' },
  { id: 'circuit-breakers', label: 'Circuit breakers', addLabel: 'Add circuit breaker', repeatAddLabel: 'Add another circuit breaker', category: 'Circuit breakers' },
  { id: 'surge-protection', label: 'Surge Protection Device', addLabel: 'Add surge protection device', repeatAddLabel: 'Add another surge protection device', category: 'Surge Protection Device' },
  { id: 'pv-isolators', label: 'PV Isolator', addLabel: 'Add PV isolator', repeatAddLabel: 'Add another PV isolator', category: 'PV Isolator' },
  { id: 'mccb', label: 'MCCB', addLabel: 'Add MCCB', repeatAddLabel: 'Add another MCCB', category: 'MCCB' },
  { id: 'other', label: 'Other requirements', addLabel: 'Add requirement', repeatAddLabel: 'Add another requirement', category: null },
];
export interface ComponentBomRow {
  readonly key: string; readonly component: ComponentDefinition; readonly required: boolean;
  readonly first: boolean; readonly line: ProjectBomRow | null; readonly ordinal: number; readonly addLabel: string;
}
export type ComponentBomTableRow = ComponentBomRow & { readonly addAction?: true };

/** Add one presentation-only footer after each populated group; never a BOM line. */
export function componentBomTableRows(rows: readonly ComponentBomRow[], editable: boolean): ComponentBomTableRow[] {
  return rows.flatMap<ComponentBomTableRow>((row, index) => {
    const lastInGroup = rows[index + 1]?.component.id !== row.component.id;
    return editable && row.line && lastInGroup
      ? [row, { ...row, key: row.component.id + '/add', first: false, line: null, ordinal: 0, addAction: true }]
      : [row];
  });
}
/** Presentation completeness only; never infers electrical compatibility or free-text categories. */
export function componentBomRows(rows: readonly ProjectBomRow[], configuration: string | null): ComponentBomRow[] {
  return COMPONENTS.flatMap<ComponentBomRow>(component => {
    const required = component.id === 'inverters' || component.id === 'ats' || component.id === 'batteries' && configuration === 'hybrid';
    const matching = rows.map((line, index) => ({ line, ordinal: index + 1 })).filter(({ line }) => {
      const protectionType = line.item.kind === 'free-text' ? line.item.componentProtectionType : line.product?.protectionType;
      const category = legacyProductCategory(line.item.kind === 'free-text' ? line.item.componentCategory : line.product?.category, protectionType);
      if (component.protectionType) return category === component.category && protectionType === component.protectionType;
      return component.category ? category === component.category : !category;
    });
    const addLabel = matching.length ? component.repeatAddLabel : component.addLabel;
    return matching.length ? matching.map(({ line, ordinal }, index) => ({ key: component.id + '/' + line.item.id, component, required, first: index === 0, line, ordinal, addLabel }))
      : [{ key: component.id + '/empty', component, required, first: true, line: null, ordinal: 0, addLabel }];
  });
}
