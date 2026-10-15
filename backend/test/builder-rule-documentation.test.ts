import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { BUILDER_RULES } from '../src/builder/rules.js';
import type { CompatibilityCheckResult } from '../src/builder/rules.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const sections = ['Metadata', 'Intent and non-goals', 'Inputs and provenance', 'Applicability and grouping',
  'Deterministic evaluation', 'Outcomes and messages', 'Sources and evidence limits', 'Machine-readable examples',
  'Code, tests and dependencies', 'Maintenance and change history'];
const states = ['passed', 'incompatible', 'unknown', 'not-applicable'];
const statuses = ['planned', 'implemented', 'deprecated', 'retired'];
interface RegistryEntry {
  readonly id: string; readonly version: number; readonly status: string;
  readonly implementationPaths: readonly string[]; readonly testPaths: readonly string[];
  readonly evaluate: (input: unknown) => CompatibilityCheckResult;
}
interface Inventory { readonly index: unknown; readonly documents: Readonly<Record<string, string>> }
function record(value: unknown): Record<string, unknown> {
  assert.ok(value !== null && typeof value === 'object' && !Array.isArray(value), 'Expected an object');
  return value as Record<string, unknown>;
}
function strings(value: unknown): string[] {
  assert.ok(Array.isArray(value) && value.every(item => typeof item === 'string' && item.length > 0), 'Expected nonempty strings');
  const result = value as string[];
  assert.equal(new Set(result).size, result.length, 'Duplicate values'); return result;
}
function date(value: unknown, nullable = false): void {
  if (nullable && value === null) return;
  assert.ok(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value), 'Expected ISO date');
  assert.equal(new Date(value).toISOString().slice(0, 10), value);
}
function version(value: unknown): void { assert.ok(typeof value === 'number' && Number.isSafeInteger(value) && value > 0); }
function pathExists(path: string): void {
  assert.ok(/^(backend|solar-ui)\/[A-Za-z0-9_./-]+\.ts$/.test(path), `Invalid source/test path: ${path}`);
  const target = resolve(root, path);
  assert.ok(target.startsWith(root + sep) && existsSync(target) && statSync(target).isFile(), `Missing source/test file: ${path}`);
}
function section(document: string, title: string): string {
  const marker = `## ${title}\n`;
  const start = document.indexOf(marker);
  assert.ok(start >= 0, `Missing section: ${title}`);
  const rest = document.slice(start + marker.length);
  const body = rest.split('\n## ')[0]!.trim();
  assert.ok(body.length > 0, `Empty section: ${title}`); return body;
}
function jsonBlock(document: string, title: string): Record<string, unknown> {
  const match = section(document, title).match(/```json\n([\s\S]*?)\n```/);
  assert.ok(match, `Missing JSON block: ${title}`); return record(JSON.parse(match[1]!));
}
function fixtureEqual(actual: CompatibilityCheckResult, expected: Record<string, unknown>, label: string): void {
  for (const key of ['state', 'reasonCode', 'severity'] as const) assert.equal(actual[key], expected[key], `${label}: ${key}`);
  for (const key of ['affectedRowIds', 'missingFacts'] as const) {
    assert.deepEqual([...actual[key]].sort(), strings(expected[key]).sort(), `${label}: ${key}`);
  }
}
/** Consistency gate only: cannot verify manufacturer facts or installation safety. */
function validateInventory(inventory: Inventory, registry: readonly RegistryEntry[]): void {
  const index = record(inventory.index);
  assert.deepEqual(Object.keys(index).sort(), ['schemaVersion', 'purpose', 'updatedOn', 'rules'].sort());
  assert.equal(index['schemaVersion'], 1); assert.equal(index['purpose'], 'documentation-inventory-not-executable-registry'); date(index['updatedOn']);
  assert.ok(Array.isArray(index['rules']));
  const seen = new Set<string>();
  const registryIds = registry.map(rule => rule.id);
  assert.equal(new Set(registryIds).size, registryIds.length, 'Duplicate registry IDs');
  for (const raw of index['rules']) {
    const entry = record(raw);
    assert.deepEqual(Object.keys(entry).sort(), ['id', 'version', 'status', 'document', 'implementationPaths', 'testPaths'].sort());
    const id = entry['id']; assert.ok(typeof id === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id));
    assert.ok(!seen.has(id), `Duplicate rule ID: ${id}`); seen.add(id);
    version(entry['version']); assert.ok(statuses.includes(entry['status'] as string));
    assert.equal(entry['document'], `${id}.md`);
    const source = inventory.documents[`${id}.md`]; assert.ok(source, `Missing rule document: ${id}`);
    const document = source.replace(/\r\n/g, '\n');
    for (const title of sections) section(document, title);
    const metadata = jsonBlock(document, 'Metadata');
    assert.deepEqual(Object.keys(metadata).sort(), ['id', 'version', 'status', 'category', 'ownerRole', 'updatedOn',
      'implementedOn', 'verifiedOn', 'implementationPaths', 'testPaths'].sort(), 'Malformed metadata keys');
    for (const key of ['id', 'version', 'status', 'implementationPaths', 'testPaths']) assert.deepEqual(metadata[key], entry[key], `${id}: ${key} index/spec drift`);
    for (const key of ['category', 'ownerRole']) assert.ok(typeof metadata[key] === 'string' && (metadata[key] as string).trim());
    date(metadata['updatedOn']); date(metadata['implementedOn'], true); date(metadata['verifiedOn'], true);
    assert.ok(/https:\/\/[^\s)]+/.test(section(document, 'Sources and evidence limits')), `${id}: missing evidence references`);
    // Local dependent-rule links must resolve to a documented record (template/index are not rules).
    for (const link of document.matchAll(/\]\(([a-z0-9-]+\.md)(?:#[^)]*)?\)/g)) {
      assert.ok(inventory.documents[link[1]!], `${id}: missing dependent rule document ${link[1]}`);
    }
    const paths = strings(entry['implementationPaths']); const tests = strings(entry['testPaths']);
    if (entry['status'] === 'planned') {
      assert.deepEqual(paths, []); assert.deepEqual(tests, []); assert.equal(metadata['implementedOn'], null);
    }
    const executable = registry.find(rule => rule.id === id);
    if (entry['status'] === 'implemented') {
      assert.ok(executable, `${id}: implemented rule lacks registry entry`);
      assert.ok(paths.length && tests.length && metadata['implementedOn'] !== null);
      for (const path of [...paths, ...tests]) pathExists(path);
      assert.equal(executable.version, entry['version'], `${id}: registry version drift`);
      assert.equal(executable.status, entry['status'], `${id}: registry status drift`);
      assert.deepEqual(executable.implementationPaths, paths); assert.deepEqual(executable.testPaths, tests);
    } else if (executable) {
      assert.equal(executable.status, entry['status'], `${id}: undocumented active validator`);
    }
    const examples = jsonBlock(document, 'Machine-readable examples');
    assert.deepEqual(Object.keys(examples).sort(), ['fixtureSchemaVersion', 'cases'].sort());
    assert.equal(examples['fixtureSchemaVersion'], 1); assert.ok(Array.isArray(examples['cases']) && examples['cases'].length);
    const cases = new Set<string>(); const covered = new Set<string>();
    for (const rawCase of examples['cases']) {
      const fixture = record(rawCase); const caseId = fixture['id'];
      assert.deepEqual(Object.keys(fixture).sort(), ['id', 'input', 'expected'].sort());
      assert.ok(typeof caseId === 'string' && caseId.length > 0 && !cases.has(caseId), `${id}: duplicate/invalid fixture ID`); cases.add(caseId);
      record(fixture['input']); const expected = record(fixture['expected']);
      assert.deepEqual(Object.keys(expected).sort(), ['state', 'reasonCode', 'severity', 'affectedRowIds', 'missingFacts'].sort());
      assert.ok(states.includes(expected['state'] as string)); assert.ok(['error', 'warning', 'info'].includes(expected['severity'] as string));
      assert.ok(typeof expected['reasonCode'] === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(expected['reasonCode']));
      strings(expected['affectedRowIds']); strings(expected['missingFacts']); covered.add(expected['state'] as string);
      if (entry['status'] === 'implemented') {
        const check = executable!.evaluate(fixture['input']);
        assert.equal(check.ruleId, id); assert.equal(check.ruleVersion, entry['version']);
        assert.ok(check.scopeId && check.message); fixtureEqual(check, expected, `${id}/${caseId}`);
      }
    }
    const outcomes = [...section(document, 'Outcomes and messages').matchAll(/^\| (passed|incompatible|unknown|not-applicable) \|/gm)].map(match => match[1]!);
    assert.ok(outcomes.length, `${id}: missing documented outcomes`);
    for (const state of new Set(outcomes)) assert.ok(covered.has(state), `${id}: missing ${state} fixture`);
  }
  for (const rule of registry) assert.ok(seen.has(rule.id), `Undocumented validator: ${rule.id}`);
}
function inventory(): Inventory {
  const index: unknown = JSON.parse(readFileSync(resolve(root, 'docs/builder-rules/index.json'), 'utf8'));
  const documents: Record<string, string> = {};
  for (const raw of record(index)['rules'] as unknown[]) {
    const path = record(raw)['document']; assert.ok(typeof path === 'string' && /^[a-z0-9-]+\.md$/.test(path));
    documents[path] = readFileSync(resolve(root, 'docs/builder-rules', path), 'utf8');
  }
  return { index, documents };
}
test('builder rule registry, metadata, paths and every documented fixture agree', () => validateInventory(inventory(), BUILDER_RULES));
test('documentation gate rejects index/registry drift and duplicate identities', () => {
  const source = inventory(); const index = record(structuredClone(source.index));
  const rules = index['rules'] as Record<string, unknown>[];
  rules[0]!['version'] = 2;
  assert.throws(() => validateInventory({ ...source, index }, BUILDER_RULES), /drift/);
  rules[0]!['version'] = 1; rules.push(structuredClone(rules[0]!));
  assert.throws(() => validateInventory({ ...source, index }, BUILDER_RULES), /Duplicate rule/);
  assert.throws(() => validateInventory(source, [{ ...BUILDER_RULES[0], version: 2 }]), /version drift/);
  assert.throws(() => validateInventory(source, [BUILDER_RULES[0], BUILDER_RULES[0]]), /Duplicate registry/);
  assert.throws(() => validateInventory(source, []), /lacks registry/);
});
test('documentation gate rejects missing sections, evidence, paths and dependent docs', () => {
  const source = inventory(); const name = 'shared-battery-voltage.md'; const original = source.documents[name]!;
  const check = (document: string) => validateInventory({ ...source, documents: { [name]: document } }, BUILDER_RULES);
  assert.throws(() => check(original.replace('## Inputs and provenance', '## Wrong title')), /Missing section/);
  assert.throws(() => check(original.replace(/https:\/\/[^\s)]+/g, 'removed')), /evidence/);
  assert.throws(() => check(original + '\n[Missing dependency](missing-rule.md)\n'), /dependent rule/);
  assert.throws(() => pathExists('backend/src/builder/nonexistent.ts'), /Missing source/);
  assert.throws(() => pathExists('backend/../../../outside.ts'), /Missing source|Invalid/);
});
test('documentation gate executes fixture IDs, detects duplicates and fails contradictory expectations', () => {
  const source = inventory(); const name = 'shared-battery-voltage.md'; const original = source.documents[name]!;
  const examples = jsonBlock(original.replace(/\r\n/g, '\n'), 'Machine-readable examples');
  const cases = examples['cases'] as Record<string, unknown>[];
  const replace = () => original.replace(/(## Machine-readable examples[\s\S]*?```json\r?\n)[\s\S]*?(\r?\n```)/,
    (_match, before: string, after: string) => before + JSON.stringify(examples, null, 2) + after);
  record(cases[0]!['expected'])['reasonCode'] = 'wrong-reason';
  assert.throws(() => validateInventory({ ...source, documents: { [name]: replace() } }, BUILDER_RULES), /matching-48v-bank.*reasonCode/);
  record(cases[0]!['expected'])['reasonCode'] = 'battery-voltage-class-supported';
  cases.push(structuredClone(cases[0]!));
  assert.throws(() => validateInventory({ ...source, documents: { [name]: replace() } }, BUILDER_RULES), /fixture ID/);
});
