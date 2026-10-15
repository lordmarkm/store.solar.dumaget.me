import type { Category } from '../models';
import type { ProjectDetails, ManualEstimate } from './project.models';
import type { EntityId, Money, ProductReference } from './shared.models';
import { isPlanningQuantity } from './shared.models';

export type BuilderGroupId = 'panels' | 'inverters' | 'batteries' | 'mounting' | 'protection' | 'cables' | 'other';
export interface BuilderCategoryDefinition {
  readonly id: BuilderGroupId;
  readonly label: string;
  readonly catalogCategories: readonly Category[];
}
/** Empty mappings mean free-text only for now, not an all-products API filter. */
export const BUILDER_CATEGORIES: readonly BuilderCategoryDefinition[] = [
  { id: 'panels', label: 'Solar panels', catalogCategories: ['Panels'] },
  { id: 'inverters', label: 'Inverters', catalogCategories: ['Inverters'] },
  { id: 'batteries', label: 'Batteries', catalogCategories: ['Batteries'] },
  { id: 'mounting', label: 'Mounting', catalogCategories: ['Mounting'] },
  { id: 'protection', label: 'Electrical protection', catalogCategories: ['Circuit breakers', 'Surge Protection Device', 'ATS', 'PV Isolator', 'MCCB'] },
  { id: 'cables', label: 'Cables & connectors', catalogCategories: [] },
  { id: 'other', label: 'Other', catalogCategories: [] },
];
export interface BuilderRequirements {
  readonly project: ProjectDetails;
  readonly equipmentBudget: Money | null;
  /** Planning target, not calculated production/yield or inverter output. */
  readonly panelNameplateTargetW: number | null;
  readonly dailyEnergyUseWh: number | null;
  readonly backupDurationHours: number | null;
}
interface BuilderRowBase {
  readonly id: EntityId;
  readonly groupId: BuilderGroupId;
  readonly quantity: number;
  readonly selected: boolean;
  readonly bankId: EntityId | null;
  readonly notes: string;
}
export interface BuilderStoreRow extends BuilderRowBase {
  readonly kind: 'store-product';
  readonly product: ProductReference;
}
export interface BuilderFreeTextRow extends BuilderRowBase {
  readonly kind: 'free-text';
  readonly title: string;
  readonly description: string;
  readonly unit: string;
  /** Manual pricing is outside the initial builder; never imply zero. */
  readonly estimate: Extract<ManualEstimate, { readonly kind: 'unpriced' }>;
}
export type BuilderRow = BuilderStoreRow | BuilderFreeTextRow;
export type NewBuilderRow = Omit<BuilderStoreRow, 'selected'> | Omit<BuilderFreeTextRow, 'selected'>;

/** One caller-owned stable identity per invocation; never merges repeated references. */
export function createBuilderRow(input: NewBuilderRow): BuilderRow {
  if (!input.id.trim() || !isPlanningQuantity(input.quantity)) throw new Error('Enter a row identity and positive whole quantity.');
  return input.kind === 'store-product'
    ? { ...input, product: { ...input.product }, selected: true }
    : { ...input, estimate: { kind: 'unpriced' }, selected: true };
}
export function builderSelection(rows: readonly BuilderRow[]): 'all' | 'some' | 'none' {
  const count = rows.filter(row => row.selected).length;
  return count === 0 ? 'none' : count === rows.length ? 'all' : 'some';
}
export interface CompatibilityCheckResult {
  readonly ruleId: string;
  readonly ruleVersion: number;
  readonly scopeId: string;
  readonly state: 'passed' | 'incompatible' | 'unknown' | 'not-applicable';
  readonly reasonCode: string;
  readonly severity: 'error' | 'warning' | 'info';
  readonly affectedRowIds: readonly EntityId[];
  readonly missingFacts: readonly string[];
  readonly message: string;
}
/** Transient context; context changes invalidate suggestions/checks/review. */
export interface BuilderContext {
  readonly customerId: EntityId;
  readonly projectId: EntityId;
  readonly projectVersion: number;
  readonly stageVersion: number;
  readonly catalogFactFingerprint: string;
}
export interface BuilderSuggestion {
  readonly context: BuilderContext;
  readonly ruleId: string;
  readonly ruleVersion: number;
  readonly proposedRows: readonly BuilderRow[];
  readonly explanation: string;
  readonly missingFacts: readonly string[];
}
/** Local review projection, NOT an implemented API command or persisted entity. */
export interface BuilderReview {
  readonly context: BuilderContext;
  readonly requestId: string;
  readonly selectedRows: readonly BuilderRow[];
  readonly checks: readonly CompatibilityCheckResult[];
  readonly acknowledgedFindingIds: readonly string[];
}
