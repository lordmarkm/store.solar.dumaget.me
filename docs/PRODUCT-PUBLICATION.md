# Product editing and publication

Picture requirement (2026-10-08): publishing/republishing now also requires
at least one uploaded product image. Drafts may still be incomplete. Historical
public projections without images remain readable until their next republish;
saved picture changes reach public records only on explicit republish.
See [product images](PRODUCT-IMAGES.md) for clipboard uploads and the approved
public US bucket (including draft pictures).

Implemented 2026-10-07. This supersedes earlier draft-only/catalog-fixture notes
for the canonical administration and storefront routes. Local development only;
no deployment, cloud test publication, migration, or provider setting changed.

## Administrator workflow

1. Sign in with a server-authorized administrator account.
2. Open Products, then Edit beside an existing record.
3. Change product content and click Save changes. SKU is immutable after creation.
   Incomplete drafts can be saved. A successful save stays in the editor.
4. Complete the publishing checklist: brand, category, sellable unit, description,
   explicit PHP price (zero is valid), at least one uploaded picture, and an existing active supplier. Load more
   suppliers if the linked supplier is outside the current page.
5. Publish product (or Publish saved changes) publishes only the saved version.
   Unsaved changes must be saved first. Missing requirements prevent publication.
6. Unpublish asks for confirmation, removes the public listing and returns the
   master to draft. It does not delete the product, reuse its SKU, or erase BOMs.

Saving a published product changes the private working content, not the public
listing. The list/editor label saved private changes that have not been published.
There is no mandatory extra approval queue or new editor/publisher role.

Stock, tax treatment and tier discounts remain unconfigured. Subsequent panel
specification and product-image slices add bounded specifications and uploaded
pictures. Legacy category artwork remains an explicitly illustrative fallback,
not a product photograph. Publishing a price is not an order, reservation, or
tax-inclusive promise. Authoritative purchasing validation remains future work.

## API and data boundaries

All private product endpoints enforce the existing verified Firebase identity,
server-controlled domain policy and trusted storeAdmin claim before validation
or repository access. Merely matching an email domain does not authorize writes.

- GET /api/v1/admin/products/:id returns the private product.
- PUT /api/v1/admin/products/:id saves content using requestId and expectedVersion.
- POST /api/v1/admin/products/:id/publish and /unpublish accept only requestId
  and expectedVersion.
- GET /api/v1/catalog/products is anonymous, cursor-paginated (50 records).
- GET /api/v1/catalog/products/:id reads only a published projection; private
  drafts and unpublished records return 404.
- POST /api/v1/catalog/references anonymously resolves up to 20 unique UUIDs
  from publishedProducts only. Missing/unpublished records are omitted.

The named Standard database remains store-dev in dumaget-me-solar, Singapore.
Client Firestore rules stay deny-all; authenticated API enforcement is the write
boundary. No additional indexes, realtime listeners, scheduled jobs, search
service, paid features or always-on compute were added.

Private products preserve existing schemaVersion 1 drafts. Version increments
on saves and lifecycle changes, with canonical updatedAt; createdBy/createdAt
remain unchanged. Published masters carry publishedVersion. A lower
publishedVersion than version means saved working changes are not public.
These counters are concurrency controls, not immutable product/PO revisions.

The new publishedProducts collection contains only explicitly selected fields:
id, schemaVersion, version, publishedAt, sku, name, brand, category, unitCode,
description, amountMinor, currency, and optional panelSpecifications/images. Supplier IDs, contacts, costs, internal
actor data, request receipts and private content never enter this projection.
Both server and client validate exact shapes and reject unexpected fields.

A bounded Firestore transaction verifies expectedVersion and the active supplier,
then updates the master, public projection (publish/delete on unpublish),
adminProductRequests receipt and adminCatalogAudit entry atomically. Save alone
never writes the projection. Stale edits return 409 without writes. Unchanged
retries reuse a request UUID; reused IDs with different operations/data return
409. A replay after another intervening mutation also returns 409, requiring
reload instead of presenting an obsolete successful version. Failed publication
does not create a receipt or audit entry.

## Storefront and retained planning references

Catalog now uses the public API only, with loading, empty, failure/retry, explicit
Refresh and Load more states. Filters apply to loaded records. Visiting Catalog
refreshes the listing. There is no runtime sample-data fallback or fabricated
stock/discount/tax information; live prices display centavos.

Catalog/cart/BOM product resolution shares an injected public product source.
Known saved UUID references can be resolved directly outside the first catalog
page, including after reload. Startup reads at most 200 unique saved references,
in sequential batches of 20; excess or unresolved references remain
unavailable, not deleted. This is an on-demand in-memory cache, not a realtime
subscription or durable historical snapshot.

Add to Cart rechecks the public product before writing a browser-local reference.
Failed checks add nothing. Unpublished/missing or incompatible-unit references
retain identity and quantities but have unknown pricing and are excluded from
known estimates, not repriced to zero or converted to free text. Existing planning
quantity editing stays stock-independent. CSV protects text from formula injection.

Cart remains browser-local, account-scoped project persistence is still not
connected, and real accounts cannot use synthetic preview projects. Legacy
fixture references are preserved as unavailable; no automatic reassignment,
destructive migration, or browser data clearing occurs. Locked PO snapshots,
revisions, status policy and purchasing are not implemented by publication.

## Verification

Final checks: 250 Angular tests across 35 files, 48 backend tests, app/spec/backend
type checks and both production builds passed. The local Firestore publication
integration also passed, including concurrent save vs publish (one winner, one
409), unpublish replay, stale-request protection and batched public-reference
privacy. All transactional mutation checks used the isolated emulator.

Backend contract/API tests exercise exact public/private boundaries, trusted
authorization, safe versions and draft compatibility. Angular tests exercise
editing, checklist, retry/conflict/account isolation, public pagination/privacy,
cart additions, failed rechecks and reactive unavailable references.

The isolated Firestore emulator integration uses demo-store-provisioning and
named store-dev on 127.0.0.1:8180, never live credentials. It covers publication
failures without partial writes, private edits vs live content, republish,
idempotency/audits, stale edits, SKU protection, unpublish and route denial.
The live anonymous local proxy returned an empty published catalog as expected;
no existing draft was published as a verification side effect.

Browser automation failed to initialize. Actual Google-account edit/publish/
unpublish interaction and desktop/mobile visual confirmation remain manual.
