# Project Build Assistant

Recorded: 2026-10-10 (Asia/Manila).
Status (2026-10-13): foundation and current-BOM component table/category picker
implemented; the separate staged builder/suggestions/review-and-apply workflow
remains pending. See [BOM component policy](../docs/BOM-COMPONENTS.md) and the
[data audit](../docs/BUILDER-DATA-AUDIT.md).
This documents the user's requested direction, not permission to provision cloud
services, change shared security rules, seed live records or deploy the website.

## Goal and priority

### Current BOM completeness policy (2026-10-13)

This is a requirement for the existing, continuously editable project BOM UI,
separate from the future staged Build Assistant described below. Every project
configuration requires at least one inverter line and one ATS line. Hybrid projects also require
at least one battery line. These are BOM completeness indicators only: they do
not evaluate electrical compatibility, certify a design or block ordinary BOM
editing or saving. Missing requirements remain visible as incomplete state, not
as a mandatory component-creation gate.

Render BOM contents as grouped, responsive KTUI component tables in a
PC-part-picker-style layout. Each group supports multiple independent lines and
an Add action (including Add inverter and Add battery); preserve repeated products
as separate rows with their own quantities and line details. Inverters and ATS are
required for every configuration. Batteries are required only for hybrid
projects; panels, batteries in non-hybrid projects, mounting, other protection and
Other/free-text requirements may be added but are optional. Keep unavailable or
unpublished existing products visible and editable as unavailable references.

Adding a catalog product opens a published-products-only, server-filtered,
cursor-paginated picker with 10 products per page. It is scoped to the explicitly
current, owned Draft project; do not silently use or change the active project.
The current BOM remains continuously editable while products are browsed. The
picker does not impose a component-creation gate and does not invoke suggestions,
compatibility decisions, PO creation or design approval. This completeness policy
does not turn missing requirements into executable engineering rules.

Add free-text line belongs inside each component picker, not on the main BOM
page. It opens the shared editor within the same dialog and retains the selected
component and quantity. Persist optional componentCategory for these free-text
lines so they stay in the chosen group after reload. They count as UI presence,
not verified specifications or compatibility. Legacy/unclassified lines remain
Other requirements; its Add requirement action uses the same flow without a
catalog query. Footer-only Cancel stays lower right. No migration/name inference.
ATS is its own category and matches typed free-text ATS, not circuit breakers
or unclassified legacy protection. Circuit breakers, Surge Protection Device,
PV Isolator and MCCB
have separate slots. See [category contract](../docs/PRODUCT-CATEGORIES.md).
Its picker uses API-side category filtering. Free-text
ATS requires positive finite amperage in amperes (fractional ratings allowed),
with a red required marker; catalog ATS ratings retain their existing requirement.
Persist explicit subtype and amperage through edits/reload, with API validation.
This is the user's completeness policy, not electrical topology approval.

The separate future Build Assistant below remains a staged selection and review
flow. Its proposals, compatibility work and atomic append are not prerequisites
for ordinary current-BOM edits and must not be described as implemented by this
policy. No stock, inventory reservation, migration or cloud/service change is
implied.

Help a signed-in customer assemble a project using a component-picker experience:
select equipment by category, use reviewed suggestions, choose alternatives,
adjust quantities, understand unresolved compatibility checks and append reviewed
planning rows to the project's continuously editable BOM.

This is the next My Projects feature, ahead of customer PO implementation. The
existing New project wizard stays lightweight; the builder is an optional next
step on a project, not an additional prerequisite for creating one.

Use deterministic, bounded rules and published catalog data for the initial
implementation. No paid AI service, invented specifications or automatic electrical
design approval is required. A suggestion is a planning aid, not an order,
reservation, guaranteed output, final installation design or installer sign-off.

## Accepted visual reference

The user preferred the revised, PC-part-picker-like category table over the first
card-based mockup. The [accepted interactive mockup](mockups/solar-build-picker.html)
shows the following intended composition:

1. Customer My pages chrome and a compact project/requirements toolbar.
2. A full-width compatibility strip above the component table, with a distinct
   panel-nameplate-capacity summary. Unknown checks must not appear as green approval.
3. Category rows: component, selected product/thumbnail, quantity, unit price,
   line subtotal and compact Change/Remove actions.
4. Empty categories expose Choose; populated categories expose Add another below
   their rows. Repeated selections stay visible as independent lines.
5. Select all/individual selection and priced totals below the table, not a
   permanent right-hand summary card. Show unpriced counts and budget separately.
6. Review & add to BOM opens a selected-row review before any project write.

Keep customer green/mint Metronic/KTUI styling, Space Grotesk/DM Sans, 2px surfaces,
the shared verified KeenIcons and hover-only tooltip behavior. Do not copy the
reference site's blue styling, commercial Buy actions, public sharing, mark-up
tools or seller comparison features into the MVP. Product thumbnails use approved
published images, not the prototype's illustrative icons. Details/Change/Remove
icon actions need accessible labels and shared hover-only hints. Page-level Choose,
Add another and Review actions retain visible labels.

On mobile, reflow category groups and line values rather than shrink the desktop
table. Keep quantities and actions usable without page overflow. Public overlays
must inherit the theme and preserve focus containment, Escape and return focus.
See [UI theme](../UI-THEME.md) and the
[action skill](../.agents/skills/solar-ui-actions/SKILL.md).

## Entry points and access

- Project overview exposes Build Assistant for an authenticated owner of a Draft
  project. Proposed route: /my/projects/:projectId/builder; it does not exist yet.
- The project BOM may expose the same entry point later without copying existing
  rows or silently changing the destination. Project ownership is server-enforced.
- Archived projects cannot apply additions. Do not auto-restore or select a
  different active project. Existing project creation and catalog Add to project
  flows remain available independently.
- The initial builder starts a staged new build for the named project. Do not
  prepopulate existing BOM rows and then append them again. A future explicit
  edit-existing-BOM mode requires distinct replace/update review semantics.
- Suggestions, picker changes and canceled reviews write no project data. Session
  or route changes close overlays and fence requests/results. Never adopt guest
  Cart/legacy preview data or auto-run a pending action here.

## Categories and multiple items

Initial groups: Solar panels, Inverters, Batteries, Mounting, Protection,
Cables & connectors, Other. Map these builder groups deliberately to the existing
catalog category vocabulary; do not rename persisted categories implicitly.

Each category contains zero or many independent rows. There is no one-item slot
limit, including for inverters or batteries. For the future staged builder,
category completeness is not itself an engineering rule. The separate current-BOM
presence indicators are specified above: inverter and ATS for every project, plus
battery for hybrid projects; they do not gate edits or establish compatibility.

- Qty changes the number of units on that row only, using its sellable unit.
- Add another inserts a new row for another product, the same product again or
  a free-text requirement. Keep stable row IDs and separate quantities.
- Change replaces only the reviewed row, not the category or other rows. Changing
  a sellable unit requires an explicit quantity review; no silent conversion.
- Remove removes only the staged row. It never removes stored project BOM rows
  or product/media records. Cancellation leaves the actual BOM untouched.
- Repeated products are not auto-merged. Row count and unit quantity are distinct.
  Existing line notes and the reason for separate rows must not be discarded.
- Free-text rows carry description, quantity, unit and optional notes. They are
  unpriced requirements, never a fabricated zero-priced store product. Manual
  estimates/tax treatment require their separate policy; not part of this MVP.

Multiple selections do not prove that hardware can be combined. Mixed panel
models, multiple inverter arrangements and battery banks need applicable group
checks and explicit connection/assignment context. Do not infer parallel operation,
string configuration or approved battery protocols merely from category membership.

## Requirements and suggestions

Reuse the project's classification, installation type, configuration, work scope,
location/description/notes. Preserve Rooftop as the existing creation default;
opening the assistant does not rewrite project metadata.

MVP inputs include an optional equipment budget and an explicit planning-capacity
target when known. Optional energy-use and backup goals can be collected as inputs,
but conversion into equipment quantities needs a separately reviewed sizing rule.
Unknown values remain unknown; never invent usage from a monthly bill, roof capacity,
sun-hours, achievable yield or backup duration.

Suggestions are an explicit reviewed starting point, not automatic replacement:

- State which requirements and published specification facts were used and which
  are absent. Permit manual selection even when a recommendation cannot be made.
- Present alternatives with the relevant public facts, current price basis and
  unresolved checks. Preserve chosen rows when requirements change; mark results
  stale and offer reviewed regeneration, not silent resizing/substitution.
- Prefer supported, reviewable rules over guessed engineering conclusions. If
  there is insufficient verified product data, show No verified suggestion yet.
- Explain ranking (requirement fit, known compatibility, public price/budget), not
  private supplier margin. Budget is a planning preference, not a stock constraint.

## Catalog picker and specification prerequisites

The initial picker queries published customer-safe products only. Do not expose
private drafts, supplier costs, internal contact details or admin-only stock pools.
Current panel specifications exist; equivalent inverter/battery/mounting/protection
fields and reviewed rule coverage must be inventoried before implementation.

Potential rule inputs, subject to typed contracts and installer review:

| Component | Data to inventory, not a claim it is already stored or validated |
| --- | --- |
| Panels | Rated power, electrical ratings, dimensions and relevant environmental limits |
| Inverters | Supported configurations, PV input limits, battery interface and supported pairings |
| Batteries | Capacity, voltage class, operating limits, communication/approved pairing and expansion restrictions |
| Mounting | Roof/installation suitability, dimensions, attachment and structural prerequisites |
| Protection/cabling | Rating/type, unit and applicable component/connection requirements |

Use consistent typed units and provenance. Display strings alone are insufficient
for numerical checks. Approval/compatibility facts must come from documented,
reviewed sources; missing values cannot be coerced to zero or generic defaults.
Define new public fields and publish them through existing admin/public projection
boundaries without leaking private sourcing information.

Picker filters/search must be validated API queries before cursor pagination over
the eligible published dataset, not frontend filtering of a loaded page. Label
supported search semantics honestly. Propose 10 items per picker page, stable
category/brand options, compact same-row Clear, debounce, retry and stale query/
account/route guards. Any new index needs need/cost review; no full-catalog download.

## Compatibility and completeness

### Rule definition and maintained AI documentation (2026-10-11)

The accepted MVP architecture is ordinary typed TypeScript validators in the
backend, not Drools, an executable natural-language description or a custom rule
DSL. Admins maintain source-backed typed product facts; code owns rule logic.
Explicit system/battery-bank assignment supplies context rather than assuming
all components in a project are connected. Basic group assignment is a rule
prerequisite; a complete wiring/string editor remains deferred.

Every rule must have a versioned, AI-consumable specification, structured inputs,
precise applicability/evaluation/outcomes, evidence references, deterministic
fixtures, actual code/test links and change history. Read the
[rule documentation contract](../docs/builder-rules/README.md),
[machine-readable index](../docs/builder-rules/index.json) and
[shared-battery-voltage isolated validator](../docs/builder-rules/shared-battery-voltage.md).
Documentation and dependent tests update in the same change as rule logic or its
input/output contract. Missing/stale rule docs make implementation incomplete.

The first pure registry and local rule-document parity/fixture gate are implemented
in the foundation slice; run backend npm run test:builder. No API/UI consumes the
validator yet, and catalog facts/source verification remain pending. Do not promote
other planned specs to active checks or treat AI text as electrical evidence.

Keep compatibility separate from completeness, price and availability. Each check
has a stable rule ID/version, state, explanation, involved row IDs and missing facts.

States: Passed, Incompatible, Unknown, Not applicable. Unknown is never Passed.
Passed means only that this specific rule passed for its input facts, not that
the entire system is approved. The strip summarizes scoped findings and links
to details; counts must refer to the reviewed build, not just currently visible rows.

Use pair/group checks where needed, not simply one check per category. Distinguish
known incompatibility from a missing specification, a missing requirement, a
budget overrun and unconfirmed availability. A free-text row has no implied
catalog compatibility or stock. Manufacturer/installer review remains necessary.

Known incompatibilities and unknowns remain conspicuous at BOM review. Planning
rows may be added with an explicit unresolved-check acknowledgement; never label
that action as approval. Store/unit/owner/archive/version validation failures block
the write. Purchase commitments have their own stricter policy, not this builder's.

## Prices, capacity and availability

- Money uses integer PHP centavos in application/API contracts. Show unit basis,
  quantity and subtotal; unknown amounts are blank/unpriced, not zero.
- Show selected priced subtotal plus unpriced row count. Do not call this a complete
  installation cost. Installation, shipping, discounts and tax are omitted or
  labeled unknown unless authoritative terms explicitly provide them.
- Do not silently invent cross-row quantity-tier aggregation. Existing estimate
  rules must be labeled; future PO tier/stock grouping remains a separate decision.
- Panel capacity is the sum of known panel nameplate power times selected quantity,
  with a partial/unknown label if needed. It is not inverter output, energy yield,
  battery capacity, supported string sizing or a production guarantee.
- Availability is customer-safe and timestamped when supported; otherwise show
  Unconfirmed. Do not use private inventory as public available stock, cap planning
  quantities, reserve inventory or silently replace out-of-stock items.

## Review and atomic BOM append

1. New staged rows start checked. Select all supports checked/indeterminate/none;
   none disables Review with an accessible explanation. Keep selection through
   changes, picker dismissal and quantity edits. Newly added rows start selected.
2. Review names the destination, selected products/free text, units, quantities,
   row count, price provenance and unresolved checks. Unchecked rows are excluded.
3. State that existing BOM lines, active selection, Cart links and POs stay unchanged.
   Confirm appends new independent lines; do not move/synchronize/replace rows.
4. The authenticated API revalidates owner, Draft project, reviewed project version,
   published sellable references/units, payload limits and the current facts used
   by any compatibility result it returns. Client prices/rules/ownership are not
   trusted. Changed facts require fresh review; no silent substitutions.
5. Apply the selected mixed batch atomically using a stable request UUID and payload
   fingerprint; exact uncertain retries cannot duplicate committed rows. Do not
   send individual add commands and leave a partially appended build on failure.
6. Preserve inputs on failure; stale-version conflicts require reload/review, not
   automatic rebasing. KTUI success/failure toasts supplement inline feedback;
   no toast/navigation for canceled, blocked or stale-session operations.

The current BOM contract allows at most 200 items and requests are bounded to
64 KiB. Include existing lines in capacity validation; report Too many rows before
confirmation and enforce it on the API. A mixed-batch command may require an
explicit extension of the existing project command API; endpoint shape is not
settled by this document. Builder batches are not Cart copy/link receipts.

Applying a build creates no ProductSnapshot, immutable BOM revision, PO, stock
movement or media retention hold. Those remain associated with later PO locking.
Once appended, ordinary project/BOM editing remains available independently.

## Proposed frontend/domain contracts

Foundation contracts now live in
[builder.models.ts](../solar-ui/src/app/core/models/builder.models.ts); these are
transient frontend types, not persisted collections or connected API commands:

- BuilderRequirements: project metadata context, explicit optional planning goals.
- BuilderCategoryDefinition: grouping/order and public catalog category mappings.
- BuilderRow: stable staged ID, group, store reference or free text, unit, quantity,
  optional notes and transient selected state; separate rows even for repeated SKUs.
- BuilderSuggestion: reviewed rule provenance, proposed rows and unresolved inputs.
- CompatibilityCheckResult: rule/version/state, affected rows, reasons/missing facts.
- BuilderReview: reviewed project version, selected row identity, stable request
  identity and current-fact context guard. Prices are not write authority.
  ApplyBuilderBatch remains a future authenticated API contract, not implemented.

Reuse existing Project, BOMItem, ProductReference, public CatalogProductDetails and
session/transport conventions. Stage in memory for the MVP with dirty-navigation
protection; no new persistent Build entity or Firestore collection is required.
If draft persistence/history/share/export is wanted, specify ownership, recovery
and retention separately before adding it.

## First five implementation tasks

1. **Contracts and product-data audit.** Inventory existing public category/unit/spec
   support; document gaps, group mapping, staged multi-row DTOs and rule states.
   Select the first verifiable rules without promising complete electrical design.
   Create/update structured rule specs and index entries before implementation.
2. **Category-table builder shell.** Add the owned-project entry/route, empty Choose
   rows, multiple store/free-text rows, row-specific Change/Remove/Qty, checkboxes,
   price/capacity/unknown totals, responsive green theme and dirty-form protection.
3. **Connected component picker.** Add bounded API category/search/brand filtering,
   10-row cursors, published images, public facts, failure/retry and stale fences.
   Add another must append; Change must target only one stable staged row.
4. **Requirements, suggestions and compatibility.** Implement reviewed deterministic
   rules over verified public facts, alternatives, stale-result handling, group
   checks and honest Unknown/Incompatible/Not applicable explanations.
   Keep every rule's code, versioned documentation and fixtures/tests aligned;
   introduce the documentation parity gate with the executable registry.
5. **Reviewed atomic BOM application and verification.** Extend project commands
   for one retry-safe selected mixed batch, concurrency/access validation and toasts;
   test cancellation, partial-failure prevention, ownership and independent lines.

Task 1's schema/code audit, category/row/result contracts and first pure validator
are implemented (2026-10-11); see [audit and gaps](../docs/BUILDER-DATA-AUDIT.md).
No live product facts were added. Source-backed authoring/public projection and
full dispatcher remain prerequisites for task 4. The doc gate is a foundation
part of task 4, not delivered suggestions/UI. Tasks 2-5 otherwise remain pending.
Follow the project's user-requested
model pinning policy; delegate bounded easier slices to Luna when implementing.
PO status/lock decisions do not block a planning-only builder, and are not settled
by building it. No other commercial/inventory feature is bundled into these tasks.

## Acceptance criteria

- One category holds multiple products, repeated product rows and free text; each
  row retains its own ID, unit, quantity and notes. Other categories are untouched.
- Add another, targeted Change, Remove and empty Choose states work after reload
  of the current route's owned project context; unsaved staged input is not falsely
  claimed persisted. Failed requests retain editable inputs and selected rows.
- Selection defaults/all/indeterminate/none are correct; only checked rows appear
  in review and the atomically appended batch. Cancel makes no project changes.
- Mixed panel models/multi-unit arrangements never become compatible by default;
  unknown specifications produce actionable Unknown results, not invented passes.
- Prices, unavailable products and unpriced requirements are honest; nameplate
  sums, subtotal/budget and row counts are distinct from verified design/stock.
- API picker matches can appear beyond page one. Combined filters, clear, retry,
  option stability and stale result suppression obey the shared table guidelines.
- API tests reject foreign ownership, archived destinations, invalid units,
  unpublished new references, malformed quantities, injected prices and stale
  project versions. Exact replay creates no duplicates; failed batches are atomic.
- Existing BOM lines, active project, Cart history/links, POs and stock are intact.
  No snapshots/revisions are created by staging or applying ordinary BOM rows.
- Test DOM interactions, rule fixtures and fixed-loopback demo Firestore scenarios;
  run relevant frontend/backend tests, type checks and production builds.
- Separately verify desktop/mobile/light/dark rendering, real images/fonts/glyphs,
  keyboard focus, dialog dismissal and hover-only tooltips. Mockup DOM checks do
  not count as completed application or real-browser verification.

## Deferred features and open decisions

Advanced load/yield/backup sizing, wiring/string/MPPT assignment UI, engineering
sign-off, public sharing, saved build history, seller/offer comparison, bulk
replacement of existing BOMs, automatic substitutes, checkout/payment, POs and
stock commitments are outside the initial scope. Exact typed specification fields,
verified rule sources/coverage, category mapping, sizing assumptions and ranking
policy need review during task 1, rather than being guessed from the mockup.

## Related records

- [Plan index](README.md), [customer roadmap](USER-FACING-PLAN.md),
  [admin dependencies](ADMIN-PRODUCT-MANAGEMENT-PLAN.md).
- [Current account/BOM contract](../docs/ACCOUNT-PROJECTS.md),
  [frontend models](../docs/FRONTEND-MODELS.md),
  [panel specifications](../docs/PANEL-SPECIFICATIONS.md).
- [Published products](../docs/PRODUCT-PUBLICATION.md),
  [inventory boundary](../docs/INVENTORY-MANAGEMENT.md),
  [cost/security infrastructure](../docs/INFRASTRUCTURE.md).
