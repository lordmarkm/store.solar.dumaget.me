# Admin catalog management

Taxonomy update (2026-10-14): Protection is replaced by Circuit breakers,
Surge Protection Device, ATS, PV Isolator and MCCB. Select these as top-level categories; see
[category contract](PRODUCT-CATEGORIES.md) for legacy read/filter mappings.
Explicit Circuit breakers products require
AC/DC type and positive numeric amperage in create/edit/publication validation.
ATS is a separate category and must not carry MCB ratings.
ATS requires positive numeric atsSpecifications.amperage on create/Save/Publish;
existing missing ratings remain viewable but must be completed at the next write.
Legacy unclassified Protection reads as unclassified, without guessing a subtype. See
[MCB specifications](MCB-SPECIFICATIONS.md) for the authoritative typed contract.

## Supplier product URLs (2026-10-12)

Private product create/update/master DTOs accept optional supplierUrl, canonical
outer-trimmed text up to 2,048 characters. Keep the complete query and selected
variant information verbatim; empty means unset. Present nonempty values must be
HTTPS with a hostname, no credentials, non-default port, whitespace/backslashes,
controls or unpaired surrogates. This is a link only: the server never fetches it.

If the authoritative supplier name trimmed and lowercased equals shopee,
supplierUrl is mandatory for creation, Save and Publish/republish, even for
drafts. Accept shopee.ph and its subdomains, not lookalike hosts. The repository
checks this with the supplier read inside the same transaction before any writes.
The admin form exposes Supplier product URL, required hints/errors and a matching
publication checklist. Other suppliers may optionally record an HTTPS source URL.

Missing fields on old records remain readable. Do not backfill, infer values or
block taking an old published product off sale (Unpublish). Omission in a partial
optional-field update preserves an existing URL; explicit empty clears only when
the current supplier does not require one. Changing to Shopee must supply a URL.
Supplier edits that rename a source to Shopee trigger enforcement at subsequent
product writes; they do not scan or rewrite existing products.

supplierUrl stays off PublishedProduct and public projections, including public
catalog/reference APIs. Sourcing URLs do not change inventory, price, stock,
supplier website or publication automatically. Unknown price remains null,
not zero; unknown images remain absent. Pictures and price are needed to publish.

Verification: backend/test/supplier-product-url.test.ts covers legacy shapes,
bounded/safe URLs, full-query persistence, Shopee host checks, private projections
and offline transaction enforcement before writes. Frontend matching validation
is covered by its supplier-product-url and admin catalog tests. No rules,
indexes, edition, IAM, storage or hosting changes are needed.

Implemented scope, 2026-10-09 (Asia/Manila): post-Save image cleanup, API product
filters, supplier editing/status, and project/Auth regression repairs.

## Product filtering

GET /api/v1/admin/products accepts only cursor, skuPrefix, brand, category and
supplierId. Exact brand/category/supplier predicates and a normalized uppercase
SKU-prefix range are applied in Firestore before pagination. Results are ordered
by SKU then document ID, with 50 visible records plus one lookahead. A bounded
opaque cursor carries the last SKU/ID and a normalized-query fingerprint; changing
criteria invalidates that cursor. Unknown keys, malformed IDs and oversized
values fail validation after authorization and before querying.

The economical search default is explicitly labeled Search SKU / SKU prefix.
It is not multi-field substring or full-text search. A maintained substring
index or paid search service is not introduced. The optional broader-search
choice was presented to the user; this default can be extended in a later slice.

All product rows come directly from the API. Dropdown changes and Clear filters
reset results/cursors; text changes debounce 300 ms. Load more and retry retain
the current criteria. Query/account/route/destruction fences discard late results.
Clear remains compact and in the filter row, using shared KTUI/icon/tooltip styles.

GET /api/v1/admin/product-brands pages nonempty brands independently of the
product result page. It reads at most 51 projected brand fields per request,
deduplicates that page, and uses the last brand as its cursor (subsequent pages
skip duplicates of that brand). Supplier options use the existing paginated API,
including inactive sources so historical products remain filterable. Category
options use the five server-owned supported values. Option lists expose Load
more when incomplete; no full-collection download or page-derived completeness.

Seven composite indexes cover every nonempty subset of brand/category/supplierId
followed by SKU ascending. Their source is infra/firestore/store-dev.indexes.json.
They were requested only for the existing Standard/Native Singapore store-dev
database, not the shared default database. Indexes consume storage and writes;
free allowances are not a spending cap. No rule/IAM/edition/region/search-service
change or product backfill is needed.

Fixture inventory filtering remains migration debt. Supplier list filtering is
now implemented as described below.

## Supplier filtering (2026-10-09)

GET /api/v1/admin/suppliers accepts only cursor, namePrefix and status.
Name-prefix search is explicitly case-sensitive, trimmed, control-free, valid
Unicode and at most 160 UTF-16 code units. It is not contact-field, substring or
full-text search. Status is active/inactive; omitted means all statuses.
Authorization is required before validating filters or opening private records.

Unfiltered requests preserve document-ID ordering and UUID cursors so existing
product editors and option loaders remain compatible. Filtered queries apply
predicates in Firestore, order by name then document ID, and read at most 51
documents for 50 visible rows. Opaque base64url cursors are bounded to 2,048
characters, carry name/ID and a normalized-query fingerprint, and cannot be
reused with different criteria. The Unicode scalar upper bound includes emoji
and supplementary characters; it does not use an incomplete U+F8FF sentinel.
Cursor pagination is a live view, not an immutable supplier snapshot.

The toolbar uses a fixed All/Active/Inactive vocabulary, an explicitly labeled
Supplier name prefix input with a case-sensitive hint, and compact same-row
KTUI icon Clear. Text changes debounce 300 ms; criteria/Clear reset rows and
pagination. Load more and retry retain criteria. Query, account revision,
route and destruction fences discard stale results, including direct account
switches where authorization remains true. No frontend rows.filter or whole
collection download is used.

One required status/name ascending composite index was added only to store-dev
and is READY. Index storage/write overhead was reviewed; no paid search service,
normalization backfill, edition/region/rules/IAM change or blanket index deploy.
All six read-only live variants passed: unfiltered, each status, prefix alone,
and prefix combined with each status. The isolated emulator additionally covers
56 matching rows, filtered page continuity, case sensitivity, Unicode, changed
cursor criteria, inactive selection and legacy unfiltered UUID pagination.

## Supplier editing and status

/admin/suppliers links to /admin/suppliers/:id/edit. Contact fields use the same
strict validation as creation. Save retains the stable supplier ID, creation
actor/time and status, increments version, checks expectedVersion, and atomically
writes an audit record and actor-scoped request receipt. Renaming also moves the
normalized unique-name reservation atomically; duplicate names are rejected.

- GET /api/v1/admin/suppliers/:id retrieves the private record.
- PUT on that path accepts the creation fields plus expectedVersion.
- POST /api/v1/admin/suppliers/:id/status accepts requestId, expectedVersion
  and status (active or inactive).

All routes require the configured verified admin email domain AND trusted
storeAdmin claim. Requests cannot supply actor, creation history, version or
privilege fields. Unchanged retries reuse request IDs; changed payloads conflict.
Stale versions preserve the form and require reload. Account/route/destruction
fences prevent old results or toasts from reaching a different account.

Deactivate/Reactivate requires explicit confirmation, with contact edits first
saved or discarded. Deactivation does not delete the supplier, cascade product
writes, unpublish existing listings, change POs or destroy history. It blocks
new product creation/assignment and Publish/Republish through that source.
An existing product can still be edited privately while retaining its unchanged
inactive supplier, and can be explicitly unpublished. New product forms show
active options only; publishing checks source status again on the backend.

The blue KTUI editor retains pending guards, dirty-navigation/beforeunload
protection, inline errors and shared success/failure toasts. No new UI library.

## Image and project lifecycle

See PRODUCT-IMAGES.md for post-commit storage deletion, retention, leases,
generation conditions, bounded retry and orphan cleanup. This operation is not
a product deletion workflow or PO snapshot implementation.

Project dialogs had a real reentrant-close bug: CDK disposes the overlay before
emitting the result, and the old destruction callback re-closed the same dialog
without a result. Dialog-owned projectUiSession instances now invalidate late
operations without re-closing on destruction. Account/access revocation still
closes dialogs, and page-owned sessions still clean up child dialogs. Successful
wizard navigation and add-to-project feedback retain their original ownership
checks. Obsolete synchronous/Auth-preview test expectations were updated without
removing privacy, atomicity, cancellation, retry or Undo checks.

## Verification boundaries

Product-list layout update (2026-10-11): remove the horizontal-scroll wrapper and
760px minimum table width. Desktop uses container-sized fixed column allocation
with wrapping names/SKUs/supplier IDs, badges and Edit actions. At 1023px and
below, labeled cards expose the same fields/actions; API filters and loading/
pagination behavior are unchanged. Blue KTUI styling is preserved.

Live browser measurements confirm the product list/table content equals its
container width: 682px at the default desktop size and 341px at a 390px viewport.
Mobile document width/content both measure 375px. Inventory is independently
verified with equal content/container widths (667px desktop, 341px mobile).
These checks do not claim a full app/zoom audit or testing every long-value case.
Default viewport restored; no business records changed. Automated tests remain
skipped per the user's request.

Current backend checks/build and 83 unit/API tests pass. The isolated
emulator-admin-management.integration.ts verifies real Firestore transactions
against a loopback demo database and synthetic bucket: post-commit ordering,
failed-Save safety, shared/public/history-hold retention, partial-delete retries,
attach-vs-delete fencing, orphan grace, supplier uniqueness/status/replay,
filters matching beyond 50 rows, combined filters and query-bound cursors.
No live supplier/product/image mutations were used for those tests.

Frontend production build and full suite pass: 337 tests in 47 files.
An initially reproduced cart-to-existing-project linked-state assertion race
in account-project-flow.spec.ts was repaired by awaiting actual dialog completion
before checking the result. All existing cart content, ownership, persisted BOM
quantity and unchanged active-selection assertions remain intact; no project
implementation or business behavior changed. The preceding batch recorded
328/328 passing. Focused supplier/admin-connected specs pass 18 tests.
All eight indexes are READY; product variants and six supplier read-only variants
passed. Connected readiness and local servers are documented separately.
Browser helper availability remains limited;
do not claim real clipboard, responsive layout or live account UI verification
from DOM/unit tests or compilation. No website deployment was performed.
