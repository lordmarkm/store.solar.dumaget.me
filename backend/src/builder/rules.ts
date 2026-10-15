/** Pure planning checks. Not connected to catalog/API data or electrical approval. */
export type CheckState = 'passed' | 'incompatible' | 'unknown' | 'not-applicable';
export type CheckSeverity = 'error' | 'warning' | 'info';
export interface CompatibilityCheckResult {
  readonly ruleId: string;
  readonly ruleVersion: number;
  readonly scopeId: string;
  readonly state: CheckState;
  readonly reasonCode: string;
  readonly severity: CheckSeverity;
  readonly affectedRowIds: readonly string[];
  readonly missingFacts: readonly string[];
  readonly message: string;
}
export interface BatteryBankInput {
  readonly id: string;
  readonly nominalVoltageV: number | null;
}
export interface InverterVoltageInput {
  readonly id: string;
  readonly bankId: string | null;
  readonly supportedBatteryVoltageClassesV: readonly number[] | null;
  readonly quantity: number;
}
export interface BankVoltageInput {
  readonly bank: BatteryBankInput;
  readonly rows: readonly InverterVoltageInput[];
}

/** Future server-owned source adapter input, NOT a client trust flag or published schema. */
export interface ReviewedVoltageFact {
  readonly verification: 'verified' | 'unverified' | 'conflicting';
  readonly sourceReference: string;
  readonly reviewedAt: string;
  readonly value: unknown;
}
const positive = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0;
function voltageClasses(value: unknown): readonly number[] | null {
  if (!Array.isArray(value) || !value.length || value.length > 32 || !Array.from(value).every(positive)) return null;
  return [...new Set(value as number[])];
}
function verified(fact: ReviewedVoltageFact | null): fact is ReviewedVoltageFact {
  if (!fact || fact.verification !== 'verified' || !fact.sourceReference.trim()) return false;
  const time = Date.parse(fact.reviewedAt);
  return Number.isFinite(time) && new Date(time).toISOString() === fact.reviewedAt;
}
/** Call only on facts loaded/reviewed by the server; never accept customer provenance. */
export function normalizeBankVoltage(fact: ReviewedVoltageFact | null): number | null {
  return verified(fact) && positive(fact.value) ? fact.value : null;
}
export function normalizeInverterVoltages(fact: ReviewedVoltageFact | null): readonly number[] | null {
  return verified(fact) ? voltageClasses(fact.value) : null;
}

export class BuilderInputError extends Error {
  constructor() { super('Invalid normalized builder identities or quantities.'); this.name = 'BuilderInputError'; }
}
const object = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const identity = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const allowed = (value: Record<string, unknown>, keys: readonly string[]): boolean => Object.keys(value).every(key => keys.includes(key));
function invalid(): never { throw new BuilderInputError(); }
function normalizedRows(value: unknown): readonly InverterVoltageInput[] {
  if (!Array.isArray(value) || value.length > 200) invalid();
  const seen = new Set<string>();
  return Array.from(value).map((row: unknown) => {
    if (!object(row) || !allowed(row, ['id', 'bankId', 'supportedBatteryVoltageClassesV', 'quantity'])
      || !identity(row['id']) || seen.has(row['id'])
      || (row['bankId'] !== null && !identity(row['bankId']))
      || typeof row['quantity'] !== 'number' || !Number.isSafeInteger(row['quantity']) || row['quantity'] <= 0) invalid();
    seen.add(row['id']);
    return { id: row['id'], bankId: row['bankId'], quantity: row['quantity'],
      supportedBatteryVoltageClassesV: voltageClasses(row['supportedBatteryVoltageClassesV']) };
  });
}
function normalizedInput(value: unknown): BankVoltageInput {
  if (!object(value) || !allowed(value, ['bank', 'rows']) || !object(value['bank'])
    || !allowed(value['bank'], ['id', 'nominalVoltageV']) || !identity(value['bank']['id'])) invalid();
  return { bank: { id: value['bank']['id'], nominalVoltageV: positive(value['bank']['nominalVoltageV']) ? value['bank']['nominalVoltageV'] : null },
    rows: normalizedRows(value['rows']) };
}
const RULE_ID = 'shared-battery-voltage';
const RULE_VERSION = 1;
function result(scopeId: string, state: CheckState, reasonCode: string, severity: CheckSeverity,
  affectedRowIds: readonly string[], missingFacts: readonly string[], message: string): CompatibilityCheckResult {
  return { ruleId: RULE_ID, ruleVersion: RULE_VERSION, scopeId, state, reasonCode, severity, affectedRowIds, missingFacts, message };
}

/** Receives already source-reviewed normalized values, not raw product descriptions. */
export function evaluateSharedBatteryVoltage(value: unknown): CompatibilityCheckResult {
  const { bank, rows } = normalizedInput(value);
  const assigned = rows.filter(row => row.bankId === bank.id);
  const ids = assigned.map(row => row.id);
  if (!assigned.length) return result(bank.id, 'not-applicable', 'no-assigned-inverters', 'info', [], [],
    'No inverter is assigned to this bank for this check.');
  if (bank.nominalVoltageV === null) return result(bank.id, 'unknown', 'unknown-bank-voltage', 'warning', ids,
    ['bank.nominalVoltageV'], 'Battery-bank voltage is not verified. Supply a verified bank configuration.');
  const missing = assigned.filter(row => row.supportedBatteryVoltageClassesV === null);
  const missingFacts = missing.map(row => `rows.${row.id}.supportedBatteryVoltageClassesV`);
  const offending = assigned.filter(row => row.supportedBatteryVoltageClassesV !== null
    && !row.supportedBatteryVoltageClassesV.includes(bank.nominalVoltageV!));
  if (offending.length) return result(bank.id, 'incompatible', 'battery-voltage-mismatch', 'error', offending.map(row => row.id), missingFacts,
    `Inverter rows ${offending.map(row => row.id).join(', ')} do not support the ${bank.nominalVoltageV} V bank. Review the component or explicit system assignment.`);
  if (missing.length) return result(bank.id, 'unknown', 'unknown-inverter-voltage', 'warning', missing.map(row => row.id), missingFacts,
    `Supported battery voltage is missing for inverter rows ${missing.map(row => row.id).join(', ')}. Verify their published specifications.`);
  return result(bank.id, 'passed', 'battery-voltage-class-supported', 'info', ids, [],
    `Selected inverters support the stated ${bank.nominalVoltageV} V battery class. Other compatibility checks remain.`);
}

/** Keep this finding alongside individual bank results; never infer shared wiring. */
export function evaluateUnassignedInverters(value: unknown): CompatibilityCheckResult | null {
  const rows = normalizedRows(value).filter(row => row.bankId === null);
  return rows.length ? result('unassigned', 'unknown', 'unknown-assignment', 'warning', rows.map(row => row.id),
    rows.map(row => `rows.${row.id}.bankId`), 'Assign unassigned inverter rows to their intended battery banks. No shared wiring is inferred.') : null;
}

/** Local executable registry only. No runtime routes import it yet. */
export const BUILDER_RULES = [{
  id: RULE_ID, version: RULE_VERSION, status: 'implemented' as const,
  implementationPaths: ['backend/src/builder/rules.ts'],
  testPaths: ['backend/test/builder-rules.test.ts', 'backend/test/builder-rule-documentation.test.ts'],
  evaluate: evaluateSharedBatteryVoltage,
}] as const;
