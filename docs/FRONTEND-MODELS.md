# Frontend model contracts

MCB extension (2026-10-12): private/public product DTOs and catalog Product views
accept optional protectionType: MCB|ATS|null and mcbSpecifications:
{type: AC|DC, amperage: number}|null. Explicit MCBs require complete ratings,
including drafts, and category Circuit breakers. ATS is a separate category
with no MCB specifications; other/legacy records remain unclassified. Amperage is
positive finite amperes, not a formatted string.
ATS also requires atsSpecifications: {amperage: number} on every create/Save/Publish.
Missing/null legacy ATS ratings remain readable as unknown; outbound validators
and forms require completion. Clear inactive subtype specifications explicitly.
Public details retain these typed facts but not private sourcing URLs. See
[MCB specifications](MCB-SPECIFICATIONS.md) for validation/preservation semantics.

Supplier sourcing extension (2026-10-12): private ProductCreateInput,
ProductUpdateInput and AdminProduct accept optional supplierUrl. Legacy omission
is valid; empty means unset. HTTPS source links retain the complete variant query
and are required for Shopee products in create/edit/publication validation.
PublishedProduct and public catalog models deliberately exclude this private field.
See [admin catalog management](ADMIN-CATALOG-MANAGEMENT.md) for validation and
transactional enforcement. Unknown price/image information is never synthesized.

Actor presentation update (2026-10-11): private InventoryMovement retains
actorUid for audit/consistency checks and adds optional actorName, a canonical
server-derived display name of at most 160 characters. Legacy omission is valid;
present invalid/empty/UID-equal names are rejected. History and movement CSV show
the name or "Name unavailable", never the UID. Balance export actor names are not
projected yet, so that column uses the unavailable label rather than updatedBy.
See [inventory management](INVENTORY-MANAGEMENT.md) for snapshot/legacy resolution
and cost bounds.

Builder foundation update (2026-10-11):
[builder.models.ts](../solar-ui/src/app/core/models/builder.models.ts) adds ordered
category definitions, independent store/free-text staged rows, optional planning
requirements, scoped rule results and transient suggestion/review context. New rows
start selected; repeated references are not merged. Cables/Other have no store
category mapping yet; free text stays unpriced. Context captures account/project/
project-version/stage-version/fact identity for future stale-result fencing; types
alone do not implement it. No builder page, ApplyBuilderBatch API, saved Build,
ProductSnapshot or stock mutation is added. See [data audit](BUILDER-DATA-AUDIT.md)
and [builder plan](../plans/PROJECT-BUILDER-PLAN.md).

Account Projects management update (2026-10-09): `AccountProject` extends Project
with an operational concurrency version. `ProjectListQuery` carries optional
search/status/classification/configuration/workScope and limit; `AccountProjectPage`
contains the returned items, continuation and active preferences. `ProjectManagementAction`
separates edit-details/archive-project/restore-project/duplicate-project from BOM
line commands (whose restore action is removed-line Undo). Commands capture the
reviewed project version and retry identity; these are not PO snapshots/revisions.
See [account Projects](ACCOUNT-PROJECTS.md) for the connected implementation.

Physical inventory extension (2026-10-09): `core/inventory.models.ts` adds
`InventoryLocation`, `InventoryBalance`, `InventoryMovement`, `InventoryRow`,
paged responses and explicit location/stock command DTOs. `InventoryApiService`
uses the shared authenticated transport, fixed admin routes and runtime validation.
Balances are nullable (Unknown, distinct from counted zero), keyed by product and
location, and tied to the product's fixed unit. Stock commands carry both product
and balance concurrency versions plus a retry UUID. Movement history is immutable;
these versions are operational concurrency tokens, not locked PO snapshots.
See [inventory management](INVENTORY-MANAGEMENT.md) for persistence and scope.

Product-image extension (2026-10-08): private create/update/master DTOs and public
product projections gain optional images: ProductImage[] (up to six canonical
uploaded image descriptors). Each descriptor carries id, url, thumbnailUrl,
width and height; first is primary. Legacy images remain absent, not
manufactured. Assets are immutable content-derived objects; ordinary BOM saves
still do not create snapshots. See [product images](PRODUCT-IMAGES.md).

Panel specification update (2026-10-08): `PanelSpecifications` is a bounded,
optional text map carried by admin product inputs/records, published DTOs and
the current `Product` view. Brand stays on the general product record. The 15
panel-specific fields, compatibility, units and publication behavior are documented
in [panel specifications](PANEL-SPECIFICATIONS.md). These fields do not add PO
snapshot capture or engineering calculations.

Publication update (2026-10-07): AdminProduct now supports draft/published state,
safe concurrency versions and publishedVersion. ProductUpdateInput and
ProductPublicationInput carry requestId/expectedVersion. PublicCatalogService
uses a separate exact PublishedProduct DTO; supplier/actor fields stay private.
The injected planning product source has no sample fallback. None of these
operational versions are PO snapshots/revisions. See [publication](PRODUCT-PUBLICATION.md).

Admin creation update (2026-10-07): separate API DTOs now live in
`core/admin-catalog.models.ts`: `SupplierCreateInput`, `ProductCreateInput`,
`AdminSupplier`, `AdminProduct`, and `AdminPage<T>`. They represent private
supplier masters and draft product records, not customer catalog projections or
PO snapshots. Server-owned metadata is response-only; writes accept an explicit
idempotency UUID. See [admin catalog creation](ADMIN-CATALOG-CREATION.md) for
field limits, storage and verification boundaries. Do not replace customer BOM
and retained purchase-order details with these minimal draft DTOs.

Recorded: 2026-10-06 (Asia/Manila).

Auth/Firestore foundation update (2026-10-07): `CustomerProfile` is reused by the
on-demand `StoreApiService` self-profile response. A separate `CustomerProfileEnvelope`
adds a nullable concurrency `version`; editable input includes `expectedVersion`
but never a customer ID, email, role, claim or timestamp. The server independently
validates/persists its own profile schema in `store-dev`. No Firebase SDK objects
or credentials enter the shared DTOs. This does not connect the existing synthetic
project repository, assign guest/preview data to an Auth UID, or implement PO
history. See [integration foundation](FIREBASE-INTEGRATION.md).

Implemented TypeScript contracts for the [user-facing plan](../plans/USER-FACING-PLAN.md).
Import through `solar-ui/src/app/core/models.ts`; the new definitions live in its
adjacent `models/` directory. These are frontend DTOs and transient view/input
contracts, **not an implemented backend, database schema, or purchasing workflow**.
No Firebase SDK/services, migrations, or deployments were added by the
model-contract work. Subsequent layout separation added shopping/customer/admin
shells, retained `solar.bom.v1` behind `/draft`, and made the legacy guest service
stock-independent with visible unavailable references. The bounded My projects
preview now uses the Project contract in browser-local storage under
`solar.projects.preview.v1`, with a synthetic local-preview owner. This is not real
account ownership or backend persistence. Guest-list history/copy now has a local
runtime adapter; favorites, account services, and PO contracts remain disconnected.

## Model inventory

Admin New product preview extension (2026-10-06): separate feature-local models
in `features/products/product-draft.ts` define `NewProductInput` (form strings),
`ProductInputErrors`, `PreviewProductUnit` (`unit`, `panel`, `kit`) and
`PreviewProductDraft`. Drafts have generated IDs, schema version 1, draft state,
normalized SKU/name/brand, nullable fixture category/unit, plain-text description,
nullable `Money` and ISO creation/update timestamps. Blank price is unknown;
explicit zero is free. PHP input converts to integer centavos without storing a
floating-point peso value. Unit/category are never defaulted or implicitly converted.

`ProductPreviewStore` exposes `CreatePreviewResult`, a readonly signal of runtime
frozen drafts and a private in-memory request map for idempotent creation. Neither
the map nor the store is a DTO or durable backend. Refresh/close clears all drafts;
no browser storage, fixtures, customer data, SDK calls or published projections
are mutated. `PRODUCT_PREVIEW_ENABLED` defaults to `isDevMode()` and disables
direct creation/editor navigation in production; it is not an admin role grant.
These are not `ProductMaster`, `ProductWorkingCopy`, `CatalogProductDetails`,
`ProductSnapshot` or PO revisions; optional price has no settled tax/offer policy.
Unknown stock/media/supplier sourcing remain absent rather than manufactured.

Feature-local `AdminProductListRow` adapts demo `Product` or `PreviewProductDraft`
without changing either source. It carries nullable price/stock/date and a source
reference for the appropriate details dialog. Fixture lifecycle/dates stay unknown;
only created drafts have draft state and real timestamps. This is a list projection,
not public catalog availability or an inventory ledger. Editing existing rows,
structured specs/media, publishing and authoritative admin DTOs remain future work.
Build, app/spec checks and 142 tests/23 files pass for the extension. The older
verification counts below are historical; browser flow/theme/focus checks are in
[the admin plan](../plans/ADMIN-PRODUCT-MANAGEMENT-PLAN.md).

Admin-domain policy extension (2026-10-06): `core/admin-access-policy.ts` defines
`AdminAccessPolicy` (`adminEmailDomains`) and `AdminEmailIdentity` (`email`,
`emailVerified`). `DEFAULT_ADMIN_ACCESS_POLICY` contains `solar.dumaget.me`.
`matchesAdminEmailPolicy` checks a verified identity against an explicit valid
policy using exact, case-insensitive domains. Subdomains, suffix lookalikes,
wildcards, missing/invalid policies and unverified identities fail closed.
This pure helper is not wired to session grants, route guards or backend access.
No email fields were added to persisted pending actions or the current minimal
Firebase session. Authoritative policy management, token verification, role
assignment/revocation and server enforcement remain unimplemented; browser
configuration alone cannot confer an admin role. See [AUTHENTICATION.md](AUTHENTICATION.md).
The list is currently code-configurable; no settings screen or cloud policy store
was added. Build, app/spec type checks and 105 tests/18 files pass for this extension.

Google-auth extension: `CustomerSession` now carries `customerId` (Firebase UID),
optional `displayName`, and the provider marker `source: 'firebase'`. Only the SDK
observer supplies production identities. `AuthSessionService` exposes
`initializing`, `signed-out`, `signed-in`, and `unavailable` plus busy/error state;
`AuthDriver` is the injectable SDK seam. `app.config.ts` connects its readonly
session to `CUSTOMER_SESSION`. Default isolated tests have no network driver.
No email, OAuth credential, access token, ID token, password, or admin key is
included in these app session/intent records. Firebase manages its own session
credentials through browser-session persistence.

Authentication is not project authorization: the synthetic repository rejects
every production Firebase session, even a UID equal to `local-preview`.
Signing in/out never adopts, clears, snapshots, or revises existing local data
and never auto-executes pending intent. Project ownership enforcement and
account-scoped persistence remain future work. The supplied OAuth support email is
`mark@solar.dumaget.me`. Google provisioning completed but returned subtype
`IDENTITY_PLATFORM`, not the approved `FIREBASE_AUTH`; authorized domains are
incomplete, no login was attempted, and live OAuth verification is not complete.
The storefront auth flag remains off pending a safe recovery path.
This extension passes build, app/spec checks and 99 tests/17 files. See
[AUTHENTICATION.md](AUTHENTICATION.md); older counts/status below are historical.

Frontend guest-access extension: `core/customer-access.service.ts` defines
`CustomerSession` (provider-owned, default null) and transient
`PendingCustomerAction` (`route`, `product`, or `guest-list`). Pending intent stores
only a validated return URL and the relevant product reference/quantity or list
ID/review fingerprint, not credentials, login flags, project details, snapshots,
or PO revisions. Its separate sessionStorage key `solar.sign-in.pending.v1` has
schema/shape/size validation and a 24-hour restoration limit; failed storage retains
memory-only intent with a warning. No pending action executes automatically.

The current synthetic project repository is not account persistence. Real customer
IDs cannot unlock it; only injected test sessions exercise local project workflows.
Normal `/my/**` navigation is blocked until authentication and account-scoped data
integration. Existing preview data is retained unchanged. This frontend boundary
does not enforce backend ownership or provide an actual authentication service.

This extension passed the production build, all 88 tests in 15 files, and app/spec
TypeScript checks. Browser guest-gate/theme/focus checks pass; real session loading,
account-owned persistence and post-login continuation remain unimplemented.

Runtime preview extension: `ProjectService` now supports product additions,
atomic local creation with an initial product, free-text add/edit, quantity edits,
remove/Undo, and independent project BOMs. `core/project-bom.ts` provides transient
`PendingProduct`/`FreeTextInput`, validation, fixture-reference resolution, current
per-line estimate projection, and formula-safe CSV generation. These are local
adapters, not new backend DTOs or complete catalog-detail/history adapters.
The shared wizard accepts an optional pending product; each confirmed addition
creates a separate line and stable request ID. `BomSelection` semantics are
implemented as transient checked-row view state. New free-text lines are unpriced;
existing manual estimates are rendered separately and retained on text edits,
but manual estimate entry/tax policy remains pending. Missing or incompatible live
catalog references remain unpriced store-product lines rather than being dropped.
No snapshots, revisions, or PO records are created by these flows. The separate
guest-list copy flow below creates only local copy receipts.

`GuestEquipmentList`/`GuestEquipmentListHistory` and `GuestListCopyReceipt` are now
used at runtime. `core/guest-lists.ts` validates history, adapts valid legacy rows,
creates fresh identities, and defines transient `PendingGuestList` (list ID plus
an all-row review fingerprint). The fingerprint is not a product snapshot or revision.
`BomService` projects the current list into the existing demo `DraftItem`/`BomLine`
views; `ProjectService` owns the single local envelope transaction. An optional
`guestHistory` field extends the existing schema-1 envelope without changing project
DTOs. Old envelopes remain readable. `solar.bom.v1` is preserved as a recovery
backup; migration is write-free until the first successful save, after which
only the shared envelope is authoritative for guest lists.

All source rows are revalidated and copied as independent destination lines in
one write with the receipt, including when creating the project. Quota failures,
empty/changed reviews, unavailable units/products, and archived destinations do
not publish a partial batch or link. Identical request retries do not duplicate;
new requests cannot re-copy any linked list. Later source edits retain the original
receipt and mappings, including when original source or destination rows are removed.
Confirmed new-list creation retains previous content/links and reopening never
unlinks it. Foreign receipt owners and missing projects render generic link labels,
not inaccessible names/links. These checks are local safeguards, not account-switch
authorization or a cross-tab compare-and-swap; connected enforcement is still required.

| Module | Models / values | Responsibility |
| --- | --- | --- |
| Existing `core/models.ts` | `Product`, `Supplier`, `Category`, `ProductVisual`, `PriceTier`, `DraftItem`, `BomLine` | Demo types retained as views; migrated guest lists use the typed history envelope and stock-independent quantities |
| `models/shared.models.ts` | `EntityId`, `IsoDateTime`, `CurrencyCode`, `Money`, `TaxBasis`, `ProductReference` | Shared JSON-safe values and stable product/variant/unit references |
| `models/shared.models.ts` | `CustomerProfile`, `CustomerPreferences`, `Favorite` | Account-owned public/customer data; active project is per customer, not per project |
| `models/catalog.models.ts` | `CatalogProductDetails`, `DisplayReference`, `PublicSupplierDetails`, `ProductSpecification`, `ProductOption`, `CatalogPricing`, `CatalogPriceTier`, `ProductAvailability`, `CatalogAsset` | Complete customer-visible catalog data; no private supplier costs or credentials |
| `models/catalog.models.ts` | `ProductSnapshot`, `RetainedProductAsset` | Immutable typed historical details and durable asset identities for locked PO revisions |
| `models/project.models.ts` | `ProjectDetails`, `NewProjectDraft`, project attribute unions/constants | Independent classification, installation, configuration, and work-scope selections |
| `models/project.models.ts` | `Project`, `ProjectBom`, `BomItem`, `StoreProductBomItem`, `FreeTextBomItem`, `ManualEstimate`, `StoreProductResolution` | Continuously editable mixed-line planning data; missing products remain identifiable |
| `models/project.models.ts` | `BomSelection`, `AddToProjectSource`, `ProjectDestination` | Transient checked-row selection and active/other/new project modal state |
| `models/project.models.ts` | `GuestEquipmentItem`, `GuestEquipmentList`, `GuestListCopyReceipt`, `GuestEquipmentListHistory` | Store-product-only local lists, one-time copy association, and retained fresh-list history |
| `models/purchase-order.models.ts` | `PurchaseOrder`, `UnlockedPurchaseOrder`, `LockedPurchaseOrder`, `PurchaseOrderItem`, `ProvisionalLinePricing` | PO-owned provisional data versus a locked order envelope |
| `models/purchase-order.models.ts` | `LockedPurchaseOrderItem`, `PurchaseOrderRevision`, `PurchaseOrderStatusEvent` | Complete locked content, amendments, and independent status events |
| `models/purchase-order.models.ts` | `CatalogPriceBasis`, `PricingProvenance`, `AgreedLinePricing`, `PurchaseOrderTotals`, `PurchaseOrderTerms` | Explicit pricing provenance, compatible quantity-tier basis, commercial totals and terms |
| `models/purchase-order.models.ts` | `PurchaseOrderStatus`, `PROPOSED_PO_STATUSES`, `PaymentStatus`, `ProjectQuantitySummary` | Proposed vocabulary and server-calculated quantity reporting; no transition/finality policy |

## Relationships and boundaries

Latest guest adapter verification: build, 77 tests in 13 files, app/spec type checks,
and desktop/mobile browser checks pass (2026-10-06). Nine new core transaction tests
and six UI-flow tests cover lazy migration/backup, atomic batch/link/create,
failure/retry, all-row wizard review, stale reviews/tabs, editable linked contents,
new/reopen history, and foreign-link label suppression. Existing BOM test fixtures
now emulate persistent storage and assert the canonical envelope rather than
overwriting the retired legacy backup. Actual CSV file delivery remains unverified.

```text
Customer
  ├─ Profile / Preferences (optional activeProjectId) / Favorites
  └─ Projects
       ├─ one embedded ProjectBom → independent store-product/free-text lines
       └─ multiple PurchaseOrders (referenced by projectId)
            ├─ unlocked → own provisional items, proposed totals/terms
            ├─ locked → effectiveRevisionId
            │    └─ immutable revisions → agreed items/totals/terms
            │         └─ store-product items → complete ProductSnapshots
            └─ independent status events

Local guest list history → currentListId + retained lists
  └─ linked list → copy receipt → customer/project + source/destination line IDs
```

Project BOMs are embedded in `Project`, so even an empty project carries its own
BOM. Its `projectId` must agree with the enclosing project's ID. Separate PO
records refer to that project rather than being embedded in its mutable BOM.
Each addition has a new line ID, including repeated additions of the same product.
Source BOM-item references are for tracking, not required historical lookups.

Persisted planning lines hold product references, not ProductSnapshots. Store
product details/prices are resolved from the live catalog; `StoreProductResolution`
can flag an out-of-stock or missing reference without changing the line type or
dropping the requirement. Free-text estimates explicitly distinguish `unpriced`
from `manual-estimate`; unknown price is not zero and manual tax remains unspecified.

FreeTextBomItem optionally carries componentCategory (Inverters, Panels,
Batteries, Mounting, Circuit breakers, Surge Protection Device, ATS, PV Isolator or MCCB), also accepted by FreeTextInput and the
authenticated free-text command. The component picker seeds this explicit value;
frontend/backend parsing rejects null/unknown categories and store-product misuse.
Omitted legacy values stay under Other requirements, never inferred from titles.
Edits omitting the field preserve saved categories. Reload, duplicate and Undo
retain it. This additive schema-v1 field is UI grouping/presence metadata, not
verified electrical facts, ProductSnapshots or a compatibility result.

Typed free-text ATS additionally carries componentProtectionType: 'ATS' and
amperage: number, with componentCategory: 'ATS'. Explicit legacy Protection/ATS
stays readable; untyped legacy Protection is grouped as Other. Positive finite
amperage <= Number.MAX_SAFE_INTEGER is mandatory, with fractional ratings
allowed. Models/FreeTextInput, frontend/account parsers and API validate this
metadata; edits preserve it and validate the effective merged line. Store-product
lines cannot supply these fields. They are user-entered planning facts, not
verified catalog ratings or compatibility approval. See BOM-COMPONENTS.md v5
and [product taxonomy](PRODUCT-CATEGORIES.md). Product/PublishedProduct category
may be null only to display unclassified legacy data; selectable categories do not
include Protection or Other.

`BomSelection` is view state: initialize all project rows checked when presented,
then preserve explicit deselection. It is not a property of BOM items, an approval,
or a PO status. Guest lists have no free-text items or checkbox selection.
`AddToProjectSource` excludes project BOMs; guest-list eligibility still requires
checking that the current list is unlinked. History retains earlier linked lists
when a new empty current list is created. A receipt records list/customer/project,
copy time, request identity, and line mappings. Reopening cannot authorize re-copy;
account switching must hide inaccessible linked project information.

## Project inputs

Stable lowercase codes are used in contracts; UI labels are presentation concerns.
The arrays include the initial recommended Industrial, Agricultural, and
Institutional/Public extensions; Utility-scale is not included.

- Classification: `residential`, `commercial`, `industrial`, `agricultural`,
  `institutional-public`, `other`.
- Installation: `rooftop`, `ground-mounted`, `carport`, `other`.
- Configuration: `grid-tied`, `hybrid`, `off-grid`, `undecided`.
- Work scope: `new-installation`, `expansion`, `retrofit`, `maintenance`.
- Project lifecycle: `draft` or `archived`, independent of PO state.

`createNewProjectDraft()` returns a fresh input object with installation `rooftop`
and the other required choices `null`. A saved `ProjectDetails` requires actual
selections; reopening an existing project must not reapply the default.
Validation of names, optional Other descriptions, owner access, duplication, and
archive eligibility belongs to subsequent UI/services and backend work.

## Purchase orders and history

`PurchaseOrder` is a discriminated union using **`commitment`**, not a status-order
comparison. An unlocked order has provisional items and null revision/lock fields.
A locked envelope requires an effective revision ID and lock timestamp, and rejects
provisional item/totals/terms fields. Read commercial content from that revision.
Cancelled orders can remain unlocked or locked; cancellation never fabricates or
removes history. `replacesPurchaseOrderId` identifies a replacement separately.

The nine status codes mirror the plan's suggestions only. Confirmed is still a
proposed lock point; these types do not enforce a transition matrix, determine
final statuses, reserve stock, or trigger snapshots. `paymentStatus` is separate
and nullable until payment tracking is connected. No separate quotation entity or
immutable BOMRevision exists.

A locked product line requires its embedded `ProductSnapshot`, whose payload
retains SKU/name, source/version, brand/category, description, full specifications,
unit/options, public supplier details, pricing/tier basis, as-of availability, and
retained assets. Free-text locked lines retain their full text/unit/quantity and
agreed pricing. Snapshot IDs tie capture to the specific PO and revision. A revision
retains commercial totals/terms, actor/time, reason, number, and previous revision.
Status events remain separate; progression alone does not create a new revision.

`RetainedProductAsset` requires a durable object key, object version, and SHA-256
identity instead of a mutable/expiring URL. A trusted service must actually retain
the object and resolve authorized display/download URLs. Type declarations do not
provide storage, retention, immutability, or deletion protection.

Duplicate SKU demand must still be aggregated by stable product/variant/unit and
inventory pool during server review/lock/amendment. A `CatalogPriceBasis` records
offer/tier schedule and aggregate quantity separately from line identity; currency
is carried by `Money`. Different pricing groups cannot bypass stock aggregation.
Tier eligibility, totals arithmetic/tax rounding, concurrency, own-hold credit on
amendment, and lock transactions remain backend rules, not frontend calculations
implemented by these contracts.

`ProjectQuantitySummary` is a read projection, not a source of truth. Ordered
quantities use effective locked revisions and approved cancellations; delivered
quantities already belong to ordered totals. Removed/unmatched source lines retain
their PO-item IDs. Remaining-to-order and over-ordering must not double-count old
revisions or silently modify the BOM. Detailed reporting/payment/fulfillment rules
remain TBD; no delivered-status policy is inferred here.

## Serialization, compatibility, and validation

- All DTOs use plain values, arrays, string IDs, and ISO UTC strings, without
  Firebase SDK objects, `Date`, `Map`, `Set`, or service dependencies.
- New monetary values are **integer PHP centavos** (`Money.amountMinor`). Existing
  demo `Product.price`/`PriceTier.unitPrice` remain peso numbers: convert explicitly
  in a future adapter; never pass them through as centavos or invent missing details.
- Stable `unitCode` is for sellable identity, not implicit conversion. Free-text
  unit labels cannot be pooled with catalog units automatically.
- `isPlanningQuantity()` accepts positive safe whole numbers and never checks
  stock. It does not replace the existing demo service or migrate `solar.bom.v1`.
- `schemaVersion: 1` marks new project/list/order/snapshot/revision contracts.
  The bounded project preview stores projects and active selection using its
  dedicated `solar.projects.preview.v1` browser-local store and synthetic
  `local-preview` owner; this is a prototype-specific adapter, not account ownership
  or a server persistence contract. Malformed/foreign local data is protected from
  overwrite, and its basic stale-tab read comparison is not a server transaction.
  The old browser draft stays in its existing ID/quantity shape under
  `solar.bom.v1`; `/bom` redirects to `/draft` without renaming that key.
  New-contract guest history/copy migration remains pending.
- New contracts use readonly properties/arrays for immutable state replacement and
  historical safety at compile time. This does not freeze runtime objects or
  validate incoming JSON. Validate money, timestamps, IDs, quantities, owner access,
  cross-record associations, asset hashes/versions, revision sequence, pricing
  completeness/currency, and legal transitions before trusting stored/API data.
- Enforce one-time copying, owner isolation, atomic PO locking/snapshot capture,
  idempotency, and historical protection in trusted backend rules/services. Frontend
  unions, disabled buttons, and receipts alone are not authorization mechanisms.

## Verification

Inventory operations (2026-10-09) extend the separate private admin contracts in
inventory.models.ts: InventoryCountInput, InventoryTransferInput/Result,
InventorySettings/Input and InventoryStockStatus. InventoryManualMovementKind
retains the six adjustment kinds; the read ledger additionally supports count and
linked transfer-in/transfer-out. Inputs carry expected product/pool/settings
versions and request UUIDs; transfer results include both authoritative balances
and their movements. Rows include nullable settings and server-computed status,
and filters can request that status before API pagination. Counts and transfers
must use their dedicated methods, never the manual-adjustment endpoint. CSV helpers
serialize authoritative pages and preserve transfer links/threshold metadata.
These models do not implement reservations or purchase-order policy. See
[inventory management](INVENTORY-MANAGEMENT.md).

Latest local catalog/project-BOM slice (2026-10-06): production build, 62 tests
across 11 files, and app/spec TypeScript checks passed. Added tests cover atomic
initial-item creation/retry, independent duplicate-product lines, confirmation
validation, archived guards, stale/failed local writes, missing products, free-text
identity/editing, selection retention, remove/Undo, CSV provenance and formula
escaping. Browser checks confirm the local catalog/wizard/mixed-BOM journey and
responsive keyboard/theme behavior. CSV content is verified by tests; actual
file delivery is still unverified after an in-app download-event timeout.
The 21/30/46-test results below remain historical.

Model-contract baseline, 2026-10-06: production build passed, all **21 tests** passed (including
9 new model-contract tests), and strict TypeScript checks passed for both app and
spec configurations, including the negative compile-only contracts below.

After layout separation, the production build, all **30 tests**, and strict app/spec
checks passed. The model contracts themselves were unchanged.

The subsequent bounded project preview production build passed; 46 tests passed in
9 files, and app/spec `tsc --noEmit` checks passed. Browser checks passed for wizard
cancel/focus/Back behavior, successful local project creation and active-project
persistence, mobile navigation and dialog scrolling/focus containment, light/dark
desktop/mobile appearance, loaded fonts/icons, public 2px geometry, admin theme/font
restoration, and a clean console. Viewport overrides were 1440x900 and 390x844; under
user zoom the actual CSS widths were 1309 and 355. The default light viewport was
restored; the sample local project remains in browser storage. The historical results
above predate this phase 2 validation.

`models/models.spec.ts` covers rooftop-only defaults, stock-independent quantity
validation, mixed-line JSON serialization, duplicate line identities, linked-list
history, cancellation on both commitment branches, complete retained history, and
the explicitly proposed status vocabulary. Compile-only negative examples reject
guest free text, missing linked-list receipts, pre-lock revision IDs, historical
live-only product references, project-BOM add sources, mutable historical payloads,
and uncompleted wizard inputs as saved projects.

Run the Angular build and tests, plus TypeScript checking for both configurations:

```powershell
# From solar-ui
npm run build
npm test
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.app.json
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.spec.json
```

Tests validate these contracts, not unimplemented server stock validation, snapshot
creation, PO state transitions, ownership rules, or database connectivity.
