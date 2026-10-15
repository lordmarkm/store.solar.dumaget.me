# shared-battery-voltage: battery voltage-class agreement

## Metadata

```json
{
  "id": "shared-battery-voltage",
  "version": 1,
  "status": "implemented",
  "category": "compatibility",
  "ownerRole": "builder-maintainers",
  "updatedOn": "2026-10-11",
  "implementedOn": "2026-10-11",
  "verifiedOn": null,
  "implementationPaths": ["backend/src/builder/rules.ts"],
  "testPaths": ["backend/test/builder-rules.test.ts", "backend/test/builder-rule-documentation.test.ts"]
}
```

## Intent and non-goals

For an explicitly assigned battery bank, check that every assigned inverter
supports the bank's nominal battery voltage class. Warn about the user's example
of 48 V and 24 V inverters without assuming every inverter in a project is wired
together. With a confirmed shared bank and incompatible supported classes, report
incompatible; without assignment/specification facts, report unknown.

This is a voltage-class check only. Passing does not verify actual operating
voltage ranges, charge settings, BMS/protocol pairing, parallel operation, AC
output, string/MPPT sizing or overall electrical safety. Those need separate rules
and source-backed inputs. Nominal DC battery voltage is not AC output voltage.

## Inputs and provenance

These are implemented pure evaluator inputs, not existing persisted/public fields.
No API route imports this rule. Source/equipment applicability remains pending;
verifiedOn is deliberately null, distinct from executable fixture verification.

| Field | Type/unit | Origin | Required/allowed values | Missing or invalid behavior |
| --- | --- | --- | --- | --- |
| bank.id | Safe nonempty ID | Explicit build battery-bank assignment | One scope per evaluation | Malformed scope rejects input |
| bank.nominalVoltageV | Positive finite number, V | Verified selected bank configuration | No implicit 24/48 V default | Unknown bank-voltage fact |
| rows[].id | Stable unique staged row ID | Builder | One identity per independent row | Invalid input; no compatibility pass |
| rows[].bankId | Bank ID or null | Explicit customer assignment | Only assigned rows share a bank | Unknown grouping if unassigned |
| rows[].supportedBatteryVoltageClassesV | Nonempty set of positive finite V values or null | Verified published product fact | Exact documented supported classes | Unknown inverter-voltage fact |
| rows[].quantity | Positive safe whole number | Builder row | Within existing quantity limits | Write/input validation rejects malformed values |

Normalize typed source data before evaluation. Do not extract engineering facts
from arbitrary descriptions, model names or the text panel specifications. A
multi-voltage product may list multiple verified supported classes. Duplicates
in a supported set have no meaning; normalize them as a set. No guessed tolerance
or conversion is applied to nominal classes. Actual operating ranges remain a
separate check and must not be inferred from a nominal-class pass.

IDs use 1-128 ASCII letters/digits/underscore/hyphen, without implicit trimming.
Rows must have unique IDs and explicit bankId (ID or null); missing grouping keys,
unknown request keys, invalid quantities or >200 rows reject structural input.
Missing, malformed or nonpositive/nonfinite technical values normalize to null.
A supported set is limited to 32 entries before deduplication; one invalid member
invalidates the whole fact. Display strings are never parsed or coerced.

The isolated ReviewedVoltageFact adapter requires verification=verified, a
nonblank sourceReference and a canonical UTC reviewedAt timestamp before accepting
a positive voltage or supported set. Unverified/conflicting/source-less facts
become null. This shape check cannot authenticate a claim: the future server
adapter must load authoritative source-reviewed facts, never trust customer flags.
No provenance schema has been added to catalog storage/publication in this slice.

## Applicability and grouping

- Evaluate each explicit battery bank independently, including when it has only
  one assigned inverter. Multiple project-level inverters need not share a bank.
- Unassigned inverter rows yield an unknown-assignment finding identifying those
  rows. Do not put all components into one inferred group to manufacture an error.
- This bank check includes only rows with bankId equal to the reviewed bank ID.
  Inverters assigned elsewhere are not compared against this bank.
- A bank scope with no assigned inverter rows is not-applicable. It is not a
  statement that the project's wiring or selected bank is valid.
- Repeated rows and quantity > 1 remain separate/quantity-aware identities, but
  quantity does not change a given product's supported voltage class. Parallel
  capacity and multi-unit approval are not checked here.

## Deterministic evaluation

1. Validate normalized input structure and provenance. Malformed request identity
   or quantity is rejected by the surrounding input validator, not coerced here.
   Missing/unverified/conflicting technical facts remain unknown.
2. Partition by explicit bank assignments. Emit unknown-assignment findings for
   unassigned rows; never infer same-bank wiring from a shared category/project.
3. For one explicit bank with no assigned inverter rows, return not-applicable.
4. Without a verified bank nominal voltage, return unknown-bank-voltage.
5. For each assigned row with a verified supported set, compare the bank's nominal
   class using exact set membership. Keep the known offending row IDs.
6. If any known row does not support the bank class, return incompatible with
   battery-voltage-mismatch. Missing facts on other rows must not conceal that
   established mismatch; report those missing facts alongside the finding.
7. Otherwise, if any assigned row lacks a verified supported set, return unknown
   with unknown-inverter-voltage and its missing fact keys.
8. Otherwise return passed with battery-voltage-class-supported. This pass is
   narrowly limited to known nominal-class membership.

All result arrays are compared as sets in fixture tests. The rule dispatcher may
evaluate multiple bank scopes and unassigned findings; it must not collapse them
into a project-wide compatible result.

## Outcomes and messages

| State | Reason code | Severity | Affected rows/missing facts | Message and resolution |
| --- | --- | --- | --- | --- |
| passed | battery-voltage-class-supported | info | All assigned rows; no missing facts | Selected inverters support the stated {bankVoltageV} V battery class. Other compatibility checks remain. |
| incompatible | battery-voltage-mismatch | error | Offending rows; any additional missing keys retained | Inverter rows {rowIds} do not support the {bankVoltageV} V bank. Review the component or explicit system assignment. |
| unknown | unknown-assignment | warning | Unassigned rows; rows.{id}.bankId | Different/unassigned battery systems need clarification. Assign rows to the intended battery banks. |
| unknown | unknown-bank-voltage | warning | Assigned rows; bank.nominalVoltageV | Battery-bank voltage is not verified. Supply a verified bank configuration. |
| unknown | unknown-inverter-voltage | warning | Rows with missing facts; rows.{id}.supportedBatteryVoltageClassesV | Supported battery voltage is missing for inverter rows {rowIds}. Verify their published specifications. |
| not-applicable | no-assigned-inverters | info | Empty scope; no missing facts | No inverter is assigned to this bank for this check. |

For the user example, show a preliminary warning that one selected inverter is
48 V and another 24 V only when those are verified battery/DC classes. It requests
group clarification; it is not proof of incompatibility across independent systems.

Planning-BOM review may acknowledge unresolved findings without converting their
state to passed. No wiring, inverter parallel operation or purchase approval is
granted by acknowledgement. Actual write blockers remain independently enforced.

## Sources and evidence limits

- VICTRON-VE-BUS-PARALLEL: [Parallel, split- and three-phase VE.Bus systems](https://www.victronenergy.com/live/ve.bus:manual_parallel_and_three_phase_systems).
  Referenced in the preceding design discussion: requirements include matching
  system voltage and additional type/firmware constraints for the applicable
  Victron family. This supports separate, scoped checks, not a universal rule that
  every inverter with the same voltage can be combined. Exact product applicability
  and release-time evidence verification remain pending; verifiedOn is null.
- VICTRON-MULTIPLUS-DATA: [MultiPlus technical data](https://www.victronenergy.com/media/pg/MultiPlus_2kVA_230V/en/technical-data-2kva.html).
  The product documentation distinguishes DC/battery ratings from AC characteristics.
  It is not the source of the fictional product values in the examples below.
- Individual product supported classes and the bank configuration require their
  own manufacturer/source references in the published fact contract before use.
  The fixture numbers are synthetic logic examples, not equipment recommendations.

## Machine-readable examples

The following fixtures exercise one explicit bank scope. Missing supported sets
are represented by null. Separate executable unit tests cover unassigned findings
and source normalization; there is no complete multi-bank/project dispatcher yet.

```json
{
  "fixtureSchemaVersion": 1,
  "cases": [
    {
      "id": "matching-48v-bank",
      "input": {
        "bank": { "id": "main", "nominalVoltageV": 48 },
        "rows": [
          { "id": "i1", "bankId": "main", "supportedBatteryVoltageClassesV": [48], "quantity": 2 }
        ]
      },
      "expected": { "state": "passed", "reasonCode": "battery-voltage-class-supported", "severity": "info", "affectedRowIds": ["i1"], "missingFacts": [] }
    },
    {
      "id": "shared-bank-48v-and-24v",
      "input": {
        "bank": { "id": "main", "nominalVoltageV": 48 },
        "rows": [
          { "id": "i1", "bankId": "main", "supportedBatteryVoltageClassesV": [48], "quantity": 1 },
          { "id": "i2", "bankId": "main", "supportedBatteryVoltageClassesV": [24], "quantity": 1 }
        ]
      },
      "expected": { "state": "incompatible", "reasonCode": "battery-voltage-mismatch", "severity": "error", "affectedRowIds": ["i2"], "missingFacts": [] }
    },
    {
      "id": "separate-bank-not-compared",
      "input": {
        "bank": { "id": "main", "nominalVoltageV": 48 },
        "rows": [
          { "id": "i1", "bankId": "main", "supportedBatteryVoltageClassesV": [48], "quantity": 1 },
          { "id": "i2", "bankId": "garage", "supportedBatteryVoltageClassesV": [24], "quantity": 1 }
        ]
      },
      "expected": { "state": "passed", "reasonCode": "battery-voltage-class-supported", "severity": "info", "affectedRowIds": ["i1"], "missingFacts": [] }
    },
    {
      "id": "missing-supported-classes",
      "input": {
        "bank": { "id": "main", "nominalVoltageV": 48 },
        "rows": [ { "id": "i1", "bankId": "main", "supportedBatteryVoltageClassesV": null, "quantity": 1 } ]
      },
      "expected": { "state": "unknown", "reasonCode": "unknown-inverter-voltage", "severity": "warning", "affectedRowIds": ["i1"], "missingFacts": ["rows.i1.supportedBatteryVoltageClassesV"] }
    },
    {
      "id": "no-assigned-inverters",
      "input": { "bank": { "id": "main", "nominalVoltageV": 48 }, "rows": [] },
      "expected": { "state": "not-applicable", "reasonCode": "no-assigned-inverters", "severity": "info", "affectedRowIds": [], "missingFacts": [] }
    },
    {
      "id": "multi-voltage-supported-set",
      "input": {
        "bank": { "id": "main", "nominalVoltageV": 48 },
        "rows": [ { "id": "i1", "bankId": "main", "supportedBatteryVoltageClassesV": [24, 48], "quantity": 1 } ]
      },
      "expected": { "state": "passed", "reasonCode": "battery-voltage-class-supported", "severity": "info", "affectedRowIds": ["i1"], "missingFacts": [] }
    },
    {
      "id": "missing-bank-voltage",
      "input": { "bank": { "id": "main", "nominalVoltageV": null }, "rows": [ { "id": "i1", "bankId": "main", "supportedBatteryVoltageClassesV": [48], "quantity": 1 } ] },
      "expected": { "state": "unknown", "reasonCode": "unknown-bank-voltage", "severity": "warning", "affectedRowIds": ["i1"], "missingFacts": ["bank.nominalVoltageV"] }
    },
    {
      "id": "known-mismatch-with-missing-fact",
      "input": { "bank": { "id": "main", "nominalVoltageV": 48 }, "rows": [
        { "id": "i1", "bankId": "main", "supportedBatteryVoltageClassesV": [24], "quantity": 1 },
        { "id": "i2", "bankId": "main", "supportedBatteryVoltageClassesV": null, "quantity": 1 }
      ] },
      "expected": { "state": "incompatible", "reasonCode": "battery-voltage-mismatch", "severity": "error", "affectedRowIds": ["i1"], "missingFacts": ["rows.i2.supportedBatteryVoltageClassesV"] }
    },
    {
      "id": "repeated-product-independent-rows",
      "input": { "bank": { "id": "main", "nominalVoltageV": 48 }, "rows": [
        { "id": "i1", "bankId": "main", "supportedBatteryVoltageClassesV": [48], "quantity": 1 },
        { "id": "i2", "bankId": "main", "supportedBatteryVoltageClassesV": [48], "quantity": 3 }
      ] },
      "expected": { "state": "passed", "reasonCode": "battery-voltage-class-supported", "severity": "info", "affectedRowIds": ["i1", "i2"], "missingFacts": [] }
    },
    {
      "id": "invalid-supported-member-is-unknown",
      "input": { "bank": { "id": "main", "nominalVoltageV": 48 }, "rows": [ { "id": "i1", "bankId": "main", "supportedBatteryVoltageClassesV": [48, 0], "quantity": 1 } ] },
      "expected": { "state": "unknown", "reasonCode": "unknown-inverter-voltage", "severity": "warning", "affectedRowIds": ["i1"], "missingFacts": ["rows.i1.supportedBatteryVoltageClassesV"] }
    },
    {
      "id": "exact-class-no-tolerance",
      "input": { "bank": { "id": "main", "nominalVoltageV": 48 }, "rows": [ { "id": "i1", "bankId": "main", "supportedBatteryVoltageClassesV": [47.999], "quantity": 1 } ] },
      "expected": { "state": "incompatible", "reasonCode": "battery-voltage-mismatch", "severity": "error", "affectedRowIds": ["i1"], "missingFacts": [] }
    }
  ]
}
```

The documentation gate executes all eleven fixture IDs directly. Unit tests also
cover unassigned rows, invalid/unverified/conflicting source facts, structural
rejection, limits, immutable input and reevaluation after fact changes. Route/account
stale-result fencing remains future UI/API integration work. No fixture claims
operating-range validation, approved hardware pairing or real product facts.

## Code, tests and dependencies

Implemented in isolation: [validator/registry](../../backend/src/builder/rules.ts),
[unit tests](../../backend/test/builder-rules.test.ts),
[documentation parity/fixture tests](../../backend/test/builder-rule-documentation.test.ts).
Run backend npm test and npm run check. The backend owns eventual final evaluation,
but no app route currently imports these functions. Required catalog inputs still
depend on a reviewed typed public fact schema and explicit bank assignment.
See [data audit](../BUILDER-DATA-AUDIT.md). Never treat existing free-text panel
fields as sufficient input or implement a product-name parser as a substitute.

evaluateSharedBatteryVoltage checks one explicit bank. evaluateUnassignedInverters
returns a distinct unknown-assignment finding or null if no rows are unassigned.
A future dispatcher must evaluate all scopes, detect dangling assignments and
retain these findings. A matching bank result must not conceal an unassigned one.
Dependent implemented rule IDs: none. Other technical families below are deferred.

Related rule families, not active rule IDs: inverter parallel-operation support,
actual battery operating range, BMS pairing and battery charge/discharge limits.
The dispatcher/UI must retain bank scope, affected rows and missing fact keys;
the backend owns final evaluation, not client-supplied pass flags.

## Maintenance and change history

- 2026-10-11, v1, initial implementation: pure typed evaluator, safe structural
  bounds, source-review normalization, separate unassigned finding, eleven synthetic
  fixtures and local documentation gate. Refined initial message variables to row
  IDs (no invented display-name field). No previously active behavior was changed.
  Product evidence verification and public/API activation remain pending.
  Verification: backend test suite (110 tests), TypeScript check/build and all
  eleven documented synthetic fixture IDs passed. verifiedOn stays null for
  pending product/source evidence, not a claim that local tests were skipped.

- 2026-10-11, v1, planned: initial AI-consumable specification and synthetic fixtures
  for the user's voltage-mismatch example. Documentation metadata/links/JSON can
  be checked now; executable rule/evidence review and test verification remain pending.
