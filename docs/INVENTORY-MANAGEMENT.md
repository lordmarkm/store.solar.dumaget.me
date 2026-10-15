# Physical inventory management

Physical stock and operations, 2026-10-09 (Asia/Manila).

## Scope

This slice manages physical stock held at named locations. Supplier-reported
availability is a different, unimplemented source; it must never be summed into
guaranteed owned stock. There are no reservations, available-to-promise promises,
automatic PO receiving/fulfillment, stock valuation or unit conversions in this
slice. Customer BOM quantities remain independent of stock. Counts, atomic
location transfers, per-pool thresholds and bounded CSV exports are implemented.

Product content/prices and inventory are separate. Product Save never overwrites
a balance. A missing stock record means Unknown, not zero. A verified empty
location/product can explicitly record a zero opening balance. The stock unit
is the product's configured unit/panel/kit; products without a unit cannot open
stock. Variant identities and pack conversions require a later reviewed design.

## Models and persistence

- InventoryLocation: stable UUID and unique immutable uppercase code, name,
  private notes, active/inactive status, version and creation/update metadata.
- InventoryBalance: product/location identity, fixed unit, onHand, version,
  last movement update time, physical observation time and updating admin.
- InventoryMovement: immutable opening/receipt/issue/return/damage/correction/count
  or linked transfer-in/transfer-out
  event, quantity and signed delta, before/after balance, balance version,
  reason, observation/server time and actor.
- Actor identity remains actorUid; optional actorName is a server-derived display
  snapshot, never a replacement identity or a client-controlled command field.
- StockInput: requestId, expectedVersion (null only for opening),
  expectedProductVersion, kind, quantity, reason and observedAt.
- CountInput: requestId, nullable expected balance version, expected product
  version, actual countedQuantity, reason and observedAt.
- TransferInput: requestId, expected product/source/destination versions,
  destinationLocationId, positive quantity, reason and observedAt.
- InventorySettings: product/location identity, nullable reorderPoint, version
  and updating time/admin. SettingsInput carries requestId, expected settings
  version (null for first configuration), expected product version and threshold.
- StockStatus: unknown, zero, low or in-stock; computed by the server.

All data is private and API-only in existing Standard/Native store-dev in
Singapore. Collections are inventoryLocations, inventoryLocationCodes,
inventoryBalances, inventoryProductUnits, inventoryRequests, inventoryLocationAudit,
inventorySettings, inventorySettingsAudit and inventoryTransfers. Movement history
is nested under inventoryBalances/{productId_locationId}/movements/{requestId}.
No default database, rules/IAM, region, paid service or production deployment
change is required.

## Stock correctness

Opening quantity is a nonnegative count and is allowed only once per pool.
Receipts and returns add positive quantities; issues and damage subtract positive
quantities. Correction is an explicit nonzero signed delta, not a direct overwrite
or a claim that a physical count was automatically reconciled.

Every movement requires a reason and canonical ISO observation time. Observations
more than five minutes beyond server time are rejected; backdated observations
remain distinct from server-recorded time. Quantities/balances are safe whole
numbers, bounded to 1,000,000,000 units in this slice.

A transaction checks the product, location, expected product/balance versions,
configured unit and resulting nonnegative balance. It writes balance, movement
and actor-scoped idempotency receipt atomically. Same request/same input retries
cannot double-post; changed inputs conflict. If later movements already occurred,
a retry reports conflict and requires reload rather than presenting an old balance.
Concurrent same-version issues cannot both spend the same physical stock.

Inactive locations keep their balances and history; no movements are accepted
until reactivation. Product units cannot change after any inventory pool exists,
including an explicit zero balance. The product edit transaction and stock
transaction both protect this boundary. No automatic quantity conversion.
Configuring a threshold also locks the product unit, including when no balance
exists; expected product versions fence concurrent edits before the first save.

Physical count review shows the previous balance and actual count, then confirms
the difference. The transaction calculates the delta again against the expected
balance version; it never silently rebases a stale count. Counts can establish an
unknown pool, and unchanged counts still create an audited zero-delta movement.
Physical observation time is preserved separately from server recording time.

Transfers require different active locations, a known balance at both ends and
matching configured units. Establish an explicit zero destination count first
when appropriate; an unknown destination is not assumed empty. One transaction
checks both versions, subtracts from source, adds to destination, and creates two
linked immutable movements, a transfer audit record and an idempotency receipt.
Both movements share the transfer/request UUID and reference the opposite location.
No partial transfer or automatic issue-plus-receipt sequence is accepted.
Retries cannot double-post; later movement at either end requires reload.

Each product/location threshold is optional (null means unset; zero is a valid
threshold). No balance is Unknown; a known zero is Zero; positive stock at or
below a configured threshold is Low; remaining positive stock is In stock.
Threshold changes have their own versioned audit and do not create stock movements.
No available-to-promise quantity or reservation is inferred from these statuses.

Location code changes and deletion are not supported. Location edits/deactivation
use expected versions, request receipts and append-only audit entries. Movements
cannot be edited or deleted through an API; correct mistakes with another reasoned
movement. Privileged server/cloud operators are not made tamper-proof by this
application contract; recovery/export requirements remain a production decision.

## Protected endpoints

### Actor name presentation (2026-10-11)

History displays actorName, never actorUid. New count/manual movement and paired
transfer records snapshot the safe display name from the verified Firebase token
when available. Authorization, receipt keys, retry matching, updatedBy and ledger
attribution continue to use the immutable UID. A renamed user does not change a
stored movement name; names are neither unique nor authoritative identities.

Legacy history without a snapshot resolves names by exact actorUid through
Firebase Auth getUsers: one batch of at most five distinct actors per history page,
only on the existing admin-protected endpoint. Map results by UID, not return
order. A bounded 200-entry process cache retains names for five minutes and
missing names for one minute; it is cleared on shutdown. Stored snapshots skip
lookups. No account listing, browser directory endpoint, new Firestore reads,
live ledger backfill, rules/index/IAM changes or paid service is introduced.

Missing/deleted users, unsafe names or lookup outages preserve history and show
"Name unavailable"; never substitute a UID or email. Legacy resolved names are
current Auth names, not reconstructed historical names. Safe names are trimmed,
nonempty, at most 160 characters, without controls/lone surrogates, and never the
actor UID. Angular text interpolation escapes display names. Movement CSV actor
columns follow the same name/fallback rule, while IDs remain in API/internal
models for tracking. Balance exports have no actor-name projection yet and use
"Name unavailable" in their actor column rather than exposing updatedBy IDs.

- GET/POST /api/v1/admin/inventory/locations: paged locations / create.
- PUT /api/v1/admin/inventory/locations/:id: rename/notes/status, code immutable.
- GET /api/v1/admin/inventory/:locationId: product rows and that location's
  nullable balances/settings and computed status, with optional stockStatus filter.
- GET /api/v1/admin/inventory/:locationId/products/:productId: current row.
- POST /api/v1/admin/inventory/:locationId/products/:productId/adjustments:
  atomic stock movement.
- GET /api/v1/admin/inventory/:locationId/products/:productId/movements:
  paged append-only history.
- POST /api/v1/admin/inventory/:locationId/products/:productId/counts:
  version-fenced actual count and audited reconciliation.
- POST /api/v1/admin/inventory/:locationId/products/:productId/transfers:
  atomic source-to-destination transfer.
- PUT /api/v1/admin/inventory/:locationId/products/:productId/settings:
  version-fenced nullable threshold configuration and audit.

Every route checks approved activation, verified sign-in and trusted configured
admin authorization before parsing input or opening private data. Only allowlisted
query/body fields are accepted. Private responses use no-store; SDK errors are
sanitized. There is no customer inventory-write endpoint.

## Bounded, cost-first reads

The inventory table applies SKU-prefix/brand/category/supplier predicates to
products on the server before pagination, then reads balance and settings documents
for the chosen location. Unknown rows stay present. This reuses existing catalog
indexes, not a new stock-search service or full collection download.

Locations use 50-row UUID cursor pages. Movements use 5 rows plus one lookahead,
ordered by authoritative balance version descending (not potentially backdated
observation time). Opaque movement cursors bind the pool and version/ID; they
cannot be used for another product/location. Automatic single-field indexes
suffice for these new queries; no new composite index deployment was requested.

A full unfiltered inventory page costs up to one location read, 11 product reads,
10 balance reads and 10 settings reads. A stock-status query joins before collecting
its visible rows and examines at most 50 candidates in five ten-product batches:
up to 156 document reads including catalog lookahead. Sparse searches may return
short or empty pages with a continuation cursor; Next continues the search, and
the UI does not report a global absence while continuation exists. Status cursors
bind location and filters and anchor after the last examined product, not an offset.
This bounded join avoids paid search, collection downloads and projection fan-out;
it can consume more reads than an unfiltered page and is not a free-quota promise.

A new stock/count movement normally reads five documents: receipt,
pool, product, location and the stable unit lock. It writes three documents
(four on a product's first stock write, including the unit lock), with transaction
retries potentially adding reads. Location creation writes location, code
reservation, receipt and audit. A transfer normally reads seven documents and
writes six (seven if establishing the unit lock); a threshold save normally reads
five and writes three (four if establishing the unit lock). A direct row lookup
reads four documents. Named store-dev
does not receive the default database's free quota. No polling, realtime listener,
paid aggregate dashboard, scheduler, backfill or sample-data seed was introduced.

No global stock totals, low-stock counts or valuation are inferred from one page.
Inventory products use fixed 10-row cursor pages. Previous/Next replace the visible
rows and re-fetch that page from the API; only navigation cursors are retained.
The footer shows the current page and the 10-row page size even when only one
page exists. No total-count query or client-side slicing of a 50-row response.
Filter/location/account changes reset navigation; failed page requests keep the
current page and retry the same target. Catalog products and location/supplier
option lists retain their existing separate 50-row bounds.
Movement history opens in a read-only, viewport-bounded popup with a scrollable
body and visible 5-per-page Previous/Next footer. Navigation replaces entries
and re-fetches the target cursor rather than appending or downloading the ledger.
Failed navigation preserves the current page and retries the same target.
Closing the popup or changing account, route, filters, location or inventory page
invalidates in-flight history responses. Reopening starts at the newest page;
Escape/backdrop/Close dismiss the popup and return focus to its trigger.
Inventory cursors bind the page size and filters; they cannot be reused by the
50-row catalog query. Results are live reads, not a frozen inventory snapshot.
Global summaries remain unimplemented; status badges describe individual pools.

## CSV exports

### Operator presentation

All inventory tables and popups must follow the project-wide no-horizontal-scroll
rule in AGENTS.md and UI-THEME.md. Movement-history scrolling is vertical only;
use wrapping/stacked entries or compact summaries with accessible details.
The inventory table now wraps columns and stacks labeled rows at narrow widths;
movement history uses responsive cards with vertical scrolling only.

Each product has two accessible button dropdowns:
- Quantity operations: Physical count, Receive stock and Transfer when a balance
  exists. Physical count establishes the first balance as well as later counts;
  there is no separate Opening balance button. Receive stock needs a known
  balance and starts the existing movement form with Receipt selected.
- Other operations: Set reorder point and View Movement history.

Receive stock retains the existing movement-type choices for other manual
receipts/issues/returns/damage/corrections. This is not automatic PO receiving.
Inactive location, unit, stale-row and pending-write guards remain; history stays
read-only. Retry actions remain in the appropriate dropdown. Backend opening
support and historical movement data are preserved.
2026-10-11: production build passes; dropdown labels and the unknown-stock menu
were inspected in the signed-in browser without changing stock. Tests were
explicitly skipped at the user's request.

The inventory card header has explicit vertical padding, a wrapping location
title and a separated export action above the padded filter toolbar. Clear stays
with the filter controls; keep mobile wrapping and accessible labels.
Page navigation still shows 10 products or 5 history entries per page.

Do not put the implementation below into page help, progress or toasts. The UI
shows products collected, export success, and actionable oversized-export errors.
Balance exports tell the operator to narrow filters; oversized history exports
report that history is too large. Both confirm that no file was downloaded.
The 50-request limits, live-read consistency, authorization and retry protections
remain unchanged and are documented here for maintainers.
Keep business-critical distinctions (owned versus supplier stock, Unknown versus
zero), permission checks and irreversible movement-history warnings visible.
Internal location/balance concurrency versions are not explanatory table text;
ledger audit details and exported metadata remain unchanged.

Balance export uses the currently selected location and API filters, sequentially
following ten-row inventory pages. History export follows five-row movement pages
for the popup's product/location. Neither export filters only the loaded page.
Each is capped at 50 API requests (at most 500 balances or 250 movements, possibly
fewer matches for sparse filters). If a continuation remains at the cap, export
fails clearly rather than delivering a deceptively complete partial file. No
automatic retry circumvents API rate limits.

The CSV includes stable IDs, units, versions, observation/update/actor metadata,
thresholds or linked transfer metadata as appropriate. UTF-8 BOM, CRLF, quoted
fields and spreadsheet-formula escaping protect text; numeric negative deltas stay
numeric. Download URLs are temporary and revoked. Closing history or changing
scope/account invalidates in-flight exports; failed/canceled exports deliver no
partial file. Exports are live paged reads, not a frozen database snapshot, a
scheduled backup, a point-in-time recovery guarantee or an inventory valuation.

## Purchase-order integration boundary

PO integration remains disabled pending the human's final status/lock policy.
Existing project POs are customer purchases, not inbound supplier orders. Confirm
the lock/reservation status, cancellation and partial fulfillment behavior, and
whether supplier receipts need a separate inbound PO workflow before enabling it.
Do not attach an arbitrary order ID to a manual movement and call it PO integration.
The trusted order workflow must validate owner, line/product/location associations,
remaining quantities and legal transitions; lock complete product/price/media
snapshots with retention holds, aggregate duplicate lines by stock pool, and
atomically update commitments and ledgers. Free-text lines cannot reserve catalog
stock automatically. Editable project BOMs remain independent from locked POs.

## Verification and remaining tasks

### Frontend transport regression (2026-10-11)

The inventory caller and backend supported row lookups, counts, transfers and
threshold settings, but the shared StoreApiService.adminRequest route allowlist
still recognized only the earlier inventory routes. It rejected these newer
requests locally as invalid-input, displayed as "Review the entered values and
try again", before any HTTP request or stock write. The stockStatus list filter
was also missing from the shared query allowlist. Unknown stock is valid for an
initial physical count and was not the cause of this rejection.

Keep the caller, shared transport path/method/query allowlists and backend routes
in sync. Regression tests must exercise the real StoreApiService with a mocked
fetch boundary, not only InventoryApiService with adminRequest mocked out; the
latter bypasses the failing guard. Reject wrong methods, malformed identities,
invalid status values and inventory-only filters on catalog/supplier endpoints.
Mocked transport verification does not prove a live stock mutation succeeded.

Luna restored the missing route/method and inventory-only stockStatus allowlists.
All 21 StoreApiService tests pass, including the new guard regressions, and the
production frontend build passes. The four related inventory suites report
53 passes and 11 failures in older UI tests that still assume text action buttons
and the separate opening-balance movement dialog/submit method. Update those
fixtures for grouped actions and reviewed physical counts; do not remove stock
guards to satisfy stale tests. No live stock was written during this fix.

Inventory Supplier column (2026-10-11): the main table includes a responsive,
labeled Supplier cell with wrapping text and no horizontal scrolling. Names resolve
from the already loaded paged supplier options; a missing `supplierId` displays
“Supplier not set,” while an unresolved name displays “Supplier not loaded.” This
adds no API queries and makes no stock changes. Production build passes; browser
verification confirms supplier names and matching table/content widths at the
default desktop size and 390px mobile. Default viewport restored; tests skipped.

Presentation update (2026-10-11): 56 focused inventory/operations/product-filter
tests and the production build pass. Browser checks confirm padded title/export
spacing at the default width and stacked title/export/location controls at 390px,
with no API-budget or pagination-strategy help in the inventory/history UI.
The default viewport was restored. Business warnings and navigation remain;
no live stock or catalog data was changed during this presentation task.

Operations verification (2026-10-09): backend 94 tests, type check and production
build pass; frontend 402 tests in 51 files and production build pass, including
64 focused inventory API/CSV/UI tests. Coverage includes real DOM count review
and transfer selection/confirmation, stale destination and closed/reopened-popup
fences, exact uncertain retries, thresholds/null/zero, status refresh after writes,
server-filter pagination, owned nested dirty-form prompts, CSV
caps/errors/cancellation and URL revocation.
The isolated demo emulator verifies counts/no-change audit/version conflicts,
atomic transfer conservation/concurrency/idempotency/inactive rejection, threshold
unit protection, sparse empty continuation and all 53 unknown matching products
across six filtered pages without skips/duplicates, plus ledger reconciliation.
The existing catalog-management and original inventory integrations also pass
together; fixture assertions explicitly scope their own product rather than
assuming it is first in a shared catalog.

Local health/readiness/public catalog/font return 200; new unauthenticated
count/transfer/settings endpoints return 401 with no-store. No live stock, new
cloud resources/indexes/rules or deployment were used. Browser connection failed
before observation, so real admin writes/download delivery, rendered glyphs,
desktop/mobile scrolling and visual layout are not claimed verified.
The older results below are historical baselines.

Movement-popup update: backend 89 tests and checks/build pass; frontend 369
tests in 49 files and production build pass, including 31 focused inventory
tests. Automated checks cover dismissal/focus return, fresh Previous reads,
last-page Next disabling, exact-target retries, closed/reopened-popup races,
account/route/filter fencing and busy-history guards. Emulator history traverses
56 entries in 12 pages (eleven pages of five and one of one), preserving unique
IDs, descending versions and balance reconciliation. Browser initialization
failed before observation, so actual desktop/mobile scrolling and visual checks
remain pending. No live stock writes or cloud/index changes were performed.

The admin UI at /admin/inventory replaces the fixture preview. Authorized admins
can create a location, select it, then record an opening count per product before
subsequent movements. Edit location allows renaming, notes and active/inactive
status; code stays immutable. SKU-prefix/category/supplier filters and compact
same-row Clear issue API queries, not loaded-row filters. Location/supplier options,
product rows and popup movement history have explicit paged loading/retry controls.

Unknown stock and inactive/missing-unit blockers are explicit. Issue, damage and
correction require confirmation. Shared blue KTUI controls, existing KeenIcons and
success/error toasts follow the UI-actions skill; customer theming is unaffected.
Forms and requests are fenced by account, route, query and selected location.
Pending stock changes block scope switches; exact uncertain retries retain UUID,
versions and observation time. Conflicts require reload. Dirty location/stock
navigation is guarded, including Keep editing after canceled navigation.

Backend parser/API tests cover activation/admin gates, field injection, malformed
units/quantities/timestamps and conservation checks. The isolated demo Firestore
integration tests zero/unknown, unique locations, receipts/issues/returns/damage/
corrections, concurrent issue protection, idempotency, inactive preservation,
product-unit and stale-product safeguards, history pagination and reconciliation,
and product/location pages beyond 50 rows. No actual business stock was created.

Verified after the 10-row pagination update: backend 88 tests, type check and
build; frontend 361 tests in 49 files and production build, including 23 focused
inventory tests. The emulator confirms 55 matching products across six pages
(10/10/10/10/10/5), with no duplicates or skipped records, fresh previous-page
reads and filter/page-size-bound cursors. A read-only live first page returns
three products; no live stock was seeded. The isolated inventory
and existing catalog-management integrations pass against loopback demo Firestore.
Local health/readiness and direct/proxied catalog return 200; private inventory
returns 401 without authentication. Icon mappings/font path are verified and the
font endpoint returns 200, but this does not verify rendered glyphs or spacing.
The browser connection failed before observation; real admin stock/location
writes, toasts, tooltip interaction and desktop/mobile visual checks remain pending.
No live business stock, new cloud resources, rules or website deployment were used.

Remaining inventory tasks:

- Broader desktop/mobile/zoom verification of reflowed inventory/history and
  updated automated interaction coverage (tests skipped for the dropdown change).

- Operator-entered real locations/opening counts and manual live UI verification.
- Global stock/low-stock summaries, if needed, with an approved cost budget.
- Supplier availability with independent source/freshness and no owned-stock claim.
- Customer-safe availability projections and freshness policy.
- PO-linked receipts, commitments/reservations and fulfillment after status policy.
- Returns disposition, serial/lot tracking if needed, costing and recovery decisions.
