# Panel product specifications

Implemented 2026-10-08 (Asia/Manila), using the user-supplied parameter reference.
Choose **Panels** in the admin New product / Edit product form to reveal the
panel specification section. Brand uses the existing general product field.

| Parameter | `panelSpecifications` key |
| --- | --- |
| Product code | `productCode` |
| EAN code | `eanCode` |
| Light color | `lightColor` |
| Cable | `cable` |
| Rated maximum power | `ratedMaximumPower` |
| Short circuit current tolerance | `shortCircuitCurrentTolerance` |
| Open circuit voltage tolerance | `openCircuitVoltageTolerance` |
| IP rating | `ipRating` |
| Size of product | `dimensions` |
| Standard test conditions | `standardTestConditions` |
| Safety class | `safetyClass` |
| Max system voltage | `maxSystemVoltage` |
| Gross weight | `grossWeight` |
| Net weight | `netWeight` |
| Warranty | `warranty` |

These are optional manufacturer-provided **text** values, including their units.
EAN remains text to retain leading zeroes. Product code is the manufacturer's
model/code, separate from the immutable internal SKU. Dimensions, cable sizing,
decimal separators, electrical values and warranty wording are preserved rather
than guessed or converted. Only standard test conditions and warranty allow
multiple lines. Limits are 200 characters per field, 500 for test conditions and
1,000 for warranty; unknown keys, wrong types and unsupported controls are rejected
by both API and frontend. Whitespace at the ends is trimmed.

The reference labels containing “tolerance” are retained. Values shown in A or V
alone must not be interpreted as a percentage tolerance or used automatically in
engineering calculations. Verify the manufacturer datasheet and decimal notation
for weights; no screenshot example values are seeded or applied as defaults.

## Storage and publication

Private product masters and the allowlisted public projection accept optional
nullable `panelSpecifications`. A non-null map is valid only for Panels. An absent
field keeps existing schema-version-1 records compatible; no migration is required.
On update, omission retains saved specifications; `null` explicitly clears them.
The editor sends `null` when clearing all saved values or changing away from Panels.
The form retains unsaved panel values if category is changed back before saving.

Saving changes remains private. Publishing / republishing copies the saved
specifications into the public projection. Existing public details stay unchanged
between save and publish; supplier IDs, actor IDs and private metadata remain
excluded. Existing publication prerequisites remain unchanged: a panel can be a
draft or published record with incomplete optional specs. No product deletion,
stock changes, purchase-order snapshots or lock policy is introduced here.

Customer Details shows all panel labels in the existing green/mint KTUI dialog,
with unknown values explicitly **Not specified**. Product reference resolution in
Cart/BOM carries the same published specifications. Existing blue admin styling,
public fonts/angular geometry, dialog focus/scroll behavior and icons are retained.

The implementation adds no paid service, subscription, live migration, index,
rule, provisioning or deployment change. Firebase stays on named Standard database
`store-dev` in `asia-southeast1`, project `dumaget-me-solar`.

## Verification

2026-10-08 results: 50 focused frontend tests across 6 files and all 59 backend
tests pass; app/spec and backend type checks plus frontend/backend production
builds pass. The local emulator persistence/publication test passes. Direct and
proxied public catalog requests and API health still return 200. The broader
frontend suite has 266 passing tests and 9 failures in project/auth flows; this
slice does not claim those unrelated workflows are fully verified.

Subsequent 2026-10-09 management verification resolves those failures: the
complete frontend suite now passes 328 tests / 46 files, with 75 backend tests
and both builds passing. The preceding counts are historical slice results.

Focused tests cover validation, EAN/units, legacy compatibility, create/edit forms,
public DTO/view and dialog rendering. An explicit local Firestore emulator test
checks persistence/reload, idempotency, private edits versus republishing and
clearing specifications on category change. No live products are created by tests.
Browser visual verification is unavailable while the browser automation helper
fails during Windows sandbox initialization; do not treat component tests as a
desktop/mobile visual check.
