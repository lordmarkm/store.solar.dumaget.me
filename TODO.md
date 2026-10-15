# Solar ecommerce

## PV Isolator and MCCB categories (2026-10-14)

- [x] Add independent PV Isolator and MCCB choices to product forms, API filters,
  published catalog, inventory and explicitly categorized free-text BOM lines.
- [x] Add separate optional component slots with initial/repeat Add actions;
  preserve required inverter/ATS/hybrid battery policy and existing rating rules.
- [x] Update category contracts, models, builder plan and BOM presence policy v5.
- [x] 149 scoped frontend tests and production build pass. The existing initial
  bundle warning remains (766.94 kB vs. 750 kB warning budget). All 141 offline
  backend tests and backend build pass; whitespace validation passes.
- [x] Live admin and proxied public category filters accept both values and return
  honest empty results. No new rating defaults, reclassification, product saves,
  BOM writes, index deployment or cloud changes.

## Explicit electrical product categories (2026-10-14)

- [x] Replace selectable Protection with Circuit breakers, Surge Protection Device
  and ATS across forms, API filters, public catalog and current BOM components.
- [x] Keep required MCB AC/DC and amperage, ATS amperage, and inactive-rating
  clearing. Normalize typed legacy reads without republishing or changing images,
  prices, stock, BOMs or locked PO snapshots; untyped legacy classification is absent.
- [x] Bounded admin/inventory compatibility queries reuse existing category/SKU
  indexes; semantic filtering happens on the API before pagination. No cloud changes.
- [x] 167 focused frontend tests and 139 offline backend tests pass; both builds
  pass. Existing frontend initial-bundle warning remains (766.86 kB vs. 750 kB).
- [x] Live ATS and Circuit breakers/Shopee filters return the correct legacy products.
  Maintain PRODUCT-CATEGORIES.md, BOM-COMPONENT-PRESENCE v4 and related contracts.

## Required ATS component (2026-10-13)

- [x] Separate required ATS slot for every configuration, explicit subtype
  grouping, Add ATS / Add another ATS, shared red marker and KTUI table/footer.
- [x] ATS picker API-side subtype filtering before bounded cursor pagination;
  cursor subtype scoping, no collection scan/new composite index/cloud change.
- [x] Required free-text ATS amperage, metadata preservation/merged validation,
  preview/account round trips and subtype rejection; catalog ATS requirement retained.
- [x] 81 focused frontend tests in seven files and all 136 offline backend tests
  pass. Final merged-guard/API tests, backend type check and UI build pass;
  existing initial-bundle warning remains (766.32 kB vs. 750 kB).
- [x] Browser ATS-only picker shows Fanhey; required rating field and fractional
  ratings, lower-right Cancel, desktop/mobile no horizontal overflow verified.
  Existing quantities 2/10/1 unchanged; viewport restored, no live BOM writes.
- [x] Maintain BOM-COMPONENT-PRESENCE v3, builder plan, protection docs and AGENTS.

## Whole-number planning quantities (2026-10-13)

- [x] Shared integer-only typed/pasted/drop input behavior for customer BOM,
  Cart, component picker, Add-to-project and free-text quantities. Keep integer
  steps/numeric keyboards; no rounding, price/rating changes or stock semantics.
- [x] Existing positive-safe-integer frontend/API guards retained. Luna added
  backend boundary tests for initial/add-items/free-text/quantity/cart-copy commands.
- [x] 39 frontend tests in five files and 8 backend parser/API tests pass;
  production build passes with the existing 765.15 kB initial-bundle warning.
  Live picker rejects decimal/exponent keys and retains integer value; safe Close
  preserves the three existing BOM lines with no real-data write.

## Component Add placement (2026-10-13)

- [x] Populated components render one repeat Add action after their last line,
  in a presentation-only KTUI footer row aligned with Selection. Empty components
  keep their initial Add action; archived BOMs have no Add footer.
- [x] Preserve plus glyphs, labels, busy/auth guards, picker destination, quantities,
  selection, totals and export. Footer entries never become BOM records.
- [x] 33 focused tests in four files and production build pass (existing bundle
  warning remains). Live desktop/mobile checks confirm the button is below the
  preceding line, no horizontal overflow, and the same picker opens/cancels safely
  without writes. Viewport restored; multi-line placement covered by isolated tests.

## Required markers and Add icons (2026-10-13)

- [x] Shared red asterisks replace required/optional label annotations across
  project wizard/details, BOM/free-text/picker, inventory operations/location forms
  and admin/legacy product/supplier editors. Conditional MCB/ATS/Shopee requirements
  follow existing validation; draft-optional publication fields stay optional.
- [x] Source-verified KeenIcons plus mapping for Add/New/Create and repeated
  component actions, Cart/project additions and free-text creation. Save/Confirm
  checks and navigation glyphs remain; shared Add/Save editor switches by mode.
- [x] Document in AGENTS.md, UI-THEME.md, docs/BOM-COMPONENTS.md and the UI-actions
  skill; skill metadata validation and git diff --check pass.
- [x] 67 focused frontend tests in seven files pass; production build passes
  with the existing initial-bundle warning (764.52 kB versus 750 kB, unchanged budget).
- [x] Live BOM/picker/free-text visual checks confirm loaded plus glyph, red
  markers, no optional captions, mobile/desktop root and visible nested widths
  without horizontal overflow, and safe Cancel without changing BOM quantity.
  Browser viewport restored. Admin behavior is covered by isolated editor tests
  and template compilation, not claimed as live admin write verification.

## Product image lightbox (2026-10-12)

- [x] Reuse main site's ng-gallery 12.0.0 renderer in a lazy-loaded read-only
  CDK lightbox. Photo buttons cover inventory, catalog, Cart/project BOM, product
  details and editor upload previews; placeholders are not interactive.
- [x] Full-size URLs/selected index, click-time snapshot, duplicate/late-open
  guards and teardown cleanup; footer-only lower-right Close, secondary navigation,
  keyboard arrows, Escape/backdrop dismissal and focus containment/return.
- [x] Verify 29 focused tests in five files, test-source TypeScript and production
  build. Initial bundle warns at 758.49 kB against the 750 kB warning budget;
  no budget increase, dependency upgrades or cloud changes made.
- [x] Real-browser inventory single-photo expansion/loading, desktop/mobile no
  horizontal overflow, reachable Close and Escape/focus return. Public light/dark
  styling and nested details dismissal verified, with parent details retained and
  no focus-only tooltip. Viewport/light preference restored; no live data writes.
- [ ] Real vendor multi-image browser navigation/selected nonzero index check on
  a suitable existing record. Boundary tests use a gallery double because the
  vendor's partial declarations fail in Vitest external/JIT before fixture setup.
  Do not claim mocks exercise the actual renderer. Package installation reports
  dependency advisories; security upgrades remain a separate reviewed task.

## No unsolicited notices (2026-10-12)

- [x] Remove the public image notice from the shared product uploader used by
  create/edit pages. Keep upload controls, limits and validation behavior.
- [x] Record explicit-instruction-only notices policy in AGENTS.md; keep storage
  policy explanations in docs/PRODUCT-IMAGES.md, with no permission/cleanup change.
- [x] Six focused uploader tests and production build pass; live editor confirms
  the notice is absent, with saved product values unchanged and no data writes.

## Required ATS amperage and Fanhey price (2026-10-12)

- [x] Add atsSpecifications.amperage, required positive finite amperes for ATS
  create/Save/Publish, including drafts. Preserve legacy unrated ATS reads; no
  name/title inference, MCB ratings reuse, bulk backfill or cloud changes.
- [x] Backend validation/projection, documentation and 127 offline backend tests
  pass; backend check/build pass.
- [x] Save Fanhey as ATS / 63 A / PHP 1,170.00 through the authenticated editor
  (draft version 4); reload confirms values and unchanged sourcing URL/SKU/image
  state. No publication or inventory writes. Editor has no horizontal overflow.
- [x] Verify 79 focused frontend tests across six files and production build.
  Required ATS form/checklist, legacy read-only unknown rating and subtype clearing
  are covered; public legacy ATS copy is Amperage not specified.

## ATS subcategory (2026-10-12)

- [x] Extend explicit Protection subcategories to MCB / ATS. ATS rejects MCB
  specifications and wrong categories; preserve subtype on unrelated saves.
- [x] Document the separate ATS contract without inferring voltage, inventing
  ratings, changing MCB requirements or introducing builder/stock/cloud changes.
- [x] Verify 125 backend tests and backend check/build; 74 focused frontend tests
  and production build pass. Save the existing Fanhey 2P 63A photovoltaic draft
  as Protection / ATS through the authenticated UI (draft version 3). Reload
  confirms subtype, supplier URL and unchanged empty price/images. No publication
  or stock writes. Rendered editor has no horizontal overflow at its current width.

## Required MCB ratings (2026-10-12)

- [x] Introduce explicit Protection / MCB classification and mandatory AC|DC
  type plus positive finite numeric amperage, including drafts. Other Protection
  products and legacy unclassified records remain valid; no name/image inference.
- [x] Validate create/update and merged transaction writes; preserve typed MCB
  facts in public projections, frontend catalog summaries and product details.
  Match required form fields, dirty guards, clearing and publication readiness.
- [x] Document the maintained contract in docs/MCB-SPECIFICATIONS.md,
  frontend/catalog docs and AGENTS.md. No builder rule, stock or cloud config change.
- [x] Verify all 123 backend tests, backend check/build, 68 focused frontend
  tests and frontend production build. Real admin form rejects empty MCB type/
  amperage, then saves Suntree as MCB / AC / 32 A, draft version 3. Reload
  preserves fields, PHP 399.00, supplier URL and representative picture.

## Shopee supplier product URLs and Suntree draft (2026-10-12)

- [x] Add optional private supplierUrl DTO/form storage, preserving the full
  query/variant URL and edit/dirty/retry behavior without changing public DTOs.
- [x] Require Shopee sourcing URLs on create, Save and Publish/republish on both
  form and authoritative supplier-read transaction; keep legacy reads and
  Unpublish available. Document the contract in AGENTS.md and catalog/model docs.
- [x] Verify 119 offline backend tests, backend type check/build, 48 focused
  frontend tests and frontend production build. Real UI blocks a Shopee draft
  without its URL before saving; no rules, indexes, IAM or hosting changes.
- [x] Create Shopee supplier and SUNTREE SCB8-63 32A 2-Pole AC MCB draft through
  authenticated admin UI, SKU SUNTREE-SCB8-63-2P-32A, category Protection,
  unit unit, supplied full listing URL. Product ID
  4caa977c-ea7c-493a-9273-84515185c968. No stock writes or publication.
- [x] Save user-confirmed PHP 399.00 and the supplied WebP through admin UI;
  user explicitly approved its 16A/C16 picture as representative of the 32A
  variant. Description discloses the mismatch. Saved draft version 2 reloads
  with the price, full source URL and loaded picture; no stock change or publish.

## Actor names instead of actor IDs (2026-10-11)

- [x] Document name-only actor presentation and UID-based tracking in AGENTS.md.
- [x] Preserve actorUid for movement identity/retries; add optional trusted name
  snapshots to new movements and paired transfers, with backward-compatible
  validation and bounded cached legacy name lookups without ledger rewrites.
- [x] Verify name/fallback rendering and exports: 21 focused frontend tests,
  114 backend tests, backend type check and both builds pass. Existing live
  movement history shows Mark Martinez instead of the actor UID via read-only
  legacy resolution; no inventory writes or history backfill performed.
- [ ] Add balance actor-name projection if a named actor is needed in balance
  exports; never expose the raw updatedBy UID as a display fallback.

## Movement-history footer dismissal (2026-10-11)

- [x] Remove the header Close and place the single secondary Close last in the
  movement-history footer; retain pagination and keep it right-aligned after
  pagination when the footer stacks on narrow screens.
- [x] Focused footer/dismissal/pagination regression and production build pass.
  Browser confirms header has no Close, footer Close dismisses the popup, and
  its 390px layout has no overflowing descendants and keeps Close lower-right.

## Inventory shared-request guard regression (2026-10-11)

- [x] Luna restored guarded GET row lookup, POST counts/transfers and PUT settings,
  plus inventory-only stockStatus filtering; preserve exact methods, UUID checks,
  query/cursor bounds and auth/session fencing.
- [x] Real shared-transport regression coverage: 21 tests pass; frontend production
  build and diff check pass. No live stock changes made for verification.
- [ ] Repair 11 older inventory UI test failures from action-menu and merged
  physical-count changes (old text selectors and opening-dialog submit helpers).
  The other 53 related inventory tests pass; this is separate verification debt.

## Sidebar-owned cross-page navigation (2026-10-11)

- [x] Document no cross-page links in page/section headers in AGENTS.md and
  UI-THEME.md; preserve current-page actions and shared app-shell navigation.
- [x] Remove inventory header's Manage products shortcut; Products remains in
  the sidebar. No stock, filters, table actions or authorization changes.
- [ ] Audit remaining page/section headers for duplicate navigation shortcuts.

## Library tables and lower-right dialog Close (2026-10-11)

- [x] Document mandatory library-backed browsable tables and footer-only,
  lower-right Close/Cancel dismissal in AGENTS.md and UI-THEME.md.
- [x] Select installed KTUI DataTable with an Angular cell-template adapter;
  actual vendor rendering, API-owned cursor controls, no guessed totals or
  local live-data filters. Contract: docs/KTUI-TABLES.md.
- [x] Migrate inventory, admin API products and the un-routed fixture ProductsPage
  to shared KTUI rendering; remove duplicate product mobile templates and
  bespoke table CSS. Fixture filters remain documented preview-only debt.
- [ ] Audit other customer/admin grid-style lists and future table-based popups
  for shared library adoption; movement history currently uses stacked cards.
- [ ] Audit and move all dialog dismissal buttons to the lower-right footer;
  remove header/body Close/X duplicates and preserve dirty/busy/focus guards.
- [x] Four focused adapter checks pass: KTUI ownership/batch rendering, reactive
  handlers/guards, escaped text and instance/view cleanup on replacement/empty.
- [x] Production build, test-source TypeScript check and diff check pass.
  Browser-verified actual KTUI inventory/products roots, supplier filtering,
  empty results, inventory menus and no table/document overflow at default
  desktop and 390px mobile; product list also checked at 640px.
- [ ] Complete broader page interaction/keyboard and actual browser-zoom audits;
  these remain separate from focused adapter tests and responsive width checks.

## Icon-only table actions and primary-button limit (2026-10-11)

- [x] Switch Quantity operations to the requested KeenIcons ki-cube-2 (U+E9B8),
  verified against the local vendor mapping and matching bundled outline font;
  preserve the chevron, tooltip, labels and operation guards.
- [x] Replace inventory menu glyphs with verified KeenIcons three boxes
  (ki-cube-3) and horizontal ellipsis (ki-dots-horizontal); retain chevrons,
  hover tooltips, accessible labels and guards. Font/codepoints and both menus
  browser-verified; production build and diff check pass. Cosmetic-only change.
- [x] Add small downward chevrons beside meaningful inventory grouped-action
  icons; share the styling and document the pattern for future table menus.
- [x] Document icon/tooltip-only row actions and maximum one primary button per
  page in AGENTS.md; inventory uses none, including its operation dialogs.
- [x] Convert inventory operation/reload triggers and product Edit actions to
  secondary icon controls with hover-only tooltips and accessible names/titles.
- [ ] Audit other pages for repeated primary-colored buttons and table actions;
  older catalog card-primary examples are superseded, not compliant exemptions.

## Mandatory no-horizontal-scroll rule (2026-10-11)

- [x] Document no horizontal scrolling anywhere, including nested tables/popups,
  customer/admin screens and browser zoom, in AGENTS.md and UI-THEME.md.
- [x] Reflow existing wide inventory and movement-history tables; retain data,
  actions, accessible detail access, vertical scrolling and pagination.
- [ ] Audit other pages/dialogs for horizontal overflow at desktop/mobile/zoom.
- [x] Remove product-management table's horizontal-scroll/min-width fallback;
  wrap desktop columns and use labeled mobile cards, preserving Edit/data.
- [x] Verify live product and inventory container/content widths match at default
  desktop and 390px mobile. Restore preview compilation/default viewport.

## Inventory presentation and page-copy guidelines (2026-10-11)

- [x] Group quantity actions into a button dropdown; rename Receive stock and
  let Physical count handle the opening count. Put Set reorder point and
  View Movement history in Other operations. Preserve guards/history/retries.
- [x] Dropdown production build passes; tests skipped at user request.
- [ ] Update/run affected stock-dialog and dropdown interaction coverage later;
  old opening-dialog UI assertions no longer describe the merged count flow.

- [x] Add vertical header padding and wrapping title/action spacing to inventory.
- [x] Remove filtering/pagination/export implementation explanations from inventory,
  history popup, export progress/toasts and admin product listing.
- [x] Document task-focused UI copy, consistent section padding, useful navigation,
  actionable limits and retained business warnings in AGENTS.md, UI-THEME.md and
  docs/INVENTORY-MANAGEMENT.md.
- [x] 56 focused tests and production build pass; browser-checked default/mobile
  header wrapping and history-popup copy, then restored the default viewport.

## Project builder and plan consolidation (2026-10-10)

- [x] 2026-10-13: move free-text creation into the component picker, remove the
  main-page button, preserve explicit category/quantity through account and local
  persistence, and retain legacy Other lines. Same-dialog editor, footer-only
  Cancel; 48 focused frontend and 9 backend tests pass. See component policy.

Current-BOM component table and published category picker delivered 2026-10-13:
[policy, API contract and evidence](docs/BOM-COMPONENTS.md). The 48 focused UI tests
and 22 catalog API tests, UI build and backend type check pass. Full frontend run
has 514 passing and 13 failing inventory/supplier tests outside this slice;
their older dialog/ID/CSV expectations remain separate remediation work.

- [x] Current project BOM policy: keep existing BOM editing continuously
  available in grouped KTUI component tables. Every configuration shows a
  non-blocking missing-inverter completeness state; hybrid projects also show
  missing-battery state. These are UI presence requirements, not executable
  compatibility rules, design approval or a required-component creation gate.
- [ ] Add category actions (Add inverter, Add battery, and optional panels,
  non-hybrid batteries, mounting, protection and Other/free-text). Preserve
  multiple products, repeated products and independent line quantities. Existing
  unavailable products remain visible/editable. Catalog selection uses a
  published-only API-filtered 10-item cursor picker scoped to the explicitly
  current owned Draft project; active-project state is not implicit or changed.
- [ ] Keep this current-BOM feature separate from the future staged Build
  Assistant and its suggestions, compatibility work, review and atomic append.
  No PO, design approval, stock behavior, migration or cloud change is included.
  Implementation/browser verification is pending; no results claimed here.

- [x] 2026-10-11: record typed TypeScript rule architecture and mandatory maintained
  AI-oriented rule docs, template/index and planned shared-battery-voltage example.
- [x] With the first executable builder rule registry, add documentation/code/test
  ID/version/status parity checks and run every documented fixture as a rule test.

- [x] Consolidate standalone customer/admin roadmaps in plans/, preserve their
  history/old-path forwarding notes and add the canonical plan index.
- [x] Record the accepted category-table builder with multiple independent store
  or free-text rows per category, Qty versus Add another, scoped compatibility
  feedback, selected review and atomic BOM append requirements; archive the mockup.
- [x] Builder task 1: audit public product/category/unit/specification support and
  define multi-row contracts, reviewed compatibility rules and missing data.
- [x] 2026-10-11: implement pure shared-bank nominal voltage validator, separate
  unassigned finding, synthetic fixtures and documentation parity gate. No API/UI
  consumes these yet; product evidence verification remains pending. See
  [foundation/data audit](docs/BUILDER-DATA-AUDIT.md).
- [x] Foundation verification: 430 frontend tests / 56 files, 110 backend tests,
  both builds, app/spec/backend TypeScript checks and diff check passed. No
  cloud or live project data changed; customer builder route remains pending.
- [ ] Builder task 2: implement owned-project category table, staged row editing,
  selection/totals, customer theme, mobile layout and dirty-navigation protection.
- [ ] Builder task 3: connect published component picker with bounded API filters,
  10-record cursors, images, retry and stale-session/query/route fences.
- [ ] Builder task 4: add requirements, explainable suggestions, reviewed rule/group
  checks and honest unknown/incompatible results; never claim design approval.
- [ ] Builder task 5: implement reviewed atomic selected mixed-row BOM application,
  idempotency/concurrency/toasts and automated plus separate browser verification.

Current priority: [project builder](plans/PROJECT-BUILDER-PLAN.md), ahead of POs.
All roadmaps: [plan index](plans/README.md). Older unchecked historical entries do
not supersede newer implementation contracts or indicate these builder tasks shipped.

## My projects management (2026-10-09)

- [x] API project-details editing with strict metadata fields and retained BOMs.
- [x] Transactional archive/restore, read-only archived BOMs and atomic active clearing.
- [x] Retry-safe Draft duplication with independent mixed BOM identities; no POs,
  removed-line history, Cart links or active-selection copying.
- [x] Validated API search/filtering over owned projects before returned pagination;
  10-record UI pages with bounded scans and honest sparse-segment continuation.
- [x] Details editor and lifecycle confirmations with KTUI success/error toasts,
  reviewed versions, archive-cycle retry identities and route/account result fences.
- [x] Integrated verification: 425 frontend tests / 55 files, 98 backend tests,
  both builds, app/spec/backend TypeScript checks, git diff check, and new plus
  existing customer Projects emulator scenarios pass. Local /health and page
  return 200; unauthenticated project list returns 401.
- [ ] Customer browser create/edit/archive/restore/duplicate and desktop/mobile/
  dark-mode visual verification: browser connection exits before observation.

Current implementation and cost limits: [account Projects](docs/ACCOUNT-PROJECTS.md).

## Inventory operations (2026-10-09)

- [x] Add the responsive Supplier column to the inventory main table, resolving
  names from loaded paged supplier options with explicit unset/not-loaded states;
  no extra API queries or stock changes.

- [x] Backend actual counts with reviewed absolute quantities, no-change audit,
  expected versions, idempotency and unit protection.
- [x] Atomic linked transfers across two known active pools with conservation,
  both-version checks, concurrency protection and safe exact retries.
- [x] Per-pool nullable thresholds, unit/version protection and API-side
  unknown/zero/low/in-stock filtering before visible pagination. Candidate scan
  is capped at 50; sparse empty segments retain continuation.
- [x] Core CSV formatting, formula protection and threshold/transfer metadata.
- [x] Backend 94 tests, checks/build and isolated demo emulator operations pass,
  including complete filtered pages, sparse continuation and ledger reconciliation.
- [x] Count/transfer/threshold controls, API-filtered balance/history export,
  scoped exact retries, stale destination/account fences, blue KTUI badges/toasts
  and dirty-form protection. Production frontend build and 402 tests / 51 files
  pass (64 focused inventory API/CSV/UI tests), including owned nested prompts.
- [ ] Real-browser admin writes/downloads and desktop/mobile visual checks:
  browser connection fails before observation; no live stock seeded.
- [ ] PO-linked inventory is disabled pending finalized customer-order lock/
  reservation/cancellation rules and separate inbound supplier-receipt policy.

Current contracts and read/export cost limits:
[inventory management](docs/INVENTORY-MANAGEMENT.md).

## Movement history popup (2026-10-09)

- [x] Bound movement queries to five records plus one lookahead, preserving
  version-descending order, pool-bound cursors and private admin authorization.
- [x] Isolated emulator verifies all 56 movements across 12 pages without
  duplicates/skips; ledger reconciliation and stock transaction regressions pass.
- [x] Implement viewport-bounded blue KTUI popup with scrollable body,
  Previous/Next page replacement, exact-target retry and dismissal/focus return.
- [x] Backend 89 tests and checks/build; frontend 369 tests / 49 files and
  production build, including 31 focused inventory tests. Dismissal, account/
  route/query fences, last-page bounds and busy-history guards are covered.
- [ ] Browser visual verification: connection failed before observation.

## Inventory pagination (2026-10-09)

- [x] Use fixed 10-row API pages with visible Previous/Next and page indicator;
  replace rows on navigation and retain cursors only, not cached page contents.
- [x] Reset to page 1 on filter/location/account changes; preserve failed-page
  retry targets and prevent navigation during stock changes or filter debounce.
- [x] Backend 88 tests and checks/build; frontend 361 tests / 49 files and build,
  including 23 focused inventory tests. Isolated emulator confirms 55 products
  across six pages (10/10/10/10/10/5), without duplicates or skipped records.
- [x] Read-only live first page returns three products; no live stock seed,
  new indexes, cloud services or deployment.
- [ ] Browser visual verification: connection failed before observation.

## Physical inventory foundation (2026-10-09)

- [x] Replace /admin/inventory fixture data with protected physical locations,
  editable metadata/status, nullable product/location balances and API-side
  SKU-prefix/category/supplier filtering before bounded pagination.
- [x] Record opening (including zero), receipts, issues, returns, damage and
  signed corrections with reason, observation time, actor and immutable history.
  Atomic balance/ledger/request receipts, version conflicts, nonnegative guards
  and fixed-unit protection include first-opening versus unit-edit races.
- [x] Preserve unchanged retry payloads, fence account/route/query/location results,
  confirm issue/damage/correction, guard dirty location/stock navigation and
  pending saves, and use shared blue KTUI controls, KeenIcons and toasts.
- [x] Backend 87 tests + checks/build; frontend 357 tests / 49 files + build;
  focused inventory 19 tests. Isolated inventory and catalog-management emulator
  regressions pass. No live stock seed or new cloud service/index/rule deployment.
- [x] Local health/readiness and direct/proxied catalog return 200; unauthenticated
  direct/proxied inventory returns 401; existing icon font returns 200.
- [ ] Real admin stock/location write and reload, rendered icons/tooltips and
  responsive/mobile checks. Browser connection failed before observation.
- [x] Physical count/reconciliation workflow and atomic linked location transfers.
- [x] Low-stock thresholds and API stock-status filters; global summaries deferred.
- [ ] Independent supplier availability and customer-safe stock/freshness projections.
- [ ] PO-linked receipts/reservations/fulfillment after status policy; returns
  disposition, costing, serial/lot requirements and recovery/export decisions.

See [inventory management](docs/INVENTORY-MANAGEMENT.md) for contracts and costs.

## Supplier filters and connected readiness (2026-10-09)

- [x] Supplier name-prefix and active/inactive API filtering before bounded
  pagination, Unicode-aware range, query-bound cursor, legacy UUID compatibility.
  Same-row compact KTUI Clear, 300 ms debounce, retry/pagination and stale fences.
- [x] Add only the required supplier status/name index to store-dev; READY.
  Six read-only live supplier variants and isolated emulator pagination pass.
- [x] Replace readiness placeholder with lazy, single-flight, 60-second cached
  Firestore/Auth/storage read checks, 3-second response deadline and hung-call
  gate. Disabled defaults do not initialize credentials; no paid polling.
- [x] Backend 83 tests, checks/build and frontend production build pass.
  Full frontend suite: 337 tests / 47 files pass. The initially reproduced
  cart-to-project assertion race was repaired by awaiting dialog completion,
  retaining every data/ownership/active-selection assertion.
- [x] Restart local frontend 4300 and backend 4400 using approved configuration.
  Health/readiness/direct+proxied catalog return 200; unauthenticated me is 401.
- [x] Resolve the cart-to-existing-project test synchronization failure.
- [ ] Real-browser supplier editing/status, clipboard paste, Remove -> Save,
  publishing/toasts and mobile layout confirmation. Browser connection failed
  twice before observation; DOM/emulator checks do not replace those tests.
- [x] Replace fixture inventory with API-filtered physical stock by location;
  see the current inventory management contract.

See [admin management](docs/ADMIN-CATALOG-MANAGEMENT.md) and
[readiness](docs/CONNECTED-READINESS.md) for current contracts and cost limits.

## Admin catalog management completion (2026-10-09)

- [x] Delete unreferenced removed images only after successful Save/publication;
  retain shared/public/held assets, fence concurrent attachments, generation-match
  storage deletes, retry partial failures, and sweep orphan uploads after 24 hours.
  Cleanup is bounded/opportunistic, not a paid scheduler or cache-revocation promise.
- [x] API product brand/category/supplier filters and explicit economical SKU-prefix
  search before 50-row cursor pagination; independent paged options, same-row Clear,
  debounce/retry/query/account/route fences. Seven store-dev composite indexes READY.
  All 16 read-only live query variants/options checks passed.
- [x] Supplier contact editing, atomic unique-name changes, confirmed deactivate/
  reactivate, version/retry/audit protection and KTUI toasts. Inactive suppliers
  block new sourcing/publishing but do not delete history or unpublish listings.
- [x] Repair project dialog reentrant-close result loss and obsolete async/Auth
  tests, retaining owner isolation, cancellation, retry, atomicity and Undo.
- [x] Complete frontend suite: 328 tests / 46 files pass; production build passes.
  Backend: checks/build and 75 tests pass. Isolated emulator + synthetic-bucket
  lifecycle/supplier/filter regression passes. Health and direct/proxied catalog
  return 200; unauthenticated account/admin requests return 401.
- [x] Document contracts/cost boundaries in
  [admin management](docs/ADMIN-CATALOG-MANAGEMENT.md) and
  [image lifecycle](docs/PRODUCT-IMAGES.md). No live catalog/image mutations or
  website deployment were used in this verification; only required indexes added.
- [ ] Manual browser confirmation of supplier editing/status, image Remove -> Save,
  clipboard upload, filter interaction and responsive layouts remains pending.
- [x] Migrate supplier loaded-row search to the bounded prefix/status API.
- [x] Replace fixture inventory filters with bounded SKU/category/supplier APIs.
- [ ] Future PO locking must atomically establish immutable image retention holds;
  ordinary project/BOM saves must not create snapshots.

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
- [x] Migrate product search/brand/category/supplier filters to the protected API
  before pagination, including complete bounded option sources and query fencing.
- [x] Migrate connected supplier search to prefix/status queries under the same
  standard (current completion above).
- [x] Replace fixture inventory browsing with server-filtered physical stock;
  low-stock/status filtering remains deferred, not a loaded-row implementation.
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
- [x] Define a reviewed unused-upload cleanup/retention policy before production,
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
- [x] Resolve the previously recorded 9 project/Auth failures; current complete
  suite passes (see 2026-10-09 results above). Earlier counts are historical.

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

Detailed scope and proposed routes: [USER-FACING-PLAN.md](plans/USER-FACING-PLAN.md).

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
- [x] Complete desktop/mobile browser checks for the phase 2 local project preview; evidence and viewport notes are recorded in `plans/USER-FACING-PLAN.md`.

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
