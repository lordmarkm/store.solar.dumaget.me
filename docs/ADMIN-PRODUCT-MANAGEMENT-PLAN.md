# Admin product-management plan

## Table filtering decision (2026-10-09, Asia/Manila)

Clear filters belongs on the same toolbar row as the filters, as a compact
secondary icon-only action with a tooltip and accessible label. This is now
implemented on /admin/products; filter controls reflow on narrow screens.

All table filters/search must be API-side across the authorized dataset, applied
before cursor pagination. Client filtering of loaded pages is not acceptable.
Filter changes and clearing reset the cursor; load-more/retry retain the query.
Search is debounced, and stale query/account/route responses must be discarded.
Combined filters, sorting, counts and option/facet data must use consistent
server semantics. Keep queries bounded and indexed; do not fetch everything,
scan entire collections or automatically add a paid search service.

Current migration status (2026-10-09): the product list now uses bounded API
brand/category/supplier filters and explicitly labeled SKU-prefix search before
pagination, with independent paged options and stale-response fences. Supplier
editing/deactivation and post-Save image cleanup are also implemented. See
[admin management](ADMIN-CATALOG-MANAGEMENT.md) for contracts and verification.
The connected supplier
list's loaded-row search and the fixture inventory table must also be reviewed
against this standard before being presented as complete data browsing.
Retain honest loaded-data labels until the corresponding API behavior exists.
The implementation adds only the seven required store-dev product filter indexes;
no security rules, IAM, database edition/region or website deployment changed.

Acceptance for API migration: validated/allowlisted query parameters, filters
before pagination, matches beyond the first page, combined/empty filters, clear
and retry, stable cursors, complete bounded option sources, auth isolation and
stale-response suppression. Define supported text-search semantics explicitly
before selecting its index/storage design; do not silently narrow substring
search to a SKU prefix or promise unsupported full-text behavior.

Product images (2026-10-08): file selection and clipboard image paste are implemented
in canonical admin create/edit forms, with optimized WebP thumbnails/detail
pictures in an eligible US bucket and a picture requirement for Publish/Republish.
The dedicated bucket exists; the user explicitly approved public reads including
draft uploads. This image slice does not authorize unrelated deployment, rules
or project-wide IAM changes. See [product images](PRODUCT-IMAGES.md) for the
exact contract and verification limits.

Publication update (2026-10-07): product editing and Publish/Unpublish are now
connected to the private API and named store-dev, with a separate public
projection consumed by Catalog. Earlier preview/draft-only completion notes are
historical. [Product publication](PRODUCT-PUBLICATION.md) records the implemented
MVP, including unknown stock/tax, remaining work and verification limits.

Implementation update (2026-10-07): canonical supplier/product lists and create
forms now use the protected API and named `store-dev` persistence. Products are
private drafts; inventory remains a fixture preview. The live Auth/bootstrap
decision and end-to-end cloud UI verification are still pending. See
[admin catalog creation](ADMIN-CATALOG-CREATION.md) for the implemented contract;
historical fixture-only baseline statements below no longer describe these routes.

Recorded: 2026-10-06 (Asia/Manila). Status: roadmap with list and development-only
New product preview implemented; connected product management remains proposed.
This shifts the next planning priority to the administration side; it does not
discard the [customer plan](USER-FACING-PLAN.md) or its BOM/PO requirements.

## Objective and current baseline

Give authorized administrators a reliable workspace to create, organize, review,
publish and retire the store's solar products. Keep catalog identity, customer
pricing, supplier sourcing and physical inventory distinct even when they appear
together on a product detail screen.

Existing `/admin/inventory` and `/admin/suppliers` pages are blue Metronic/KTUI
read-only fixture views. Inventory supports search, supplier/category filters and
product details; its sample quantities/value are not a stock ledger or valuation.
`CatalogProductDetails`, pricing, availability and retained PO snapshot DTOs exist,
but product-management writes and backend persistence do not. The demo `Product`
is not a complete product master; use an explicit adapter rather than expanding it
into the source of truth.

The current fixtures contain six products and five suppliers. The demo product
category is a fixed five-value union, its specifications are display strings, and
its single supplier/depot/stock fields do not model alternate offers or depot
balances. These limitations do not apply to all the newer catalog DTOs: those
already separate structured details, suppliers, prices, availability and assets.

Admin eligibility defaults to a verified exact `solar.dumaget.me` email domain,
with a configurable allowlist. That frontend helper is not authorization. Admin
demo routes are currently public. Production must remain visibly read-only until
trusted authentication and server-enforced admin permissions are implemented.
The isolated development editor is not an admin permission grant or a cloud API.

Auth activation is on hold following the outcome documented in
[AUTH-PROVISIONING-OUTCOME.md](AUTH-PROVISIONING-OUTCOME.md). This plan authorizes no
Auth recovery, new Firebase databases/buckets, shared rules, deployment or cloud
writes. Backend work needs a separately reviewed implementation scope.

## Page map and navigation

### First implemented slice: Products list (2026-10-06)

`/admin/products` now exists and is first in admin navigation. It provides a
read-only six-product fixture projection, SKU/name/brand search, category/brand/
publication filters, name/SKU/price sorting, 5/10/25-row pagination restored from
validated query parameters, empty-state recovery and existing product-detail dialogs.
In this first slice, New product and row Edit were disabled, with focusable
explanatory tooltips. The development-only creation extension is recorded below.
Missing lifecycle/update-date/tax metadata are explicitly unconfigured, not inferred
from customer fixture visibility. Prices adapt fixture pesos to integer centavos;
stock stays labeled sample allocation and does not become an editable balance.

This completed the list-only portion of phase 1, not product-master CRUD or an
authorized backend. At this point create/detail/edit routes beyond the list were
not implemented (View uses a read-only dialog). Existing catalog fixtures, guest lists,
project records and cloud/Auth settings remain unchanged. Production admin routes
remain public read-only previews; this addition does not secure them.

Verification: production build, app/spec TypeScript checks and 119 tests in 20 files
pass; 14 new tests cover projection/query validation/filtering/sorting/pagination,
form/route behavior, details and non-mutation. Existing layout/theme tests include
the Products route. Browser checks verify desktop/mobile light/dark, filter recovery,
pagination after reload, keyboard tooltip/dialog focus/Escape return, mobile drawer,
loaded KeenIcons, internal table scrolling and blue-admin/green-customer isolation.
The list follows `solar-ui-actions`; no vendor CSS, glyph mapping or theme changed.
Default viewport and original light preference were restored.

### Second implemented slice: New product development preview (2026-10-06)

Development mode enables New product at `/admin/products/new` and a memory-only
`ProductPreviewStore`. The `PRODUCT_PREVIEW_ENABLED` token defaults to Angular
`isDevMode()`; production hides the enabled CTA, guards direct editor navigation
back to `/admin/products`, and rejects direct preview-store creation. Tests inject
the flag explicitly. This separation is not authentication or backend authorization.

The full-page blue editor requires unique SKU/name and permits incomplete drafts:
brand, category, sellable unit, plain-text description and provisional customer
price are optional. SKU is normalized to uppercase and checked against fixture
and session draft identities. The bounded preview accepts 1–64 ASCII SKU letters,
digits, dots, hyphens and underscores, starting with a letter/digit; units are the
existing fixture choices `unit`, `panel`, `kit`. These are preview constraints,
not a settled connected SKU/taxonomy policy. PHP decimal input converts exactly
to safe integer centavos; blank is unpriced, zero must be explicit, negative or
fractional-cent amounts are rejected. No tax, supplier cost, quantity, media,
structured specification or availability is fabricated by Save.

`PreviewProductDraft` is a separate JSON-safe preview DTO, not the proposed
`ProductMaster`, a published catalog projection or a `ProductSnapshot`. It has a
generated stable ID, real creation/update timestamps and draft state. Optional
category/unit/price are nullable. Objects are frozen at creation; no persistence,
SDK calls, account ownership, browser storage or PO revisions are added. Each
editor request has an idempotency identity; repeated identical requests return
the same draft, while changed payload reuse and duplicate SKUs fail.

Save returns to the list filtered to that SKU/draft; preview rows have details
dialogs, with absent media and stock explicitly unknown. Cancel/Back restore the
validated prior list URL and confirm dirty input before leaving. Escape/backdrop
on the discard dialog keeps input; failed saves keep the form and focus its error.
Browser reload/close warns about unsaved editor input, but saved preview drafts
still vanish on refresh as the banner states. Row Edit, Publish, lifecycle actions,
customer projection, structured specs/media, full admin DTOs and backend writes
remain unimplemented. Existing fixture/customer records and Auth settings are intact.

Verification: production build, app/spec type checks and 142 tests in 23 files
pass, including 23 additional validation/store/route/editor tests. Browser checks
cover invalid and duplicate inputs, first-error focus, incomplete creation/details,
filtered return, dirty Cancel/Keep/Discard/Escape, refresh loss, mobile/desktop
light/dark, keyboard disabled Publish hints and unchanged blue KTUI/icon treatment.
Default viewport/light preference were restored; synthetic test drafts were cleared
by refresh. No vendor CSS, icon mappings, service configuration or cloud writes.

### Products list extension: Supplier filter (2026-10-06)

The list now includes Supplier beside category/brand/publication controls. Options
show supplier names but use stable fixture supplier IDs; `supplier` is validated
in the URL and intersects all other filters. Supplier changes reset pagination,
Clear filters removes it, and reload/navigation/editor Cancel restore it. Option
choices come from the unfiltered list, so empty intersections remain recoverable.
Unknown URL IDs reset to All suppliers rather than matching brands or display names.

The list adapter carries `supplierId: string | null`. Existing fixtures retain
their explicit supplier link; new preview drafts have no sourcing configuration
and are included under All suppliers, excluded for a named supplier. Brand alone
never assigns a supplier. This supports the current single-supplier fixture only,
not future multi-supplier offers or editable sourcing. No fixture, customer,
inventory, Auth or cloud state changes. Existing blue KTUI controls and responsive
spacing are reused without vendor/theme/icon changes (`solar-ui-actions`).

Verification: production build, app/spec TypeScript checks and 145 tests in 23
files pass. Three added tests cover identity/intersections, supplier-less drafts,
native select events, URL restoration/reset and pagination. Browser checks cover
combined/empty-filter recovery, reload, editor Cancel, keyboard select and mobile
light/dark layout without page overflow. Original filters, light preference and
default viewport were restored after verification.

### Planned page map

Keep the existing blue admin shell, collapsible desktop sidebar, responsive mobile
navigation, system font and vendor card geometry. Customer green/mint styling must
not bleed into admin views or admin overlays.

| Proposed route | Purpose and main actions |
| --- | --- |
| `/admin/products` | Product table; search/filter; New product; row View/Edit; lifecycle actions |
| `/admin/products/new` | Full-page product editor, initially an unsaved draft |
| `/admin/products/:productId` | Admin detail with catalog content, pricing, sourcing, stock summary and activity |
| `/admin/products/:productId/edit` | Edit draft/staged changes with explicit save/review/publish actions |
| `/admin/categories` | Category names, ordering and category-specific specification definitions |
| `/admin/brands` | Brand names and active/archive management |
| `/admin/inventory` | Retained route; stock/depot view rather than the sole product-master editor |
| `/admin/suppliers` | Retained route; supplier master and sourcing relationships |

Routes beyond Products list/development New product, inventory and suppliers are
proposals, not current functionality. Detailed
supplier and stock workflows can follow product CRUD; do not add empty operational
screens that imply a working backend. A full-page editor is preferred for long
specification/media forms; confirmations and short taxonomy forms can be dialogs.

## Product list and editor

The list should show SKU, name/thumbnail, category, brand, publication state,
customer base price with tax basis, stock summary/as-of time, and last updated.
Search by SKU/name/brand; filter by category, brand, supplier, lifecycle and incomplete data.
Use pagination and preserve filter/page state when returning from details. Private
supplier costs are not customer-price columns. Unknown stock is not zero stock.

MVP list actions: New product, View, Edit, Duplicate as draft, Publish/Unpublish,
and Archive/Restore. Duplication gets a new product ID and requires a new SKU; it
does not copy inventory, PO links or committed history. Bulk changes/import/export
are later phases, not prerequisites for a useful editor.

Editor sections:

1. **Identity:** SKU, name, brand, category and stable sellable unit. Generate a
   stable product ID independently of SKU. SKU uniqueness is server validated,
   including archived records; do not silently reuse historical SKU identities.
2. **Customer content:** short/full description, unit label, options and structured
   category-specific specifications, with labels/units and explicit unknown values.
   MVP starts with one sellable configuration per SKU (`variantId: null`);
   multi-variant editing requires its own identity/offer/stock design later.
3. **Media/documents:** primary image, ordered gallery, accessible image descriptions,
   datasheets and other public documents. Show upload/validation progress; allow
   reorder/replace/remove from the working catalog without deleting retained PO assets.
4. **Customer pricing:** base price, currency, explicit tax treatment/rate and
   quantity tiers. Prices use integer PHP centavos in domain contracts, not the
   fixture's peso floats. MVP requires valid known customer pricing to publish;
   request-price/unpriced catalog products need a later DTO/UI extension rather
   than inventing a zero price.
5. **Sourcing:** link one or more suppliers, supplier SKU, internal purchase cost,
   lead time and preferred source. Public supplier information is a separate
   explicit projection, not exposure of the supplier master or internal offers.
6. **Availability:** read-only depot/inventory-pool summary with timestamp and
   link to the inventory workflow. Do not allow stock overwrite in product Save.
7. **Review/activity:** publication checklist, change summary, actors/times and
   conflict handling. Preview uses the customer projection but does not publish it.

Changing a sellable unit/variant identity after it has references should create a
new sellable identity or an explicitly designed migration, not reinterpret existing
BOM quantities or PO lines. Display labels may change without changing unit codes.

## Publication and archive lifecycle

Proposed catalog states: **draft → published → archived**, with explicit Unpublish
back to draft and Restore from archived to draft. Restoring never auto-publishes.
Stock state (unknown/in stock/out of stock) is separate from publication state.
Out-of-stock products may remain visible for planning; they cannot bypass future
server PO stock checks.

- New products are draft-only. Saving a draft never makes it visible in shopping.
- For an already published product, save edits into a working copy; the storefront
  continues showing the last published content until an explicit successful publish.
  Cancel/discard affects only working changes, not the published content.
- Publish validates required content, unique sellable identity, pricing/tax/tier
  consistency, safe ready assets and active taxonomy references. Incomplete drafts
  may be saved; missing requirements appear as a checklist linked to the fields.
- Publish atomically updates the public projection and audit entry. Partial uploads,
  failed validation or stale edits must not replace live content.
- Unpublish/archive removes the product from exploration and prevents new purchases
  or new catalog additions. Existing planning references remain visible as
  unavailable instead of being deleted, clamped, repriced to zero or converted to
  free text. Unpublished private content must not leak through a public lookup.
- Archive is the normal retirement action, with a reason and impact summary.
  Product records and retained historical assets are not hard-deleted by routine
  product management. Destructive cleanup, if ever required, needs a separate
  retention/reference check and explicit approval.
- Store master, working-copy and published-projection concurrency tokens for
  optimistic writes. These are operational edit controls, not immutable catalog
  snapshots or customer BOM revisions. No permanent product-revision history is
  required by this plan; PO-owned snapshots begin only at the agreed PO lock.

MVP can let every authorized admin edit and publish. Split editor/publisher roles
or a separate approval queue only if requested; do not invent extra mandatory
approvals. Existing locked orders do not change when products are edited or retired.

## Proposed domain additions

Existing customer contracts remain unchanged. The isolated editor adds
`NewProductInput`, `ProductInputErrors`, `PreviewProductUnit`, `PreviewProductDraft`
and `CreatePreviewResult` under `features/products`; these are bounded preview
types, not implementations of the proposed admin domain models below. Full admin
types need deliberate schema validation and public/private adapters.

| Proposed model | Responsibility / boundary |
| --- | --- |
| `ProductMaster` | Stable identity, lifecycle, sellable identity, timestamps and concurrency token |
| `ProductWorkingCopy` | Editable customer content and explicit pending changes; optional for a new draft |
| `PublishedProductProjection` | Only approved public content; adapts to existing `CatalogProductDetails` |
| `CategoryDefinition` / `SpecificationDefinition` | Stable category IDs; typed required fields, units and validation |
| `BrandDefinition` | Stable brand ID, display name and archive state |
| `ProductMedia` | Catalog attachment role/order/alt text and durable media identity; preview URLs resolved separately |
| `CustomerOffer` / `PriceTierSchedule` | Public sellable price, tax, currency and tier basis; uses existing pricing DTOs |
| `SupplierProductOffer` | Private supplier relationship, supplier SKU, purchase cost and lead time; never public DTO fields |
| `ProductAuditEvent` | Actor/action/time, changed fields/reason and request identity; not a PO snapshot or immutable BOM revision |
| `InventoryPool` / `InventoryAdjustment` | Later inventory work: depot balances and audited deltas; separate from catalog Save |

`ProductReference` continues identifying product/variant/unit. `offerId` and
`tierScheduleId` in current DTOs need real authoritative records. Supplier purchase
cost is not a customer offer. Public available stock is a read projection, not an
editable master quantity. Asset storage/retention remains a future infrastructure
decision compatible with shared-project isolation; hosting documents do not prove
that a Storage bucket or upload pipeline exists.

Adapters must address contract gaps explicitly: the current public pricing DTO
requires a base price, and availability entries require a quantity and observation
time. Omit unverified availability entries and label the absence as unknown; do not
fabricate zero quantities/timestamps. Extend contracts deliberately for request-price
products or media alt text rather than pretending unsupported fields already exist.

## BOM, pricing and PO compatibility

- Project BOMs stay continuously editable and resolve current catalog details and
  estimates. Catalog changes can alter current estimates; show changed/unavailable
  information and require fresh PO review. Never silently change BOM quantities.
- Saving a product, draft, working copy, guest list or BOM creates no
  `ProductSnapshot` or `PurchaseOrderRevision`.
- An unlocked PO remains provisional. Revalidate product availability, current
  offer/tier eligibility and stock before its lock; detect catalog changes between
  review and confirmation instead of silently substituting changed terms.
- At the future agreed lock transition, a trusted service atomically retains
  complete public product details, agreed pricing/terms/quantities, and durable
  images/documents in the PO-owned snapshot/revision. Capture published content,
  not unpublished working edits. PO statuses and the lock threshold remain TBD.
- Locked history renders from its own complete snapshot and retained asset versions
  without a live product lookup. Rename/archive/replace media cannot alter it;
  authorized amendments create a new PO revision, never rewrite the old one.
- Separate BOM lines for the same product remain separate. Future stock validation
  aggregates by product/variant/unit and inventory pool; pricing groups additionally
  use compatible offer/tier schedules. Supplier changes cannot bypass aggregation.
- No silent unit conversion, substitute SKU, automatic supplier replacement, or
  propagation into locked commercial records.

## Validation, security and reliability

Authoritative APIs must enforce verified identity and server-controlled admin
permissions on every read/write, including upload endpoints. The configurable
email-domain policy is eligibility input, not a client-granted role. Bootstrap
policy management through trusted operators; deny missing/invalid policy and
handle revocation/account changes. No customer may edit catalog records or read
supplier costs by calling the API directly.

Public responses expose only published customer fields; strip internal notes,
supplier costs/contact secrets and audit-only actor information. Avoid arbitrary
HTML execution in descriptions, sanitize or render restricted content, validate
URLs/files server-side, constrain MIME/type/size and use safe download handling.
Private media must not accidentally become public through guessable paths.
Retained PO attachments need authorized retrieval independent of catalog URLs.

Validate SKU normalization/uniqueness, references, safe whole quantities,
money bounds/currency, explicit tax basis, sorted unique positive tier thresholds
and category-specific types/units. Define permitted tier price policy (for example,
non-increasing prices) explicitly; no hidden tax or conversion defaults. Reject
stale saves with a conflict/reload/compare path, retain unsaved input on failures,
and use idempotent requests where duplicate actions could create records.

Stock receiving/adjustments/reservations, supplier purchasing, fulfillment,
payments and profit calculations are outside initial catalog CRUD. Future stock
adjustments require actor/reason and server transactions, never direct browser
overwrite of an available-quantity field.

## Delivery sequence

1. **Admin contracts and fixture editor.** Add proposed admin DTOs/validators,
   adapters, product list/detail/edit routes and a clearly labeled in-memory preview
   repository. Support draft CRUD and public preview without cloud writes. Keep
   existing guest data, catalog fixtures and local projects intact; admin preview
   changes must not silently mutate the shared fixture array. Reload persistence is
   not promised. Production admin routes remain read-only while authorization is
   unresolved; use isolated development/test fixtures for editing demonstrations.
2. **Lifecycle and taxonomy preview.** Exercise draft/published working-copy
   behavior, validation checklist, categories/brands, duplicate/archive/restore,
   stale-save conflicts and failure/retry. No claimed live publishing or stock changes.
3. **Authorized backend catalog slice — separately approved.** Resolve Auth,
   agree trusted admin roles/policy and catalog schema/rules in named Cloud
   Firestore database `store-dev` within `dumaget-me-solar`, then implement
   server CRUD, public/private projections, atomic publish/audit and optimistic
   concurrency together. Do not expose mutation routes before server enforcement.
4. **Media and commercial integration.** Add approved upload/storage/retention
   pipeline, customer offers/tiers and private supplier offers. Replace customer
   fixtures with the published projection through a catalog repository. Validate
   missing/archived references before switching; no destructive preview-data migration.
5. **Inventory and scale.** Add audited depot adjustments/receiving and availability
   projection; later bulk import with dry run/error report, explicit export fields,
   category-specific variant tools and optional publishing roles. PO commitment/
   retained-history integration proceeds under its own agreed transaction policy.

Next bounded implementation: edit existing in-memory preview drafts with
dirty-state/failure handling, then structured content and a publication-readiness
checklist. The list/create preview is complete, but phase 1 draft CRUD is not.
Retain fixture and production read-only boundaries; no Firebase provisioning is
implied. Full publishing, taxonomy and connected authorization remain later slices.

## Acceptance criteria

- Product editor draft creation, validation, duplicate identity and failure/retry
  work in the isolated preview; no sample stock or live catalog is mutated by Save.
- Incomplete drafts save without publication; Publish explains every blocker.
  Editing a published product leaves its live projection unchanged until Publish.
- Unpublish/archive/restore follow explicit confirmations; restore goes to draft;
  referenced identities/assets are preserved and archived SKUs are not reused.
- Prices serialize/round-trip in PHP centavos; taxes/tiers are explicit. Supplier
  costs never appear in public responses, customer preview or generic public exports.
- Concurrent stale saves cannot overwrite newer work. Failed/duplicate requests
  do not create partial publications or duplicate records.
- BOM/guest references survive unavailable products without quantity loss; unlocked
  PO review detects changed content/price. Locked PO details and attachment bytes
  remain unchanged after catalog edits/retirement when that integration exists.
- Real backend tests reject non-admin writes/private reads, invalid tokens, revoked
  access, invalid policy and forbidden uploads. UI guards alone do not satisfy this.
- Blue KTUI styles remain isolated from green customer views in light/dark modes;
  verify mobile forms/tables, keyboard operation, focus return, dirty-navigation
  warnings, readable errors, loading/empty states and accessible disabled reasons.
- Use installed verified KeenIcons and shared action/tooltip patterns; labeled
  Save/Publish/Archive actions, restrained row icon rails and no guessed glyphs.
- For implementation, run focused tests, app/spec type checks and production build,
  then browser-check admin/customer navigation and overlays. The roadmap's
  implemented-slice notes record actual checks, not working admin
  permissions or deployment.

Datastore decision (2026-10-07): use Cloud Firestore named database `store-dev` in
`dumaget-me-solar` for development, not `(default)`. Explicitly target that database
in clients, rules/index deployments and future triggers. Provisioning and runtime
integration are not implemented; production database selection is not settled.
See [infrastructure decision](INFRASTRUCTURE.md#storefront-firestore-database-decision-2026-10-07).

Open decisions before connected implementation: catalog schema/API ownership,
SKU format/normalization rules, whether supplier identity is publicly displayed,
required specifications per category, tax/tier policy, permitted file types/limits,
media retention policy, and whether editor/publisher permissions need separation.
Existing PO status/lock decisions remain separate; this plan does not settle them.
