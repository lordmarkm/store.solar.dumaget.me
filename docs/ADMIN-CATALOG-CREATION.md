# Admin supplier and product creation

Sourcing update (2026-10-12): private draft creation supports supplierUrl and
requires it for Shopee products, just like Save and Publish. Missing price and
pictures remain honestly unset in drafts; do not guess them from listing URLs.
See [the current sourcing contract](ADMIN-CATALOG-MANAGEMENT.md#supplier-product-urls-2026-10-12).

Publication update (2026-10-07): canonical product editing, Publish/Unpublish and
the anonymous published storefront catalog are now implemented. The draft-only
contract below describes the creation slice; saves still never auto-publish.
See [product publication](PRODUCT-PUBLICATION.md) for the current lifecycle,
concurrency, public projection and verification boundaries.

Activation update (2026-10-07): the human Auth/bootstrap decision is now approved
for temporary local Google-only use. Local domains/client/API are enabled;
Mark's verified account received the approved claim and refreshed its token.
Real UI supplier/product creation and reload persistence in `store-dev` passed.
Earlier pending-decision statements below are historical. See
[approved activation](AUTH-ACTIVATION.md).

Recorded 2026-10-07. This slice replaces the fixture lists at `/admin/products`
and `/admin/suppliers` with authenticated API-backed pages. `/admin/inventory`
remains explicitly a preview. Customer catalog data and project/BOM/PO workflows
are unchanged. This document supersedes earlier statements that no admin API or
connected admin pages exist. The approved local activation is complete; underlying
Auth subtype recovery and production activation remain outside this completion.

## Workflow

1. An operator activates Auth only after the unresolved shared-project subtype
   decision is approved, merges required authorized domains, and enables the
   frontend/backend flags. No fake login or browser-side role grant exists.
2. The administrator signs in with Google. `/api/v1/me` must confirm verified
   email in the server-controlled `ADMIN_EMAIL_DOMAINS` allowlist **and** the
   trusted `storeAdmin === true` claim. Domain eligibility alone grants nothing.
3. Create a supplier at `/admin/suppliers/new`, then create a private draft
   product at `/admin/products/new`, selecting an existing supplier.
4. Successful saves return to the real list. Lists fetch 50 records per request,
   with explicit Load more. Search/category/brand/supplier filtering applies to
   loaded records, not an unbounded Firestore scan.

Forms validate required fields, retain input after failure, prevent duplicate
submissions, confirm abandoning dirty input, and invalidate private data and
pending callbacks on account changes. Retrying unchanged input reuses a request
UUID; editing input uses a new UUID. Draft creation is not publication.

## API and storage contract

`GET` and `POST /api/v1/admin/suppliers` and `/api/v1/admin/products` are private.
Every call verifies Firebase ID tokens with revocation checking and enforces
admin policy before accessing Firestore. Disabled activation returns 503;
unauthenticated requests return 401 and ineligible identities return 403.
POST returns 201 `{supplier}` or `{product}`. GET returns `{items,nextCursor}`;
the only query parameter is an optional UUID document-ID cursor.

The Admin SDK uses the existing Standard/Native Singapore database `store-dev`
in `dumaget-me-solar`, never `(default)`. Existing client rules remain deny-all.
Admin SDK bypasses those rules; verified API authorization and server IAM are
the write boundary. No browser Firestore SDK or client writes are added.

Supplier inputs: request UUID, name (required, 160 characters), region (120),
description (4,000), HTTPS website (500, no URL credentials), email (320), phone
(80). Optional text is stored as an empty string. Names are unique by normalized
NFKC, case-insensitive, whitespace-collapsed name.

Product inputs: request UUID, required SKU (uppercase ASCII, 64), name (160),
brand (80), category (`Panels`, `Inverters`, `Batteries`, `Mounting`, `Protection`
or null), unit (`unit`, `panel`, `kit` or null), description (4,000), nullable PHP
price in integer centavos (0–99,999,999,999,999), and required supplier UUID.
Zero is a valid price; null means not set. SKU is unique case-insensitively.
No inventory, images, tax, publishing or purchase-order fields are accepted.

Server-created metadata: UUID document ID, `schemaVersion:1`, `version:1`, actor
UID from the verified token, and equal canonical creation/update timestamps.
Supplier status is `active`; product state is `draft` and currency is `PHP`.
Unknown fields and malformed/future stored records fail closed.

Collections: `suppliers`, `products`, `supplierNameKeys`, `productSkuKeys`,
`adminCreateRequests`, `adminCatalogAudit`. One bounded Firestore transaction
atomically creates the entity, uniqueness reservation, idempotency receipt and
minimal audit entry. Products also verify the supplier exists. Receipts are
scoped to actor, resource kind and request UUID, and bind the normalized payload
hash. A reused UUID with changed input returns 409. Replays return the original
record. Concurrent duplicate names/SKUs return 409 without partial writes.
No TTL, scheduled job, extra index, listener, paid enterprise service or new
always-on compute is provisioned. Receipts/audits grow with successful creates;
retention is a future explicit policy, not silent deletion.

## Mark bootstrap (not yet executed)

`backend/src/bootstrap-store-admin.ts` is an operator-only script, never an HTTP
endpoint. It requires explicit approval flags and `--apply`; it targets only the
existing, enabled, verified `mark@solar.dumaget.me` account in the pinned project,
merges existing custom claims, and verifies the result. It cannot create users
or authorize all domain accounts. Credentials stay in the ignored `infra/` JSON
and are supplied through trusted server ADC only, never browser assets or logs.

After human approval and Google sign-in, an authorized operator may run from the
backend directory with `GOOGLE_APPLICATION_CREDENTIALS` pointing to the ignored
credential and both `FIREBASE_AUTH_SETUP_APPROVED=true` and
`STORE_ADMIN_BOOTSTRAP_APPROVED=true`:

```powershell
node --import tsx src/bootstrap-store-admin.ts --apply
```

Sign out/in afterward to obtain the new claim. Then start the API with both
`FIREBASE_BACKEND_ENABLED=true` and `FIREBASE_AUTH_SETUP_APPROVED=true`, and enable
`STOREFRONT_AUTH_ENABLED` only once required domains/provider configuration and
the explicit Auth decision are confirmed. These flags are safeguards, not
independent authorization to bypass the hold. `/health` is process-only;
`/ready` still returns `BACKEND_NOT_READY` until connected readiness is implemented.

## Verification boundary

Actual checkout verification passed: 43 backend tests, 189 Angular tests in 30
files, backend/frontend type checks, and both production builds. Canonical Angular
route tests submit supplier and product forms with DOM events and isolated API
doubles, verify exact centavos and the returned populated lists, and exercise
the real leave guards. Browser checks confirm blue admin styling, the explicit
Auth setup hold, disabled creation, and no private/fixture records exposed.
The retired fixture component tests use test-only routes; those routes are not
registered in the application or included in the production bundle. The existing
private Admin JSON remains ignored/untracked and was not manually read or loaded.

Offline backend authorization/validation tests and actual named-database emulator
transaction tests passed. Emulator integration uses a separate `demo-` project,
loopback port 8180 and injected test-only identity verification; it never changes
production runtime verification. To repeat from the repository root, ensure Java
is on PATH, then run:

```powershell
firebase emulators:exec --project demo-store-provisioning --config firebase.emulator-admin.json --only firestore --non-interactive "node --import ./backend/node_modules/tsx/dist/loader.mjs backend/test/emulator-admin.integration.ts"
```

Live OAuth, trusted claim assignment, server IAM access and successful UI writes
to live `store-dev` remain unverified until the human Auth/bootstrap decision and
sign-in are complete. No live catalog data was created by the implementation.

Related: [Auth outcome](AUTH-PROVISIONING-OUTCOME.md),
[database provisioning](FIRESTORE-PROVISIONING.md), [backend](BACKEND.md).
