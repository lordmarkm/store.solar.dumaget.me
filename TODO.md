# Solar ecommerce

## Publishing checklist presentation (2026-10-09)

- [x] Ready requirements use green rows/check icons; missing requirements use
  red rows/X icons. Retain readable Ready/Missing labels and dark-mode contrast,
  existing KeenIcons and unchanged publishing guards. 18 editor tests and build pass.
- [ ] Browser visual confirmation remains pending.

## Table filtering guidelines (2026-10-09)

- [x] Document same-row compact Clear filters and API-side filtering/search for
  all tables in AGENTS.md, UI-THEME.md and the admin product-management plan.
- [x] Move /admin/products Clear filters into the filter toolbar row.
  Existing KTUI/icon/hover-tooltip conventions retained; 18 focused admin/tooltip
  tests and production build pass. No backend filtering changes in this slice.
- [ ] Migrate product search/brand/category/supplier filters to the protected API
  before pagination, including complete bounded option sources and query fencing.
- [ ] Review connected supplier search and fixture inventory filtering against the
  same standard. Current loaded-row filters are explicitly migration debt.
- [ ] Browser desktop/mobile confirmation remains pending.

## Admin operation feedback (2026-10-08)

- [x] KTUI success/failure toasts for product/supplier saves and publication;
  preserve inline validation, permissions, retries and stale-session fences.
- [x] 34 focused toast/admin tests, app/spec type checks and production build pass.
  The full run before the additional navigation-failure test had 290 passing
  tests and the same 9 pre-existing project/Auth failures; no new failures.
- [ ] Manual desktop/mobile visual confirmation remains pending because the
  browser helper could not initialize in the preceding image-upload task.

## Product pictures (2026-10-08)

- [x] Create a dedicated regional Standard us-west1 image bucket in the shared
  project, with uniform access and no optional paid storage features.
- [x] Apply explicit approval for public draft/product picture reads only
  (no anonymous listing/writes); keep private files/credentials out.
- [x] Admin-only bounded upload API, actual-format decoding, metadata stripping,
  pre-generated WebP sizes, immutable deduplicated paths and stored-asset checks.
- [x] Picture requirement for new Publish/Republish; legacy public reads remain
  compatible and ordinary BOM saves still do not create snapshots.
- [x] Live upload/deduplication/public-read/cache verification; probe assets removed.
- [x] File-picker/clipboard-paste admin UI, DTO propagation and public picture
  rendering; 68 focused frontend tests, 69 backend tests, type checks, builds and
  isolated emulator lifecycle checks pass. See [product images](docs/PRODUCT-IMAGES.md).
- [ ] Desktop/mobile and real-account paste confirmation: browser helper cannot start.
- [ ] Define a reviewed unused-upload cleanup/retention policy before production,
  protecting future locked-PO assets. Free allowances are not spending caps.

## Panel specifications (2026-10-08)

- [x] Category-specific admin create/edit inputs for the 15 reference panel
  parameters, with existing Brand, bounded server/frontend validation and
  legacy-record compatibility. See [panel specifications](docs/PANEL-SPECIFICATIONS.md).
- [x] Saved specifications persist and publish/republish through the existing
  public projection; customer Details shows unknown values as Not specified.
  Verified 50 focused frontend tests, 59 backend tests, type checks, builds and
  emulator reload/replay/private-edit/republish/category-clear checks.
- [ ] Desktop/mobile visual confirmation: browser helper fails sandbox startup.
- [ ] Resolve the broader frontend suite's 9 project/auth-flow failures (266
  tests pass). Panel/catalog focused tests pass; do not treat the entire suite
  as passing or expand the panel slice into PO/project behavior changes.

## Admin creation slice (2026-10-07)

- [x] Direct Google popup from the shopping header Sign in click; unified login
  coordinator sends newly signed-in, server-authorized admins to `/admin` (Products).
  Customer/restore/error paths preserve the cart and do not imply admin access.
- [x] Popup UI recovery and retry without stale busy/error
  updates; preserve retained intent age and SDK-owned identity. Verified 207 tests,
  app/spec checks and production build. User confirmed direct Google opening;
  final real redirect/closure recovery confirmation remains manual.
- [x] Remove visible Cancel sign-in controls while preserving automatic recovery.
- [x] Confirmed explicit sign-out (customer/admin) redirects to public `/goodbye`
  with a Back to home link to `/`; failed sign-outs and stale account operations
  cannot falsely report successful logout. Keep private-data revocation and cart.
  Verified 218 tests across 32 files, app/spec checks and production build;
  live browser sign-out/root-link confirmation remains manual.

- [x] Protected supplier/product list and create APIs; exact named `store-dev`
  selection, trusted admin claims/domain policy, strict fields, uniqueness,
  bounded transactions, replay-safe creates and minimal audit records.
- [x] Canonical blue admin lists and full-page create forms; required supplier
  selection, exact PHP centavos, draft-only products, loaded-record filters,
  validation, dirty-form confirmation, pending-save guards and account isolation.
- [x] Actual repository verification: 43 backend tests, 189 Angular tests,
  backend/frontend type checks and production builds passed. Actual Firestore
  emulator transaction tests passed with a separate demo project and no live data.
  Canonical route tests submit both forms and return to populated lists with
  isolated API doubles. Post-activation regression checks passed with the same counts.
- [x] Human approved temporary local use of the existing Google-only Identity
  Platform setup; no paid advanced features or speculative recovery.
- [x] Merge local authorized domains, activate Google sign-in and local API,
  have Mark sign in, bootstrap only verified `mark@solar.dumaget.me`.
- [x] Refresh Mark's browser token, then verify real UI supplier/product creation
  and reload persistence against `store-dev`.
  A labeled verification supplier and private draft product remain in the dev
  database; exact price, supplier linkage, trusted actor and audits were checked.
- [ ] Resolve long-term Auth subtype/cost strategy before production activation.
- [x] Product editing, saved-version Publish/Unpublish, atomic public projections,
  anonymous paged catalog and retained cart/BOM product resolution.
  See docs/PRODUCT-PUBLICATION.md; real-account and visual UI confirmation pending.
  Verified 250 Angular tests, 48 backend tests, type checks, both builds and
  isolated Firestore emulator publication/concurrency/privacy checks.
- [ ] Supplier editing, archive/restore, inventory/media/tax/tier workflows and
  connected readiness remain separate.

Contract and remaining boundary: [ADMIN-CATALOG-CREATION.md](docs/ADMIN-CATALOG-CREATION.md).
Approved activation: [AUTH-ACTIVATION.md](docs/AUTH-ACTIVATION.md).

## Next work

- [ ] Review npm audit findings and patch the Angular/tooling baseline before production (six affected production packages: four high, two moderate).
- [ ] Replace illustrative catalog data with verified equipment, pricing, and supplier records.
- [ ] Extend supplier records with alternate sources and supplier-specific SKU quotations.
- [ ] Add authentication and authorization before connecting real contractor/admin data.
- [ ] Connect catalog, inventory, and BOM persistence to backend APIs.
- [ ] Configure runtime services and data/authorization boundaries in shared Firebase project `dumaget-me-solar`.
- [ ] Adapt the main site's Firebase Hosting configuration and deployment workflow for a dedicated storefront site/target in `dumaget-me-solar`.
- [ ] Verify SPA deep-link routing, cache/security headers, preview deployment, and custom domain before live Firebase Hosting deployment.
- [ ] Implement supplier RFQs, inbound purchase orders, and stock allocation.
- [ ] Implement contractor PO submission/review (quotation stage) and ordering.

## User-facing roadmap

- [x] Frontend guest gates: shared sign-in dialog/page, disabled Add to project tooltip,
  separate item/list sign-in CTAs, validated return routes and retained session-local
  intents, guarded `/my/**`, guest-hidden linked project names, and access-loss guards.
  No authentication provider or demo login connected; existing preview data preserved.
  Verified build, 88 tests/15 files, app/spec checks, and desktop/mobile light/dark,
  keyboard/route/guest-history/theme isolation checks. Original viewport/light and
  32-panel list retained; actual login and resumption remain pending.
- [ ] Approve/configure real authentication and account-scoped repositories/rules,
  then implement registration/logout, verified session loading/account switching,
  and post-login review/resumption of pending actions. Never assign old synthetic
  preview projects to a real account implicitly.

Detailed scope and proposed routes: [USER-FACING-PLAN.md](docs/USER-FACING-PLAN.md).

- [x] Phase 1 layout separation: sidebar-free shopping, green customer My shell, and blue administration workspace; no customer admin links or quotation labels; `/bom` redirects to `/draft` retaining `solar.bom.v1`; guest quantities are stock-independent and unavailable references remain visible. Verified build, 30 tests, strict TypeScript checks, and desktop/mobile browser checks (2026-10-06). These results predate phase 2.
- [ ] Add product detail routes, favorites, profile, and account-backed flows. Local project list/overview, catalog destination selection, and mixed BOM editing are implemented.
- [x] Phase 2 preview slice: My projects list/search/cards, required project classification/configuration/work-scope metadata, Rooftop installation default with Ground-mounted/Carport/Other choices, optional Other/location/description/notes, three-step New project wizard from My projects, empty owned BOM on final confirmation, project overview, and explicit active-project set/clear without changing active state during creation. Uses `solar.projects.preview.v1` with a synthetic local-preview owner; not real account ownership. Malformed/foreign local data is protected from overwrite, failed writes publish no project and allow input-retaining retry, and known stale-tab conflicts are rejected by a basic read comparison. Production build passed; 46 tests passed in 9 files; app/spec `tsc --noEmit` checks passed. Browser checks passed: empty state and New project, invalid name/classification focus, Cancel/Escape with focus return and no creation, Rooftop default and unselected other enums, Back retention, successful create with one local project and empty owned BOM, overview with active still null, explicit active selection surviving reload, empty search/Clear, mobile navigation/dialog including optional Other field scrolling and reachable Cancel, Tab focus containment, light/dark desktop/mobile, loaded fonts/KeenIcons/public 2px corners, admin blue `#1379F0`/vendor 12px/system font restoration and return to public theme, and no console errors. Viewport overrides 1440x900/390x844 produced CSS widths 1309/355 under user zoom. Light/default viewport restored and active project cleared; sample `Local preview - Rooftop` remains in browser-local records.
- [x] Extend the local catalog destination/shared-wizard flow to guest-list Add to project with every pending row retained through confirmation. Connected sign-in remains pending.
- [x] Implement local catalog Add to project destination selection (active, different, new), safe cancellation, unchanged active state, and retry-safe create/add behavior. Guest/account-backed flows remain pending.
- [x] Add default-checked project BOM rows, Check all/indeterminate, selection count, and no-selection explanation for selected-only CSV export. PO creation remains pending.
- [x] Local preview: only an unlinked nonempty guest list can be copied (all rows, separate lines) and linked atomically; project BOMs cannot be copied.
- [x] Local Start new equipment list confirmation, fresh empty/unlinked ID, retained latest edits/link, reopenable history, and no re-copying. Foreign receipt names/links are hidden; real account-switch enforcement remains pending.
- [ ] Add project duplicate (metadata and BOM, no POs), archive (blocked while a PO is open), and restore.
- [x] Implement browser-local mixed project BOMs with stock-independent quantities, free-text editing, unknown-price handling, selected CSV content, and no draft snapshots. Manual estimate entry/tax rules and regular-browser file delivery still need work.
- [ ] Keep the project BOM continuously editable and support multiple independent customer PurchaseOrders per project; PO creation copies selected lines/quantities without moving or synchronizing BOM rows.
- [ ] Finalize PO statuses, allowed transitions/roles, and lock threshold (Confirmed is proposed, not approved); define amendment, cancellation, and separate payment/fulfillment rules.
- [ ] Aggregate duplicate-product stock demand at PO review/lock/amendment; agree compatible quantity-tier grouping and test 6 + 6 against stock 10, separate offers/variants/units, and concurrent commitments without merging BOM lines.
- [ ] Create ProductSnapshots and immutable PurchaseOrderRevisions only at PO locking/approved amendment, retaining complete historical details and durable images/documents; no snapshots on ordinary BOM/draft saves.
- [ ] Record independent PurchaseOrderStatusEvents and enforce lock/revision creation atomically with retry protection; catalog edits/deletion must not erase or silently reprice locked POs.
- [ ] Verify historical PO detail viewing/export after product/specification/price/supplier/asset changes or deletion, retain earlier revisions and cancelled records, and flag unrecoverable legacy history honestly.
- [ ] Define required/ordered/delivered/cancelled project quantity reporting using effective PO revisions, avoiding double-counting and surfacing over-ordering when the BOM changes.
- [ ] Connect account-owned projects/favorites/profile with backend-enforced access and non-destructive guest-list copying; get explicit approval before enabling Auth/database or adding rules in the shared Firebase project.
- [ ] Define PO submission, review (the quotation stage), and resubmission after real catalog/pricing and submission services are connected; review does not lock the project BOM. Defer checkout/payment until defined.
- [ ] Verify navigation/theme isolation, ownership, migration, responsive layouts, keyboard interactions, and CSV delivery against the plan's acceptance criteria.
- [x] Complete desktop/mobile browser checks for the phase 2 local project preview; evidence and viewport notes are recorded in `docs/USER-FACING-PLAN.md`.

## Catalog-to-project and mixed BOM preview (2026-10-06)

- [x] Catalog Add to project: named active destination, explicit existing destination,
  or the shared New project wizard in one CDK dialog. Project and initial item save
  together; cancel makes no writes; destination selection does not change active state.
- [x] Add repeated store products as independent BOM lines with stable request IDs
  for retries. Revalidate product/unit/variant and destination at confirmation;
  quantities are positive safe whole numbers and are never stock-capped.
- [x] Mixed project BOM route with free-text add/edit, store/free-text quantity edits,
  removal confirmation and immediate Undo, product details, current per-line sample
  prices, visible missing references, unknown amounts, and separate estimate subtotals.
- [x] Default-checked rows, Check all/indeterminate/none states, selection retained
  through dialogs, selected-only formula-safe CSV with line type/pricing provenance.
- [x] Production build, 62 tests/11 files, app/spec TypeScript checks, and desktop/mobile
  browser workflow/theme/focus checks pass. Existing active project preserved.
- [ ] Confirm CSV file delivery in a regular browser; the in-app browser download
  event timed out despite the export action completing. CSV content is unit-tested.
- [x] Guest-list one-time copy/link, Start new list/history, and shared wizard entry
  are now implemented locally in the subsequent slice below; legacy raw data is retained.
- [ ] Manual estimate entry/tax policy, PO creation/locking, account ownership/cloud
  persistence, project metadata editing/duplication/archiving remain pending.

## Guest list linking and history preview (2026-10-06)

- [x] All-row active/existing/new destination flow, shared wizard review, atomic
  project/batch/receipt creation, unchanged active selection, and retry-safe one-time linking.
- [x] Linked lists remain editable without syncing; new-list confirmation retains
  contents/link, history reopens safely, and previous linked lists cannot be re-copied.
- [x] Lazy legacy adaptation with stable persisted identities, raw `solar.bom.v1`
  recovery backup, optional typed history within `solar.projects.preview.v1`,
  unavailable/above-stock preservation, malformed-data and detected stale-tab protection.
- [x] No published partial state on quota failures; foreign receipt owners/missing
  projects show generic labels, not private project names/links. Backend enforcement pending.
- [x] Production build, 77 tests/13 files, app/spec checks, and desktop/mobile
  workflow/reload/focus/theme checks pass. Original active project and 32-panel
  quantity preserved; list now linked to the named local guest-link sample project.
  A fresh empty unlinked list is retained in history. Light/default viewport restored.
- [ ] Real sign-in, account-switch isolation, authoritative backend idempotency,
  database ownership rules, and concurrent-tab transactions remain unimplemented.
- [ ] CSV file delivery remains unverified; no Firebase/deployment change made.

## Historical scaffold verification

The checked results below are historical and predate phase 1 layout separation.
Current layout-separation verification is recorded above; these entries are not new results.

- [x] Verify production build, twelve draft/pricing/theme tests, and desktop/mobile browser behavior.
- [x] Verify public theme fonts, KeenIcons, green dialog inheritance, Escape focus restoration, dark mode, and isolation from the blue administration theme.
- [x] Verify frontend model contracts with the production build, 21 tests, and strict application/spec TypeScript checks (2026-10-06); earlier browser checks remain applicable because no views changed.
- [ ] Verify CSV file delivery in a regular browser; the in-app browser did not report a completed download.

## Completed

- [x] Create and validate the reusable solar-customer-theme skill from the implemented `/catalog`, covering customer tokens/fonts/angular cards, shopping/My page patterns, public overlays, icon/action integration, and blue admin isolation; UI and workflow implementation unchanged.
- [x] Create and document frontend contracts for projects/mixed BOMs, guest lists/copy receipts, customer records, and independently locked PO revisions/snapshots/status events; preserve demo types and mark business statuses/policies as provisional.
- [x] Document the user-facing roadmap, shared project wizard, selected-BOM add flow, continuously editable BOM, and per-PO locking/history model (implementation remains pending; PO statuses/lock threshold TBD).
- [x] Record the Provia Metronic/KTUI foundation and adapt the icon/action skill.
- [x] Scaffold Angular routes, shared theme, fonts, tooltips, and responsive workspace shell.
- [x] Add catalog, draft BOM, inventory, and supplier demo views.
- [x] Apply the supplied Solar Wholesale Engine green/mint reference and self-hosted Space Grotesk/DM Sans typography to public pages, preserving shared KTUI actions and KeenIcons.
- [x] Adapt Stitch's nearly square 2px cards, subtle product-card hover shadows, and consistent heading/label/price typography within the public theme only.
- [x] Select the existing `dumaget-me-solar` Firebase project, matching `solar.dumaget.me`.
- [x] Inventory shared-project Firebase services on 2026-10-06: Hosting/Analytics verified, Auth unconfigured, no Firestore databases or Storage buckets; distinguish enabled APIs from configured resources in the infrastructure documentation.
- [x] Align hosting documentation with the main site's current Firebase Hosting strategy and retain the local Git-ignored Admin SDK credential policy.
