# Dumaget.me Solar Supply

Angular scaffold for the solar contractor catalog and operations workspace,
with a separate local Node.js/TypeScript API bootstrap.
Layouts and workflows are adapted from the Google Stitch reference; styling uses
Provia's Metronic 9.2/KTUI foundation and KeenIcons conventions.

## Run locally

Requirements: a compatible Node.js runtime (verified with Node 26.4) and npm.

```powershell
cd solar-ui
npm ci
npm start
```

Open http://127.0.0.1:4300. After dependencies are installed in `solar-ui`, the root
also exposes `npm start`, `npm run build`, and `npm test` forwarding scripts.

### Backend API bootstrap

The separate Node.js/TypeScript Fastify API lives in `backend/`:

```powershell
npm ci --prefix backend
npm run api:dev
```

Local process health is available at `http://127.0.0.1:4400/health`.
`/ready` remains 503 until connected readiness is implemented; `/api/v1/me`
is disabled while Firebase/Auth activation is pending. No credentials or cloud
resources are needed for the default server or offline tests. Use `api:check`,
`api:build`, `api:test`, and `api:start` for the independent backend toolchain.
Angular scripts and frontend fixtures remain unchanged. See
[backend setup and boundaries](docs/BACKEND.md).

## Current routes

- `/catalog`: product search, brand/category filters, details dialogs, and guest Add to
  equipment list.
- `/draft`: browser-local guest equipment list, tier pricing, VAT breakdown, CSV,
  one-time project linking, Start new list confirmation, and reopenable local history.
  `/bom` redirects here. Legacy `solar.bom.v1` data migrates without deleting its backup.
- `/my/projects`: customer-local project list/search/cards, the My projects entry
  to a shared three-step New project wizard, and project overview. Data is stored
  in a browser-local preview store with a synthetic owner; it is not account data.
- `/my/projects/:projectId/bom`: editable mixed project BOM, free-text editor,
  stock-independent quantities, checked-row selection, and selected CSV export.
  Catalog Add to project targets the active/another project or creates one with
  its initial item through the shared wizard; the guest equipment list stays separate.
- `/my/favorites`, `/my/profile`, and `/my/settings`: local-preview placeholders.
- `/admin/products`: private API-backed draft product list, bounded cursor loading,
  and search/brand/category/supplier filters over loaded records.
- `/admin/products/new`: authenticated draft product creation, exact PHP centavos,
  required existing supplier and retry-safe writes to named `store-dev`.
- `/admin/suppliers` and `/admin/suppliers/new`: private supplier listing/creation.
  No sample records are exposed through these canonical admin routes.
- `/admin/inventory`: retained blue, read-only fixture preview, not live stock.

Supplier/product forms and API are implemented and locally tested; live use still
requires the unresolved Auth decision, trusted admin bootstrap and verification.
See [admin catalog creation](docs/ADMIN-CATALOG-CREATION.md).

### Current authentication and guest-access boundary (2026-10-06)

`/sign-in` and a shared sign-in dialog now use the customer theme. Header Sign in
and the eligible guest-list Sign in to continue action open
the dialog. Add to project stays disabled for guests with the exact hover/keyboard
tooltip **Sign in to add to project**. `/my/**` redirects to `/sign-in`, retaining
the requested local route; it does not render private project lists or names.
Linked guest lists/history show generic project labels while signed out.

Catalog cards no longer repeat Sign in or Review account buttons. Use the header
for account access; disabled project actions retain their hover/keyboard hints.
The remaining guest-list Sign in to continue action and pending-intent safeguards
are unchanged. Header sign-in does not invent a selected catalog item.

The approved Google-auth client is implemented with Firebase SDK 12.19.0 and a
dedicated storefront web app in shared `dumaget-me-solar`. The user supplied
`mark@solar.dumaget.me`; Auth-only provisioning completed, but verification
returned the unexpected `IDENTITY_PLATFORM` subtype instead of approved
`FIREBASE_AUTH`. Google is enabled, yet end-to-end Auth is unverified and the
runtime action stays disabled. There are no password
forms or fake login controls. The local project/BOM preview
implementations described above remain in the code and their records are preserved,
but the normal runtime cannot open them until account-scoped persistence is implemented.
Tests alone inject a synthetic session to exercise the old preview workflows.
A real account ID cannot unlock another browser's synthetic preview records.

Pending product reference/quantity, list ID/review fingerprint, or return route is
kept separately under `solar.sign-in.pending.v1` in sessionStorage (24-hour restore
limit). Blocked storage falls back to memory with an explanation. Cancel does not
copy items or create projects; the catalog filter remains intact during the dialog.
Guest browsing, list editing/export, and history remain available. This is frontend
gating, not backend authorization. The observer-driven Auth client supports session
restoration, sign-out, account changes and sanitized errors once enabled. Even a
real Firebase UID equal to `local-preview` cannot unlock synthetic projects.
Signed-in users get a project-saving limitation and Review account action instead
of another sign-in prompt. Pending-action resumption, account-scoped persistence
and shared server-rule changes still require a separate implementation/approval.
See [Authentication setup and checks](docs/AUTHENTICATION.md).

Verified: production build, 99 tests/17 files, app/spec type checks, and desktop/mobile
light/dark, guest routes, keyboard focus/tooltips, retained filter/item context,
linked-history name suppression, fonts/icons, and administration-theme isolation.
Original 32-panel list, local projects, history, light preference, and default
viewport were preserved/restored. Real sign-in/resumption remains unverified.

The admin workspace uses Provia's Demo 1 shell, with responsive navigation
and a collapsible sidebar. Shared light/dark tokens, KTUI buttons/forms/cards/tables,
KeenIcons fonts, and accessible action tooltips are wired through Tailwind 4/PostCSS.
Public catalog, guest draft, and customer My pages use the supplied Stitch green/mint palette, with
self-hosted Space Grotesk headings/labels/prices and DM Sans body text. Public
cards use Stitch's nearly square 2px corners and subtle shadows. Administration keeps the
Provia blue theme. Dialogs and other overlays inherit the active page's appearance.

## Admin product-management roadmap

See [the admin product-management plan](docs/ADMIN-PRODUCT-MANAGEMENT-PLAN.md)
for proposed product list/detail/editor pages, draft/publish/archive workflows,
categories/brands, public pricing versus private supplier offers, media retention,
and a phased path from isolated preview to authorized backend writes. The New
product development preview is now implemented; existing-product editing and
connected CRUD remain pending. Production administration remains a read-only
fixture preview; no operational CRUD is implied by this plan.

The first Products list slice is implemented (2026-10-06), retaining the blue
KTUI theme, shared verified KeenIcons and disabled-action tooltips. It projects
six fixture products without inventing publication records, dates or tax metadata.
Build, app/spec type checks and 119 tests across 20 files pass. Browser checks cover
desktop/mobile light/dark, search/filter/empty-state recovery, reloadable pagination,
detail dialog focus/Escape return, the mobile drawer, fonts/icons and return to the
green customer theme. No fixture/customer data, Auth settings or cloud resources
were changed. These list-only results precede the editor extension below.

The New product preview extension (2026-10-06) adds typed, memory-only drafts,
duplicate-SKU/field validation, exact centavo conversion, idempotent saves, dirty
navigation confirmation and retained input on failure. Saving returns to the
list filtered to the new draft; Cancel restores the prior validated list URL.
Unknown category/unit/price/stock/media stay unknown, not invented defaults.
Build, app/spec checks and 142 tests in 23 files pass. Browser checks cover
creation/details, invalid/duplicate inputs, first-error focus, Cancel/Escape,
filtered return, refresh loss, mobile/desktop light/dark and keyboard Publish hints.
The action skill preserves blue KTUI controls and verified KeenIcons; no theme,
vendor, Auth or cloud configuration changes. Original light/default viewport were
restored; only synthetic in-memory test drafts were cleared by refresh.

Supplier filtering is also implemented on `/admin/products` (2026-10-06). It uses
fixture supplier IDs with name labels, intersects existing filters, resets paging
and persists through the URL. All suppliers includes supplier-less preview drafts;
a named supplier excludes them without inferring sourcing from brand. Build,
app/spec checks and 145 tests/23 files pass, plus reload/editor-return and mobile
light/dark browser checks. No sourcing, pricing or cloud data was changed.

## User-facing roadmap

See [the user-facing website plan](docs/USER-FACING-PLAN.md) for the proposed
sidebar-free shopping area and separate customer My pages (projects/BOM,
favorites, profile, and later purchase orders with a pre-lock quotation-review
stage rather than a separate quotation page). Each project keeps an
editable BOM and can have multiple independently progressing POs. Locking, complete
product snapshots, and immutable revisions apply to each PO, not the BOM; statuses
and the lock threshold remain TBD. The plan records the page map, guest-draft
migration, one-time guest-list linking with a fresh-list path, duplicate-product
PO stock/tier aggregation, shared theme rules, quantity reporting, delivery phases,
and acceptance criteria.
Phase 1 layout separation is implemented and verified. The initial bounded phase 2 project
preview supported listing/searching, project creation from My projects, explicit
active-project selection, and a read-only overview. It uses browser-local data with
a synthetic owner and is not connected to accounts or a backend. Favorites, profile,
settings, and connected account/purchase-order workflows remain planned. Subsequent
local project/BOM/guest-list extensions are recorded below.
Initial phase 2 validation confirmed: production build passed, 46 tests passed in 9 files,
and both app/spec `tsc --noEmit` checks passed. Desktop/mobile browser checks
passed, including wizard focus/cancel behavior, local project persistence, responsive
dialogs, light/dark styling, and customer/admin theme isolation. Viewport overrides
were 1440x900 and 390x844; browser zoom yielded CSS widths 1309 and 355. The original
light/default viewport was restored after the checks; the sample local preview
project remains in browser storage.

The subsequent catalog-to-project/mixed-BOM slice extends this local prototype.
Each addition creates a separate line, even for repeated products. Creation with
an initial item uses one local-envelope write, and stable request IDs prevent
duplicate retries. Free-text lines are unpriced; missing catalog references stay
visible with unknown pricing. Row selection is transient, defaults to all checked
on page entry, and survives dialogs/rerenders. Export preserves selected identities,
types, descriptions, units, notes, and pricing provenance, with formula-safe CSV
text. Store tiers are illustrative and per-line; no aggregate commercial policy
or historical snapshots are implied.

Catalog/mixed-BOM verification (2026-10-06): production build, 62 tests in 11 files, and both
app/spec TypeScript checks passed. Browser checks cover catalog chooser/wizard,
creation with an initial item, unchanged active project, separate repeated-product
lines, mixed BOM edits and reload, retained selection, none-selected export guard,
mobile dialog scrolling/keyboard focus, light/dark styling, and admin isolation.
The in-app browser timed out waiting for a CSV download event: selected CSV content
is tested, but real browser file delivery remains unverified. A sample project
`Local preview - Mixed BOM` remains for inspection. No Firebase or deployment changes.

The next guest-list preview slice implements all-row copying to an active/existing
project or the shared wizard, followed by a permanent one-time local link. Later
list edits never synchronize to that project. Start new equipment list confirms
a fresh empty/unlinked ID while retaining previous lists, edits, and links;
history can reopen them without enabling re-copying. No guest row checkboxes or
free-text entries are introduced. Missing/incompatible products block the entire
copy with an explanation, preserving the source for correction.

Projects, guest history/current identity, and copy receipts now share the optional
`guestHistory` field of the `solar.projects.preview.v1` envelope so the batch and
link save in one write. Existing project envelopes remain readable. Legacy
`solar.bom.v1` is read once during lazy migration and remains an untouched recovery
backup; after the first successful write it is no longer the active list store.
Malformed data and detected stale-tab conflicts are preserved, not overwritten;
write failures publish no list/project change. This is not concurrent-tab transactional
locking, sign-in, backend authorization, cloud sync, or historical product snapshots.

Guest-list verification (2026-10-06): build, 77 tests in 13 files, app/spec type
checks, and desktop/mobile workflow, focus, theme, and reload checks pass. Existing
active project stayed unchanged. The original 32-panel list remains current,
now linked to `Local preview - Guest list link`; a fresh empty unlinked list is
also retained in history. The temporary quantity test was restored to 32.
CSV file delivery remains unverified; no Firebase/deployment changes were made.

## Scope and integration points

### Firebase project

Use the shared Firebase project `dumaget-me-solar`, matching the sibling
`D:/git/solar/solar.dumaget.me` site's `.firebaserc`. This repository's `.firebaserc`
records that default project. The Google-auth client and dedicated Firebase web app
are now configured, with production activation held until provider setup is verified.
Firestore provisioning is complete; Storage and storefront Hosting remain absent.

The storefront development backend will use Cloud Firestore named database
`store-dev` in `dumaget-me-solar`, explicitly selected instead of `(default)`.
The database is provisioned as Standard / Native / Singapore (`asia-southeast1`),
with deletion protection and API-only deny-all rules. Authenticated application
connectivity and production database selection remain pending. See the
[provisioning record](docs/FIRESTORE-PROVISIONING.md). Always use
the lowest-cost suitable service option and default new regional resources to
Singapore; do not enable Enterprise features or migrate shared services implicitly.
See the [cost/region policy](docs/INFRASTRUCTURE.md#cost-first-backend-policy) and
[database decision](docs/INFRASTRUCTURE.md#storefront-firestore-database-decision-2026-10-07).

The [live service inventory](docs/INFRASTRUCTURE.md#live-firebase-service-inventory),
verified 2026-10-06, confirms the main site's Hosting deployment and Analytics link.
Google is enabled in the unexpected `IDENTITY_PLATFORM` subtype, so approved
Firebase Auth activation and live login remain unverified. Firestore now has only
`store-dev`; the earlier empty inventory is historical. Storage has no buckets
in the last inventory. A
separate storefront web app is registered; no separate Hosting site exists yet.
Enabled APIs must not be described as operational backend
features; this storefront remains a local scaffold.

The local Admin SDK credential is copied to
`infra/dumaget-me-solar-firebase-adminsdk-fbsvc-250560e75d.json` and Git-ignored.
It is for trusted server/tooling use only, never Angular code or public uploads.
Shared backend permissions and data boundaries must be designed before replacing fixtures.

### Hosting strategy

Follow the main site's current strategy: Firebase Hosting, with production builds
and GitHub Actions live deployment from `main` when configured. Use a separate
storefront Hosting site/target within `dumaget-me-solar` for `store.solar.dumaget.me`;
do not publish over the main site. The sibling's S3/CloudFront files are historical
reference, not the chosen deployment path. Storefront hosting configuration,
scripts, workflow, and domain mapping are not implemented yet. See
[infrastructure documentation](docs/INFRASTRUCTURE.md) for verified references,
SPA routing differences, deployment isolation, and credential safety.

This is a local frontend scaffold. All prices, stock, supplier terms, and specifications
are illustrative fixtures in `solar-ui/src/app/core/demo-data.ts`, not verified offers.
The BOM is stored in this browser only. It does not reserve inventory or submit orders.
Admin routes are demonstration views without authentication; they must be protected
before real admin APIs or private data are connected.

The existing `Product`, `Supplier`, and browser-draft types remain in `core/models.ts`.
That file also exports the new typed project/BOM, guest-list, customer, and PO/history
contracts from `core/models/`. See [frontend models](docs/FRONTEND-MODELS.md) for
relationships, money units, proposed statuses, and validation boundaries. These
contracts are not connected services or implemented workflows. Replace fixture reads
with a catalog repository/API when backend work is in scope. Purchasing, live inventory,
supplier RFQs, inbound POs, checkout and engineering checks remain future integrations.
Google Auth subtype recovery, authorized-domain setup, and live OAuth verification
remain pending; the storefront sign-in flag is intentionally off.
Keep pricing and stock authority on the server for actual orders.

Run `npm run build` and `npm test` to verify. Source theme provenance is documented in
`UI-THEME.md`; reusable customer-facing theming guidance is in
[solar-customer-theme](.agents/skills/solar-customer-theme/SKILL.md), with companion
icon/action guidance in `.agents/skills/solar-ui-actions`.

## Layout-separation verification

Verified 2026-10-06: the production build, 30 tests, and strict app/spec TypeScript
checks pass. Browser checks with desktop/mobile viewport overrides covered shopping
and customer navigation, public/admin theme isolation, light/dark preference,
mobile drawer focus trapping/Escape restoration, and the `/bom` redirect. Above-stock
guest quantities persisted after reload; the original browser quantity was restored
after testing. Missing-product retention and rendering are covered by automated tests.
Favorites, profile, and settings remain placeholders. The projects preview uses
browser-local storage; no backend services or deployment were changed. Phase 2
build, tests, app/spec TypeScript checks, and desktop/mobile browser checks passed;
browser details and viewport measurements are recorded in the roadmap.

## Historical verification

Before layout separation, the production build, twenty-one tests, and strict app/spec TypeScript checks passed,
including nine new model-contract tests, public/admin theme isolation, and
light/dark preference behavior. Earlier browser checks covered desktop and mobile
layouts, filters, draft persistence and tier pricing, light/dark themes, details dialogs,
keyboard tooltips, and responsive navigation. KeenIcons mappings and copied fonts were
verified against Provia. CSV file delivery remains unverified: the in-app browser did
not report a completed download, so check export in a regular browser before relying
on it.

Dependency audit reports six affected production Angular packages (four high,
two moderate). Review and patch the pinned Angular baseline before production;
no automatic dependency upgrades were made as part of the public theme change.
