# Builder foundation and public-data audit

Recorded 2026-10-11. This is a source-code/schema audit, not a live database
inventory or confirmation of any particular product's electrical ratings.

## Implemented foundation

- [Frontend contracts](../solar-ui/src/app/core/models/builder.models.ts) define
  ordered categories, independent selected staged rows, explicit bank assignment,
  optional requirements, scoped findings and transient suggestion/review context.
  [Tests](../solar-ui/src/app/core/models/builder.models.spec.ts) cover mappings,
  repeated references, default selection, unpriced free text and quantity boundaries.
- [Pure backend rule](../backend/src/builder/rules.ts) and its
  [tests](../backend/test/builder-rules.test.ts) implement nominal bank voltage-class
  membership and a separate unknown-assignment finding. No server route imports
  these evaluators. Synthetic test ratings are not catalog data or recommendations.
- [Documentation gate](../backend/test/builder-rule-documentation.test.ts) runs
  through the existing backend `npm test`; it checks registry/index/spec agreement
  and directly executes every documented single-bank fixture by its stable ID.

There is no builder page, picker, persistent Build entity, suggestion engine or
batch-append API yet. Opening existing Projects/BOM pages remains unchanged.

## Existing data and explicit mappings

| Builder group | Current published categories | Initial boundary |
| --- | --- | --- |
| Solar panels | Panels | Store rows supported by current vocabulary; power remains display text |
| Inverters | Inverters | No verified typed battery/DC voltage facts yet |
| Batteries | Batteries | No verified nominal voltage/capacity facts yet |
| Mounting | Mounting | No reviewed structural/installation suitability facts yet |
| Protection | Protection | No typed protection/rating/connection facts yet |
| Cables & connectors | None | Free-text only until catalog vocabulary is explicitly extended |
| Other | None | Free-text only; never an implicit unfiltered all-product picker |

Source: [backend catalog contracts](../backend/src/admin-catalog.ts),
[frontend category vocabulary](../solar-ui/src/app/core/models.ts), and
[builder mappings](../solar-ui/src/app/core/models/builder.models.ts).
No persisted categories were renamed or extended in this slice.

## Published fields and units

The current `PublishedProduct`/`publicProjection` in
[admin-catalog.ts](../backend/src/admin-catalog.ts) expose ID/version/publishedAt,
SKU/name/brand/category, description, `unitCode`, PHP `amountMinor`, optional panel
display specifications and approved images. They omit supplier private details,
costs and inventory pools. Publication validates required fields and images;
older readable projections may still have no pictures.

Sellable codes are `unit`, `panel`, `kit`. `ProductReference.unitCode` is the actual
identity, not a label to convert or guess. Preserve variantId=null for current
published products. Free-text unit strings do not imply a sellable product unit.
Current positive safe whole quantities are stock-independent; BOM capacity is
200 rows and request-body limit 64 KiB. These remain backend validation boundaries,
not claims enforced by the new TypeScript interfaces.

[PublicCatalogService](../solar-ui/src/app/core/public-catalog.service.ts) parses
the current exact public schema and adapts it to the legacy `Product` view. Its
`stock: 0`, empty depot/supplier and empty price tiers are legacy placeholders,
not proof of no physical stock or authoritative commercial terms. Builder views
must display availability as unconfirmed, not consume that zero as a stock fact.
Use integer centavos, current version and actual public unit; no stock reservation,
implicit tax/shipping or invented quantity tiers.

The richer [CatalogProductDetails](../solar-ui/src/app/core/models/catalog.models.ts)
is a planned DTO, not the current HTTP payload. No complete adapter from the
current published schema exists for it. Do not pretend optional public engineering
facts exist just because the planned DTO has `specifications`.

## Technical-fact gaps

[Panel specifications](PANEL-SPECIFICATIONS.md) are bounded plain strings, including
rated maximum power, short/open circuit fields, max system voltage and dimensions.
They have no structured units, source review, temperature coefficient or verified
operating limits. Never parse marketing text, those strings or SKU/model names to
produce compatibility passes or panel-capacity totals.

The first rule requires a reviewed nominal bank voltage plus verified inverter
supported battery voltage classes, and explicit connection context. AC output
voltage must never substitute for battery/DC voltage. Existing projections supply
neither; absent values must be Unknown. No product facts were fabricated/backfilled.

`ReviewedVoltageFact` is an isolated server-adapter contract, **not** a persisted
public field or a client verification flag. It carries a review status, source
reference, ISO review timestamp and raw typed value; unverified/conflicting,
malformed or source-less values normalize to null. A future authoritative adapter
must load facts from reviewed server records and bind product versions, exact
datasheet identity/revision/section and applicability before exposing checks.
Checking the shape of provenance cannot prove a manufacturer claim is true.

The scoped evaluator consumes already-normalized trusted inputs. It validates
safe IDs/unique rows/whole quantities, bounds rows to 200 and supported class sets
to 32 entries; invalid technical sets become wholly unknown rather than dropping
bad members and manufacturing a pass. Identity/quantity mistakes reject the input.
Bank IDs are explicit, not inferred from a project/category. A future dispatcher
must handle missing/dangling bank references and preserve all bank and unassigned
findings; the single-bank function is not a project-wide approval function.

## Picker/API gaps and next delivery

Current [public routes](../backend/src/app.ts) and
[repository](../backend/src/admin-catalog.repository.ts) support published list
cursors and exact reference reads. The list is 50 records, not a category/brand/
search-filtered ten-record builder picker. Private admin filters cannot simply be
reused to expose drafts/supplier data. Task 3 needs a bounded authorized public
query contract, stable vocabularies, filter-bound cursors and stale response fences.
No indexes, collection scans, realtime listeners or paid services were added here.

Next: task 2's owned-project category-table shell, staged editing, selection/totals
and navigation guards. Task 3 follows with API-side picker filters. Public fact
authoring/projection and explicit bank context precede production rule use in task 4.
Task 5 supplies retry-safe atomic selected mixed-row BOM append. No frontend review
DTO is currently an API write contract; client prices/pass flags remain untrusted.

Related: [builder plan](../plans/PROJECT-BUILDER-PLAN.md),
[rule contract](builder-rules/README.md), [first rule](builder-rules/shared-battery-voltage.md).

## Verification (2026-10-11)

- Frontend: 430 tests / 56 files, including five new builder-contract tests; app
  and spec TypeScript checks and production build passed.
- Backend: 110 tests, including 12 new rule/documentation tests and all eleven
  document fixture IDs; TypeScript check and production build passed.
- git diff --check passed. No live database/service mutation, new dependency,
  cloud provisioning or deployment. No UI was changed, so these checks are not
  browser/visual verification of a builder page or real equipment compatibility.
