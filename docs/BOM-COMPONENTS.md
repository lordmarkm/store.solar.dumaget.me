# Current BOM component picker

Policy: BOM-COMPONENT-PRESENCE, version 5, 2026-10-14.
Scope: presentation completeness for an owned project's existing editable BOM.
This is not a registry compatibility validator, purchasing gate or electrical approval.

## Inputs and evaluation

- Project configuration: grid-tied, hybrid, off-grid, undecided.
- Existing BOM lines resolved against current public catalog products by product,
  variant and unit reference. Never infer categories from names, descriptions,
  pictures or free-text titles.
- Inverters and ATS are required for every configuration; batteries are required for hybrid.
  All other displayed component slots are optional under this policy.
- A resolved store-product line supplies its public category. Multiple/repeated
  products remain independent rows; quantity and notes are never merged.
- ATS is its own catalog category and slot. Circuit breakers and Surge Protection
  Device, PV Isolator and MCCB have separate optional slots. Explicit legacy Protection subtypes map
  to their new group; untyped legacy lines remain Other. ATS appears once.
  This universal presence requirement is the
  user's product policy, not a claim that every electrical topology requires ATS.
- Every empty category renders No items selected plus its Add action. Required
  categories have a red asterisk with an accessible Required hint on the component
  name; optional categories have no marker or Optional caption. Populated required
  categories retain that asterisk with their actual rows.
  This is presence only, not Passed compatibility. Unchecking a row affects export,
  not category presence. Missing slots never block ordinary draft edits or saving.
- Free-text lines with an explicit componentCategory group with that component
  and count toward UI presence only. They provide no verified catalog or electrical
  specifications. Legacy/unclassified free text and unavailable/unit-mismatched
  store references remain under Other requirements. No title inference or migration
  is performed. Archived projects show the same rows read-only.

Examples: an empty grid-tied project shows inverter and ATS as missing; an empty hybrid project
shows inverter, ATS and battery as missing; two inverter rows stay separate; a free-text line
explicitly categorized Batteries fills the battery slot without engineering approval;
a legacy line titled Battery is not classified automatically; an unavailable inverter is preserved
in Other rather than silently removed or certified as present.

## UI and command boundaries

The actual KTUI DataTable owns rendering through the shared adapter. Category Add
buttons retain requested text; per-item Save quantity, Details, Edit and Remove use
secondary KeenIcons/hover-only tooltips. The same cells reflow when the table's
available width is narrow; no horizontal scrollbar or clipped values.
All component Add/Add another/Add more controls use the verified ki-plus glyph,
as do catalog picker additions and Add free-text line. Save quantity and editing
an existing free-text line retain ki-check; creating a free-text line uses ki-plus.
The required-marker/icon change is presentation-only: policy version and presence
semantics remain unchanged.

Every component has explicit empty and populated action labels in COMPONENTS
(addLabel and repeatAddLabel), not automatic English pluralization:

| Component | Empty | Populated |
| --- | --- | --- |
| Inverter | Add inverter | Add another inverter |
| Solar panels | Add solar panel | Add more panels |
| Battery | Add battery | Add another battery |
| ATS | Add ATS | Add another ATS |
| Mounting | Add mounting | Add more mounting |
| Circuit breakers | Add circuit breaker | Add another circuit breaker |
| Surge Protection Device | Add surge protection device | Add another surge protection device |
| PV Isolator | Add PV isolator | Add another PV isolator |
| MCCB | Add MCCB | Add another MCCB |
| Other requirements | Add requirement | Add another requirement |

This depends on group presence, not export checkbox selection or quantity.
On editable populated groups, the repeat Add action appears once in a KTUI-rendered
footer row after the final component line, aligned with the Selection column.
Empty groups keep their initial Add action by the component name. Footer rows are
presentation-only and never participate in BOM selection, totals, CSV or presence.
Archived projects show neither footer rows nor Add actions. Stacked layouts omit
empty footer cells rather than showing quantity/pricing captions or sideways scroll.
Resolved products and explicitly categorized free text populate their component;
unclassified free text/unavailable references populate Other only. Removing the
last matching line restores the empty label. Labels do not change destinations,
quantities, requirement semantics or electrical validation.
2026-10-13 label generalization: 13 category tests and 25 BOM/account/picker tests
pass; production build passes with the existing bundle warning. Live existing
inverter/empty-panel labels and root/nested overflow checked without BOM writes.
Stacked rows omit redundant Component, Selection, Quantity and Actions headings,
but retain the quantity input's real label and the Unit price/Subtotal labels.
Resolved products omit the repeated published-price/tax and availability notices;
unavailable/free-text pricing explanations and underlying estimates stay intact.

Category Add opens a shared CDK/KTUI-styled picker for the explicit current Draft
project. Its catalog branch shows only published products; quantity is a positive safe whole number,
independent of stock. Close is only at the lower-right footer. Cancel, Escape,
route/account changes and failed selection make no new BOM write.
Customer quantity inputs share appIntegerQuantity: numeric keyboard, integer steps,
and rejection of decimal/sign/exponent typing and non-digit paste/drop/inserted text.
Invalid values are never rounded or truncated. Existing positive-safe-integer
frontend and API guards remain the write boundary, including free-text and Cart
copy commands; input filtering is not a substitute for server validation. Prices
and electrical ratings retain their existing decimal behavior.

Add free-text line is inside this picker, not on the main BOM page. It switches
the existing dialog to the shared line editor (no nested popup), preserving the
chosen component and initial quantity. Add requirement opens the same flow for
unclassified Other lines without a catalog query. The editor keeps Add/Save and
Cancel in its footer, with Cancel last at lower right; its body scrolls vertically.
Existing free-text rows remain editable through their row action.

FreeTextBomItem and the free-text command accept optional componentCategory:
Inverters, Panels, Batteries, Mounting, Circuit breakers, Surge Protection Device, ATS, PV Isolator or MCCB. Unknown values and null
are rejected; omission means unclassified on creation and preserves a saved
category on edit. Store-product lines reject this field. The frontend/account
parser, backend parser and embedded Firestore BOM retain it through reload,
quantity changes, duplicate, retry and remove/Undo. Schema version stays 1:
this is an additive optional field, not a new collection/query/index.
Free-text lines stay unpriced unless they already have a manual estimate.

Free-text ATS additionally carries componentProtectionType: 'ATS' and required
amperage: number with componentCategory: 'ATS'. Explicit legacy Protection/ATS stays readable. Its same-dialog editor
shows Amperage (A) with a red asterisk and native required semantics. The rating
must be finite, positive and <= Number.MAX_SAFE_INTEGER; decimals are allowed
(this is not a quantity). Missing/null/string/zero/negative/nonfinite ratings,
other subtypes, subtype outside ATS (or explicit legacy Protection/ATS) and amperage without ATS are rejected
by frontend and API validation. Omitted saved metadata is preserved on edits;
validate the merged effective line before writing so edits cannot strip its
required rating. Track IDs internally; never infer subtype/rating from names.
Old untyped Protection lines remain untyped; there is no backfill or inference.
Customer-entered amperage is unverified planning data, not manufacturer evidence.
Catalog ATS already requires atsSpecifications.amperage on create/Save/Publish.

The picker rechecks product availability/category and, for ATS, subtype and valid
amperage before adding. Legacy unrated ATS remains readable, but is not a valid
new ATS selection. It uses the existing authenticated
add-items command, ownership/version checks and one stable request UUID for unchanged
uncertain retries. A new picker gets a new UUID, preserving independent repeated
lines. No active-project switch, Cart copy, PO, snapshot, inventory reservation,
staged build or compatibility inference is performed.

## Published category API

GET /api/v1/catalog/products accepts an optional allowlisted category and limit
1–50 (default 50). The picker sends category plus limit=10. Firestore queries the
published collection by category before document-ID ordering/cursor pagination,
reading at most limit+1 records. No client filtering of downloaded collections,
count query, new index deployment or search infrastructure.
ATS sends category=ATS&limit=10 and uses a single
indexed protectionType equality instead of a redundant category predicate:
validated published ATS belongs to ATS. Returned records are checked
against category/subtype. This avoids a new composite index or collection scan.

Filtered/smaller-page cursors are opaque base64url tokens scoped to category,
subtype when present and limit; changing any invalidates the token. Existing
category-only fingerprints are unchanged. The legacy unfiltered default keeps
its UUID cursor. The frontend treats picker cursors as opaque bounded strings and
resets paging when a new category picker opens. Only the current page is rendered;
Previous/Next remain outside KTUI's total-based paginator.

## Maintenance and verification

Code: solar-ui/src/app/core/component-bom.ts,
features/projects/project-bom.ts/.html, shared/project-component-picker.ts/.html,
core/public-catalog.service.ts; backend/src/admin-catalog.ts,
admin-catalog.repository.ts and app.ts.

Tests: core/component-bom.spec.ts, core/public-catalog.service.spec.ts,
shared/project-component-picker.spec.ts, features/projects/account-project-flow.spec.ts,
project-bom-flow.spec.ts, shared/ktui-table.spec.ts;
backend/test/public-catalog-query.test.ts and admin-catalog*.test.ts.

Maintain this policy, code, examples and tests together when presence semantics change.

ATS v3 verification, 2026-10-13: 81 focused frontend tests across seven files
pass; all 136 offline backend tests pass, with final HTTP filter forwarding and
merged metadata guard tests rerun after integration. Backend type check and
production build pass; existing initial-bundle warning remains at 766.32 kB
versus 750 kB (budget unchanged). Preview save/edit/reload preserves 63.5 A;
account DTO and embedded repository tests preserve ATS metadata and reject a
category-only edit contradictory to the saved subtype. Live API ATS filtering
returns 200 directly and through the proxy; unauthenticated account API remains
401. Browser picker shows only the published Fanhey ATS; free-text editor has
required Amperage (A), step=any, and lower-right footer Cancel. Desktop 1440px
and mobile 390px checks show no root/visible nested horizontal overflow. Cancel
keeps the original three BOM lines and quantities 2/10/1. Viewport restored;
no live data write, publication, index deployment or engineering rule added.

Do not add this UI-only policy to the engineering registry as an active validator.
Version 1 introduces universal inverter and hybrid-battery presence indicators.
Version 2 adds explicit categorized free-text presence and the picker-only entry
flow. Version 3 adds universal ATS presence, subtype grouping/API filtering and
required amperage for typed free-text ATS. Version 4 splits Protection into
Circuit breakers, Surge Protection Device and ATS with legacy read compatibility.
Version 5 adds independent optional PV Isolator and MCCB slots, API-filtered
pickers and explicit categorized free-text lines, with initial/repeat Add labels.
No new electrical rating requirement, catalog reclassification or live BOM write.
None is an electrical compatibility rule.

2026-10-13: 48 focused frontend tests and 22 backend tests pass. Production UI build
passes with the existing initial-bundle warning (budget unchanged); backend type
check passes. Live published inverter/battery queries return 200. Desktop/mobile
table/picker checks confirm no document/nested horizontal overflow, footer-only
Close, safe Close/Escape and retained original BOM quantity. Browser verification
does not submit an addition to a real project; additions are covered by isolated
tests. Dark visual and real-browser write checks remain separate.

Full frontend suite: 514 passed / 13 failed across 64 files. Failures are in
untouched inventory-operations, inventory, inventory-csv and admin-supplier-editor
tests (obsolete dialog/control expectations, supplier-ID display expectation and
a quoted-CSV expectation). They are not claimed resolved by this component slice;
the 48 scoped component/BOM/catalog/table/picker tests pass. No global test budget
or expectation was weakened to conceal these failures.

Label/layout follow-up, 2026-10-13: 25 focused component/BOM/KTUI tests and the
production build pass (existing initial-bundle warning remains). Live populated
inverter button reads Add another inverter, remains unchanged when its export
checkbox is unchecked, and opens the existing inverter picker. Checkbox state
was restored, picker closed without adding, and quantity 2 remained unchanged.
Default desktop and 390px viewport checks found no document/table horizontal
overflow; redundant stacked labels/notices are absent. Viewport override reset.
No database changes or project-configuration policy changes in this follow-up.

Categorized free-text follow-up, 2026-10-13: 48 focused frontend tests across
six files and 9 backend tests pass; backend type check and whitespace check pass.
Production build passes with the unchanged initial-bundle warning (764.24 kB,
750 kB warning budget). Browser confirms Add free-text line inside Add inverter,
one dialog switching to Add free-text inverter, initial input focus, lower-right
footer Cancel and no root/nested horizontal overflow at default and 390px
viewports. Cancel/Close retain the original one-line BOM with quantity 2.
Viewport reset; no real BOM addition was submitted. Isolated tests cover account
command/reload, local persistence, category validation, retries, duplication and
remove/restore. Backend restarted; health/catalog direct and proxied return 200,
unauthenticated account endpoint returns 401. These reads do not prove live-write
authorization; no new query, collection, index, migration or deployment.
