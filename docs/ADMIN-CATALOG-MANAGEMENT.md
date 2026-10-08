# Admin catalog management

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

Supplier loaded-row search and fixture inventory filtering are still migration
debt. This slice does not represent those as complete API searches.

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

Backend checks/build and 75 unit/API tests pass. The isolated
emulator-admin-management.integration.ts verifies real Firestore transactions
against a loopback demo database and synthetic bucket: post-commit ordering,
failed-Save safety, shared/public/history-hold retention, partial-delete retries,
attach-vs-delete fencing, orphan grace, supplier uniqueness/status/replay,
filters matching beyond 50 rows, combined filters and query-bound cursors.
No live supplier/product/image mutations were used for those tests.

Frontend production build passes. Final complete-suite results and index
readiness are recorded in TODO.md. Browser helper availability remains limited;
do not claim real clipboard, responsive layout or live account UI verification
from DOM/unit tests or compilation. No website deployment was performed.
