# Solar ecommerce project instructions

## Subagent model selection

Always explicitly pin each subagent's model to the model requested by the user
before starting it. Do not rely on inherited defaults or reuse an existing agent
unless its model is verified to match the request. If the requested model is
unavailable or cannot be pinned, report the limitation before dispatching; do not
silently substitute another model.

## UI theme and icons

### Required markers and Add icons

Project-wide, mark required form fields and required BOM component slots with
a red asterisk using the shared solar-required-marker class. Do not label fields
or slots with (required), (optional), or a separate Required/Optional caption.
Optional fields have no marker. Reflect the actual operation's validation,
including conditional requirements; draft-optional publishing prerequisites must
not become required merely to add a marker. Preserve native required bindings,
use aria-required for programmatically required controls without native bindings,
and provide an accessible required indication for non-form component slots.
Keep validation/error messages and explanatory field help intact.

Use verified KeenIcons ki-outline ki-plus for Add, Add another/more, New and Create
actions, including Add to Cart and Add to project. Keep check icons for Save,
Confirm and existing selected/active states, not additions. State-dependent
Add/Save controls must switch their icon with their action. Cart/project
navigation retains its destination glyph (handcart/clipboard). This supersedes
older Add-action icon examples in theme and skill documentation. Preserve labels,
tooltips, accessible names, disabled guards and the primary-button budget.

### Internal IDs are never display content

Never display internal record, supplier, product, project, Cart, movement, image
or user IDs in page/dialog text, labels, tooltips, accessible names, toasts or
user-facing exports. Show names and business references such as SKU or location
code instead. If a name cannot be resolved, use an honest unavailable-name label,
never an ID/email fallback. Preserve immutable IDs internally for authorization,
joins, routes, form values, tracking, persistence and retry protection; names are
not identity. Keep lookups bounded; do not download collections to hide IDs.

- Page and section headers must not link to other pages or contain navigation
  shortcuts (for example, inventory's Manage products). Use the sidebar for
  cross-page navigation; keep headings as plain titles. Headers may contain
  actions on the current page, such as New location or Export, not duplicate
  sidebar destinations. This does not remove navigation in the shared app shell
  or contextual record actions outside headers. Audit older violations as debt.
- Main-table row actions and their responsive card equivalents must be icon-only
  with shared hover-only tooltips, record-specific accessible names and matching
  native titles. Use verified KeenIcons and secondary KTUI icon buttons. Dropdown
  triggers follow this rule; their menu entries retain readable text labels.
- Grouped table-action triggers pair a meaningful action icon with a small
  downward chevron using the shared kt-btn-grouped-action styling. Single actions
  have no chevron. Keep labels in tooltips and preserve menu accessibility/guards.
- Maximum one primary-colored button per page, not one per row/card. Primary
  styling is optional: use zero when no single action warrants emphasis. Repeated
  row/card actions must never consume a primary color. This supersedes older
  per-card primary-action examples in theme/skill documentation.
- /admin/inventory uses zero primary-colored buttons, including location forms
  and stock-operation dialogs. Use secondary controls while preserving all
  validation, disabled guards, confirmation requirements and accessible focus.

Use the Provia-derived Metronic/KTUI foundation documented in `UI-THEME.md`.
The Stitch reference supplies solar layouts and workflows.
Public catalog, customer BOM, and not-found pages use the Solar Wholesale Engine
green palette and Space Grotesk/DM Sans typography recorded in `UI-THEME.md`.
Admin pages retain Provia blue. Select appearance through route metadata and shared
semantic tokens; keep overlays and action styles consistent with the active theme.

For UI action styling, icon selection, or action tooltips, read and apply
`.agents/skills/solar-ui-actions/SKILL.md`. It defines shared KeenIcons usage,
primary/secondary buttons, hover/focus hints, disabled-control explanations,
and responsive action spacing for solar catalog and administration pages.

Verify icon selectors against loaded glyph mappings and fonts; do not assume the
complete KeenIcons catalog is loaded. Keep shared styles and tooltips reusable.
The Angular application root is `solar-ui`. Run its scripts from that directory,
or use the root forwarding scripts after installing its dependencies.

## Table filtering guidelines

### Notices require explicit instruction

Never add informational/policy notices or warning banners like the public image
notice unless the user explicitly instructs you to include them. Keep storage,
public-access, caching, cleanup and retention explanations in implementation docs,
not pages, forms or dialogs. Do not replace a removed notice with another banner,
tooltip or inline disclaimer. This supersedes older suggestions to add these
notices automatically. Preserve ordinary field help, validation/errors, requested
success/failure toasts and existing action confirmations; removing copy does not
change storage permissions, authorization or deletion safeguards.

### Mandatory library-backed browsing tables

All browsable tables must use an established table/datatable library and its
supported component/design. Do not roll a bespoke table design or table engine;
adding library CSS classes to a hand-built table is not sufficient. This applies
to customer/admin record lists and table-based dialog/history views. Use the
installed KTUI DataTable through solar-ui/src/app/shared/ktui-table.ts; its actual
renderer owns rows and cells. Read docs/KTUI-TABLES.md before extending it.
Do not add another table dependency or paid enterprise features by default.
A shared adapter may bind API data, columns, business actions and theme tokens,
but must not recreate the library's table rendering, navigation or interaction
engine. For cursor APIs, leave the vendor's total-based paginator disabled and
retain API-owned Previous/Next or Load more controls outside the table. This is
not permission to implement a replacement client-side table engine.
Preserve API-side filtering, bounded reads, honest totals, authorization,
accessible actions and the no-horizontal-scroll rule. Do not fake total counts,
download all records, or switch to loaded-row filtering to satisfy a widget.
Existing bespoke tables are migration debt, not permitted reference designs.

### Mandatory layout rule: no horizontal scrolling

Never allow horizontal scrollbars or horizontal scrolling anywhere in the
application: customer/admin pages, tables, cards, toolbars, dialogs, popups and
nested regions, at any supported viewport or browser zoom.
Wide tables must use wrapping columns, a responsive stacked/card layout or a
compact summary with an accessible details view. Keep actions and meaningful
data reachable without sideways scrolling. Long names, SKUs and IDs must wrap.
Do not use overflow-x-auto/scroll or oversized fixed/min-width layouts as a
responsive fallback. Hiding a scrollbar or clipping overflow is not a fix.
Vertical scrolling and Previous/Next pagination remain allowed.
Verify both document and nested-container widths at desktop/mobile and zoom;
existing horizontally scrolling layouts are remediation debt, not exceptions.
Measure scrollWidth against clientWidth for the document and affected rendered
containers. Hidden/clipped body overflow and a successful build do not prove
compliance. Create new stylesheet files before referencing them, and confirm the
local preview rebuilt successfully rather than retaining a stale layout/error.

- Keep page copy focused on user tasks and business meaning. Do not expose API
  request budgets, cursor/index/scan mechanics, pagination strategy, transaction
  jargon or internal concurrency versions in explanatory UI text or toasts.
  Keep these details in implementation docs. Page numbers, page sizes and
  Previous/Next controls are useful navigation and should remain visible.
- Use consistent card spacing: padded header (normally px-5 py-4), separate
  filter toolbar (p-5), explicit gaps, and aligned labels/control baselines.
  A minimum-height header is not a substitute for vertical padding, particularly
  with wrapped content. Keep titles and actions clear of borders at all widths.
- Translate limits/errors into plain next steps (for example, "Narrow your
  filters and try again"), and preserve important stock, permission, irreversible
  history and incomplete-export warnings. Never imply a partial file is complete.

- Keep Clear filters in the same toolbar row as the filter controls, aligned with
  the controls rather than their labels. Use a compact secondary icon-only KTUI
  button, verified KeenIcon, hover-only tooltip, accessible name and native title.
  Let fields reflow on small screens without horizontal page overflow.
- All table filters and searches must be API-side, over the authorized dataset,
  before pagination. Do not filter only already-loaded rows or download the
  entire collection for frontend filtering. Sorting and any displayed totals must
  describe the same server query, not the current page.
- Validate and allowlist query parameters on the server. Preserve authorization
  and ownership boundaries; filters are never a substitute for access checks.
- A filter/search change or Clear filters resets pagination and issues a fresh
  query. Debounce text search and ignore stale responses after query, route or
  account changes. Load more and retry retain the current filter criteria.
- Filter options must not disappear merely because the current page lacks them.
  Use bounded authorized API option/facet data or an explicit server-owned
  vocabulary; do not claim page-derived options cover the full dataset.
- Prefer bounded indexed queries and cursor pagination. Do not introduce
  unbounded scans, realtime listeners, paid search services or cloud index/data
  migrations without reviewing their need, cost and authorized scope.
- Existing loaded-row/fixture filters are migration debt, not compliant examples.
  Record them as pending until API validation, pagination, combined filters,
  clearing and stale-response behavior have been tested.

## Mandatory dialog dismissal layout

Dialogs must not shift the background when opened or closed because the
vertical scrollbar disappears or returns. The shared document root uses a
stable scrollbar gutter so layout width stays constant with native scroll
locking. Preserve KTUI/CDK native scroll locking. Do not add horizontal
scrollbars, clipping, or another overflow workaround, and do not introduce a
custom popup or edit packages/vendor files for this behavior. Apply this to
native confirmation dialogs and CDK dialogs.

Every dialog/modal/popup Close button must be in its footer, at the lower right.
Never put Close in the header or body, including an additional top-right X.
Place other footer actions to its left; on narrow screens Close must remain the
last, right-aligned control. Apply this to read-only details/history, editors,
wizards and confirmations, on both customer and admin pages. Cancel used as the
dialog's dismissal action follows the same placement rule. Use a visible label
and secondary KTUI styling. Keep the footer reachable outside a vertically
scrollable body; preserve validation, busy/dirty-form guards, Escape/backdrop
policy, focus trapping and return focus. Placement does not authorize bypassing
pending-write or discard confirmation protections. Existing violations must be
tracked and migrated rather than copied into new dialogs.

### Mandatory action confirmations

Action confirmations (for example, "Remove this BOM line?" with Confirm removal
and Keep line) must use the installed native KTUI Modal (`KTModal`) through the
shared thin Angular adapter. Never use inline confirmation strips,
`window.confirm`, or a custom overlay engine. The adapter owns only business
text/buttons and KTModal lifecycle; KTUI owns modal behavior. Preserve existing
authorization, read-only, busy and session fences, and require an explicit
confirmation before executing the action being confirmed. Cancellation must be
safe. Preserve focus
trapping and return focus, prevent horizontal overflow, display no internal IDs,
and place secondary dismissal last at the lower-right footer. Do not add a
header X or another library by default. Existing inline confirmations are
migration debt, not approved patterns; migrate them when in scope.
Use solar-ui/src/app/shared/ktui-confirmation.ts for simple confirmations;
keep business writes in the caller, after a positive result and current-session checks.

## Scaffold scope

### Plans and implementation records

Keep standalone product/implementation plans in plans/ and maintain plans/README.md
as their index. TODO.md is the root task/status tracker; docs/ holds implementation
contracts, operational evidence and provisioning records. Current dated updates
supersede older scaffold-only notes. The accepted next customer priority is the
project Build Assistant in plans/PROJECT-BUILDER-PLAN.md; implementation starts only
when requested. Preserve historical plan content and update relative links when
relocating documents; forwarding notes may keep old skill/bookmark paths working.

The starter data is illustrative and the BOM is stored in the browser. Do not present
it as live stock, verified specifications, or real supplier terms. Admin routes are
demo views; add authorization before connecting private data or admin mutations.

Read `TODO.md` for current integration boundaries; implement future items only when
requested. Preserve the Tailwind 4 PostCSS and KTUI source/style registration.

## Builder rules and AI-maintained documentation

Current BOM presence policy requires an inverter and ATS for every configuration,
plus a battery for hybrid. ATS, Circuit breakers, Surge Protection Device,
PV Isolator and MCCB are
separate catalog categories; Protection is no longer selectable. Read
docs/PRODUCT-CATEGORIES.md for legacy compatibility. Do not infer subtype or
amperage from a name. Free-text ATS
must retain explicit componentProtectionType and required positive finite
amperage through saves/reload; frontend/API must validate merged metadata.
Use red required markers and API-side picker filtering. See docs/BOM-COMPONENTS.md
version 5; this UI completeness policy is not an electrical approval or PO gate.
PV Isolator and MCCB are separate top-level choices, not MCB/ATS subtypes.
Do not invent required ratings or auto-reclassify products based on titles.

Planning quantities (Cart, project BOM, Add-to-project/component pickers and
free-text lines) must be positive safe integers. Use the shared appIntegerQuantity
input behavior for typed/pasted quantity entry plus existing frontend and API
validation. Do not silently round/truncate a fraction or strip its decimal to
produce a different amount. Keep integer steps and numeric mobile keyboards.
This does not prohibit decimals in PHP prices or electrical/manufacturer ratings,
or change inventory operation sign/zero rules. No quantity backfill is authorized.

Before adding/changing a builder validator, read docs/builder-rules/README.md,
index.json, the full rule specification, dependent specs and actual code/tests.
Use typed TypeScript logic, source-backed public facts and explicit system/bank
assignments; do not execute natural-language descriptions or infer electrical
limits from marketing text. Every rule needs a stable ID/version and maintained
AI-consumable spec, precise inputs/units/provenance/applicability, result/reason/
severity semantics, examples, evidence limits and actual code/test links.

Update rule code, dependent tests, specification and index in the same change.
Behavior changes require a version bump and change history; typo-only edits do
not. Planned docs are not active validators. Missing inputs return unknown, not
passed; customer acknowledgement is never electrical approval. Code/document
drift must be reconciled before declaring completion. The first pure registry now
has a local documentation/fixture gate: run backend npm run test:builder (included
in npm test), and extend it with future rules. This is not a connected API or
manufacturer-evidence verification. These requirements grant no cloud/rule
deployment or live-data authority.

## MCB specifications

MCB products must be explicitly classified as Circuit breakers and have required
AC or DC type and positive numeric amperage in amperes, including drafts.
Never infer these ratings from names or representative images. Preserve legacy
unclassified records and validate merged saves as well as create/publication.
Maintain docs/MCB-SPECIFICATIONS.md with code and tests when changing this model.
ATS is a separate top-level category, not an MCB. Keep its MCB specifications
absent/null; require positive numeric atsSpecifications.amperage on create, Save
and Publish, including drafts. Existing ATS records missing a rating stay viewable
but must be completed on their next write. Never infer ratings from names/titles.

## Supplier sourcing URLs

Shopee supplier products require a supplier product URL on create, Save and
Publish/republish, including private drafts. Resolve the actual supplier by ID
on the server; do not trust a browser-supplied supplier name or requirement flag.
Keep supplierUrl private to administration, preserve its complete variant query,
and validate bounded HTTPS URLs without credentials or control characters.
Shopee links must use shopee.ph or its subdomains. Never fetch arbitrary sourcing
URLs on the server, infer price/image/specifications from a URL, or fabricate
missing values. Legacy omission remains readable and Unpublish remains allowed;
enforce the requirement at the next write, without bulk backfills. See
docs/ADMIN-CATALOG-MANAGEMENT.md for the full contract.

## Firebase

Use Firebase project `dumaget-me-solar`, shared with `D:/git/solar/solar.dumaget.me`.
The root `.firebaserc` records this selection; it does not connect runtime services.
Do not create a separate Firebase project. The user-authorized local Admin SDK key
is `infra/dumaget-me-solar-firebase-adminsdk-fbsvc-250560e75d.json`; it must remain
Git-ignored and server/tooling-only. Never print its contents, commit it, import it
into Angular, copy it into public assets, or include it in a hosting upload.
Do not change shared Firebase rules or permissions without scope.

## Local server startup

Local Firebase activation is already approved in `docs/AUTH-ACTIVATION.md`.
Start the API from `backend/` with `npm run dev` so its ignored `.env` is loaded.
Before startup, verify that `backend/.env` has `FIREBASE_BACKEND_ENABLED=true`,
`FIREBASE_AUTH_SETUP_APPROVED=true`, project `dumaget-me-solar`, database
`store-dev`, loopback binding, local CORS origins, and an ADC path pointing to the
existing ignored Admin SDK file. Store only its path, never credential contents.
If this local configuration is missing, restore these approved settings in the
ignored `.env`; do not start silently with Firebase disabled. Keep committed
example/default activation flags disabled and do not change cloud configuration.

After startup, verify `/health` returns 200, `/api/v1/catalog/products` returns
200 directly on port 4400 and through the frontend proxy on port 4300, and
unauthenticated `/api/v1/me` returns 401. A successful `/health` alone does not
prove the connected backend works. GET /ready now checks Firestore store-dev,
Auth read access and the dedicated image bucket metadata. It returns 200 only
after all three succeed; otherwise 503 with a safe not-ready response. Checks
are lazy, single-flight, cached for 60 seconds and bounded to a 3-second response.
Disabled defaults never initialize credentials. Never add background polling,
probe writes, account listings or token minting. Read docs/CONNECTED-READINESS.md
for timeout/cost/permission limits; readiness does not prove write authorization.

## Inventory

### Actor identity presentation

Always track actors by immutable user ID for audit, authorization, joins and retry
checks, but display the person's name, never a raw ID, in pages, history dialogs,
toasts and user-facing exports. Store a trusted server-derived name snapshot with
new audit events when available; never accept an actor ID/name from command input
as authority. Resolve legacy names by exact recorded IDs with bounded server-side
lookups, without rewriting immutable history or listing accounts. If no name is
available, show "Name unavailable", never an ID/email fallback. Names are display
metadata, not unique identity or authorization. Apply this to future actor views.

Read docs/INVENTORY-MANAGEMENT.md before stock changes. Physical stock is separate
from supplier availability and catalog Save; unknown is not zero. Never seed sample
counts into live inventory. Stock movements require reasons, observation times,
expected product/balance versions, atomic ledger/balance/receipt writes and retry
protection. Never edit/delete movement history or silently change recorded units.
Inactive locations preserve history; no movement until reactivated. Project/BOM
quantities remain stock-independent; no PO reservations are implied. Counts use
actual quantities with reviewed differences and expected versions, never a stale
automatic rebase. Transfers are one atomic, linked operation across two known,
active pools, not unrelated issue/receipt calls. Thresholds preserve null versus
zero, carry expected product/settings versions and lock units. Stock-status filters
run before visible API pagination within the 50-candidate read budget; an empty
segment with a cursor is not global absence. CSV exports are capped at 50 API
requests and fail rather than silently downloading a partial result.

## Hosting

### Product image lightboxes

Use shared ProductLightboxDirective on native image buttons (and the existing
ProductVisualComponent) for click/keyboard enlargement. Reuse ng-gallery 12,
the main site's renderer, within the shared CDK/KTUI footer-based viewer.
Never make illustrative fallback SVGs clickable, open another browser tab,
roll a custom slider, or introduce writes for viewing photos. Preserve selected
image index, full-size URLs, theme inheritance, focus return, destroy cleanup,
lower-right footer Close and no horizontal scrolling. Read docs/PRODUCT-IMAGES.md
before extending it; library boundary mocks are not vendor/browser integration.

### Product image removal

Delete removed stored pictures only after a successful catalog transaction.
Read docs/PRODUCT-IMAGES.md for the ledger/tombstone and historical-hold contract.
Never delete on form Remove/Cancel or failed Save; never delete a shared/published
or historically held asset. Use only canonical paths in the dedicated image
bucket, metadata validation and generation-matched deletes. Cleanup failures
must not report committed Saves as failures; retain bounded retry work.
Future locked-PO transactions must atomically enroll/touch assets and establish
immutable retention holds before snapshots can reference them.

Product-image storage has an explicitly approved US exception: dedicated
Standard bucket dumaget-me-solar-store-images-dev in us-west1. Read
docs/PRODUCT-IMAGES.md before media changes. Free-tier eligibility is not a
zero-charge guarantee. Product images must accept ordinary clipboard paste
alongside file selection; keep upload authentication and payload limits.
The user explicitly approved public reads, including draft pictures, on this
bucket only. Never put credentials or private documents in this image bucket.

Follow the main site's current deployment strategy: Firebase Hosting, with a
production build and GitHub Actions live deployment from `main` when configured.
Read `docs/INFRASTRUCTURE.md` for the decision, reference files, credential handling,
SPA routing differences, and deployment boundaries. Use a dedicated storefront
Hosting site/target within `dumaget-me-solar`; never overwrite the main site's
Hosting content. The sibling AWS files are historical reference, not this project's
deployment plan. Storefront hosting configuration/scripts/workflow are not implemented
yet; documentation is not authorization to create sites, change DNS, or deploy.
Recheck the main site's configuration when implementing deployment or proposing a
future strategy change; do not automatically migrate providers or copy destinations.
