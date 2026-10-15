import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BuilderInputError, evaluateSharedBatteryVoltage, evaluateUnassignedInverters,
  normalizeBankVoltage, normalizeInverterVoltages } from '../src/builder/rules.js';
import type { BankVoltageInput, ReviewedVoltageFact } from '../src/builder/rules.js';

const row = (id: string, volts: readonly number[] | null, bankId: string | null = 'main', quantity = 1) =>
  ({ id, bankId, supportedBatteryVoltageClassesV: volts, quantity });
const input = (rows: BankVoltageInput['rows'], nominalVoltageV: number | null = 48): BankVoltageInput =>
  ({ bank: { id: 'main', nominalVoltageV }, rows });
const fact = (value: unknown, verification: ReviewedVoltageFact['verification'] = 'verified'): ReviewedVoltageFact =>
  ({ value, verification, sourceReference: 'synthetic-test-source', reviewedAt: '2026-10-11T00:00:00.000Z' });

test('voltage checks are exact, scoped and quantity independent', () => {
  const selected = input([row('i1', [48], 'main', 2), row('i2', [24], 'garage'), row('i3', [24, 48, 48])]);
  const before = structuredClone(selected);
  const check = evaluateSharedBatteryVoltage(selected);
  assert.equal(check.state, 'passed'); assert.equal(check.scopeId, 'main');
  assert.deepEqual(check.affectedRowIds, ['i1', 'i3']); assert.deepEqual(selected, before);
  assert.equal(evaluateSharedBatteryVoltage(input([row('i1', [47.999])])).state, 'incompatible');
  assert.equal(evaluateSharedBatteryVoltage(input([row('i1', [48])], 48.001)).state, 'incompatible');
});
test('known mismatch takes precedence over another unknown row without hiding missing facts', () => {
  const check = evaluateSharedBatteryVoltage(input([row('bad', [24]), row('missing', null)]));
  assert.equal(check.state, 'incompatible'); assert.equal(check.reasonCode, 'battery-voltage-mismatch');
  assert.deepEqual(check.affectedRowIds, ['bad']);
  assert.deepEqual(check.missingFacts, ['rows.missing.supportedBatteryVoltageClassesV']);
});
test('missing bank, missing inverter and empty scopes have distinct reasons', () => {
  assert.equal(evaluateSharedBatteryVoltage(input([row('i1', [48])], null)).reasonCode, 'unknown-bank-voltage');
  assert.equal(evaluateSharedBatteryVoltage(input([row('i1', null)])).reasonCode, 'unknown-inverter-voltage');
  assert.equal(evaluateSharedBatteryVoltage(input([row('i1', [24], 'elsewhere')])).state, 'not-applicable');
});
test('unassigned rows stay unknown alongside independently scoped results', () => {
  const rows = [row('unassigned', [24], null), row('known', [48])];
  const check = evaluateUnassignedInverters(rows);
  assert.equal(check?.reasonCode, 'unknown-assignment'); assert.equal(check?.state, 'unknown');
  assert.deepEqual(check?.missingFacts, ['rows.unassigned.bankId']);
  assert.deepEqual(check?.affectedRowIds, ['unassigned']);
  assert.equal(evaluateSharedBatteryVoltage(input(rows)).state, 'passed');
  assert.equal(evaluateUnassignedInverters([row('known', [48])]), null);
});
test('unreviewed/conflicting facts and display strings cannot become known ratings', () => {
  for (const verification of ['unverified', 'conflicting'] as const) {
    assert.equal(normalizeBankVoltage(fact(48, verification)), null);
    assert.equal(normalizeInverterVoltages(fact([48], verification)), null);
  }
  assert.equal(normalizeBankVoltage(fact('48 V')), null);
  assert.equal(normalizeInverterVoltages(fact('24/48 V')), null);
  assert.equal(normalizeInverterVoltages({ ...fact([48]), sourceReference: '' }), null);
  assert.equal(normalizeBankVoltage({ ...fact(48), reviewedAt: 'yesterday' }), null);
  assert.equal(normalizeBankVoltage(null), null);
  assert.equal(normalizeBankVoltage(fact(48)), 48);
  assert.deepEqual(normalizeInverterVoltages(fact([24, 48, 48])), [24, 48]);
});
test('invalid technical values remain unknown, not silently dropped from a supported set', () => {
  for (const value of [[], [48, 0], [48, '24'], [NaN], [Infinity], [-24], Array(33).fill(48)]) {
    assert.equal(normalizeInverterVoltages(fact(value)), null);
    assert.equal(evaluateSharedBatteryVoltage({ bank: { id: 'main', nominalVoltageV: 48 },
      rows: [{ ...row('i1', null), supportedBatteryVoltageClassesV: value }] }).state, 'unknown');
  }
  const sparse = Array<number>(2); sparse[0] = 48;
  assert.equal(normalizeInverterVoltages(fact(sparse)), null);
  assert.throws(() => evaluateSharedBatteryVoltage({ bank: { id: 'main', nominalVoltageV: 48 }, rows: Array(1) }), BuilderInputError);
  for (const value of [0, -48, Infinity, NaN, '48 V']) {
    assert.equal(normalizeBankVoltage(fact(value)), null);
    assert.equal(evaluateSharedBatteryVoltage({ bank: { id: 'main', nominalVoltageV: value }, rows: [row('i1', [48])] }).state, 'unknown');
  }
});
test('identity/quantity structure is rejected and bounded, never coerced', () => {
  for (const quantity of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => evaluateSharedBatteryVoltage(input([row('i1', [48], 'main', quantity)])), BuilderInputError);
  }
  for (const value of [null, {}, { ...input([]), pass: true }, input([row('same', [48]), row('same', [24])]),
    input([row('unsafe.id', [48])]), input(Array.from({ length: 201 }, (_, i) => row(`i${i}`, [48]))),
    { bank: { id: '' }, rows: [] }, { bank: { id: 'main' }, rows: [{ id: 'i1', quantity: 1 }] }]) {
    assert.throws(() => evaluateSharedBatteryVoltage(value), BuilderInputError);
  }
  assert.equal(evaluateSharedBatteryVoltage(input([row('i1', [48], 'main', Number.MAX_SAFE_INTEGER)])).state, 'passed');
});
test('fresh evaluation reflects changed facts, without cached pass or snapshot', () => {
  const original = input([row('i1', [48])]);
  const first = evaluateSharedBatteryVoltage(original);
  const changed = evaluateSharedBatteryVoltage(input([row('i1', [24])]));
  assert.equal(first.state, 'passed'); assert.equal(changed.state, 'incompatible');
  assert.equal(first.ruleVersion, changed.ruleVersion);
  assert.equal(evaluateSharedBatteryVoltage(input([row('i1', null)])).state, 'unknown');
});
