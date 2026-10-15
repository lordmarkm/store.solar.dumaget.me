# User-facing website plan

## Current priority: project Build Assistant (2026-10-10)

The user chose the category-based project builder as the next customer feature,
ahead of purchase-order implementation. The accepted direction is a compact
component table with Choose/Add another actions, multiple independent store or
free-text rows per category, editable quantities, a compatibility strip, totals
below the table and selected-row review before appending to the project's BOM.
See [the dedicated builder plan](PROJECT-BUILDER-PLAN.md) for the accepted mockup,
workflow, phased tasks, data gaps and acceptance criteria. This is documented
design intent, not an implemented builder or an approved electrical design.

[Plan index](README.md) is the canonical planning entry point. The dated updates
and linked implementation contracts supersede older local-preview/activation-hold
status prose below; historical verification remains intact. PO statuses, locking,
stock commitments and checkout still require their separate policy decisions.

Projects update (2026-10-09): the account-backed Projects foundation and management
extension supersede the historical local-preview-only notes below. My projects
supports API-side name/location search, status/classification/configuration/work-scope
filters and 10-record cursor pages; overview adds Edit details, Archive/Restore and
Duplicate. Archived BOMs are read-only; duplication excludes POs and active selection.
See [account Projects](../docs/ACCOUNT-PROJECTS.md) for ownership, retry/concurrency and
bounded-search continuation limits. Purchasing, favorites and profile/settings
implementation remain separate. No live data migration or cloud deployment is implied.

Catalog update (2026-10-07): shopping now reads only published product projections
from the public API, with paged loading and honest unknown tax/availability/media.
Cart/BOM reference resolution shares this product source and retains missing or
unpublished references as unavailable. Browser-local planning and real-account
project restrictions are unchanged. See [product publication](../docs/PRODUCT-PUBLICATION.md)
for current behavior and verification; older sample-catalog descriptions are historical.

Recorded: 2026-10-06 (Asia/Manila).

Status: phase 1 layout separation is implemented and verified (2026-10-06).
Production build, 30 tests, strict TypeScript checks, and desktop/mobile browser
checks passed. A bounded phase 2 project preview is implemented. Its production
build passed, 46 tests passed in 9 files, both app/spec `tsc --noEmit` checks passed,
and desktop/mobile browser checks passed. Favorites, profile, settings, and the remaining
project workflows are still planned. The subsequent local catalog-to-project and
mixed-BOM slice is implemented and verified; details and limitations follow below. The
user requested two main page types:
sidebar-free shopping pages and personal "My pages," including projects,
favorites, and profile. Every project must have a BOM, and that BOM must support
both store products and free-text entries. Project metadata separates classification,
installation (default Rooftop), system configuration, and work scope.
My projects has a New project CTA opening a shared popup wizard. Exploration-page
Add to project actions offer the active project, another project, or creation
through the same wizard. Only the unlinked guest equipment list can be copied into
a project; copying links it automatically. Project BOM rows start checked, with a
Check all control, and the selection drives PO creation and export. BOM quantities
are a user plan and ignore available SKU stock.
The project BOM remains continuously editable. Each project can have multiple
purchase orders (POs), each with its own status history. Only a PO becomes locked;
complete product snapshots and immutable revisions begin at its locking transition.
Historical preservation applies to locked POs, not the continuously changing BOM.
The final PO statuses and locking threshold remain TBD.
The remaining detailed routes, workflows, and sequencing
below are recommendations, not implemented features or authorization to deploy.
This document is the product-behavior plan; no Stitch prompt, prototype, or canvas
organization work is required. The approved green palette is retained; typography
and nearly square public cards follow the Stitch reference in UI-THEME.md.

## Current baseline

### Latest Google sign-in integration (2026-10-06)

This supersedes the authentication-unavailable frontend notes below. The user
approved enabling shared Firebase Authentication with Google sign-in only.
The storefront's dedicated Firebase web app is registered; the frontend now uses
the real modular Auth SDK, observer-owned restoration, Google popup account
selection, session-only persistence, sign-out, and sanitized busy/error states.
Luna handled the bounded account panel/dialog/header presentation. Public styling
keeps the existing green KTUI tokens, fonts, angular cards and CDK focus behavior.

The user supplied `mark@solar.dumaget.me` and the official Auth-only provisioning
operation completed, but verification returned unexpected subtype
`IDENTITY_PLATFORM` instead of approved `FIREBASE_AUTH`. Google is enabled, but
this is not verified end-to-end Firebase Auth; no login was attempted. Only the
two default Firebase authorized domains remain, and `STOREFRONT_AUTH_ENABLED`
stays false. Safe recovery is pending; see [AUTHENTICATION.md](../docs/AUTHENTICATION.md).
Do not describe Google sign-in as active or working.

Even a successful Firebase session cannot use the synthetic project repository,
including when its UID happens to equal `local-preview`. My pages still fail
closed. Signed-in accounts see their display name, Sign out, and the accurate
explanation that account-scoped project saving is not connected. Disabled Add to
project hints then say **Project saving is not connected yet**; account review
remains available through the header (and the existing guest-list action).
Guests keep **Sign in to add to project**. Catalog cards do not repeat Sign in
or Review account buttons. Pending actions
are neither executed nor cleared on sign-in/sign-out; no local projects, BOMs,
active selection, history or backup are migrated, reassigned, or cleared.

Build and app/spec type checks pass; **99 tests across 17 files** pass, including
mocked SDK configuration, observer restoration, duplicate-popup prevention,
sanitized errors, account change/sign-out, cleanup, real-UID denial, and unchanged
guest/pending data. Live OAuth verification remains pending. Firestore, rules,
Hosting and deployment stay untouched. Dependency audit reports 22 findings,
including one critical; upgrades/remediation need a separate compatibility pass
before deployment. Earlier verification counts below are historical.

### Admin email eligibility policy (frontend baseline; enforcement pending)

The configurable default admin email domain allowlist is `['solar.dumaget.me']`.
Eligibility requires a verified email and an exact, case-insensitive domain match;
suffixes, wildcards, and subdomains do not match. This domain allowlist is separate
from the public OAuth support email, `mark@solar.dumaget.me`.
Resolve the unexpected Auth subtype and verify authorized domains before enabling
the storefront sign-in flag or attempting OAuth.

`core/admin-access-policy.ts` now provides the typed default domain list and pure
eligibility helper. It is currently code-configurable, not a connected settings
screen, and is not wired to navigation or access grants. It may support future
admin-entry visibility but cannot grant access. The authoritative allowlist must
be server controlled, bootstrapped by trusted operators and subsequently editable
only by authorized admins; missing or invalid policy denies access. Backend ID-token
verification, verified-email checks, role/claim enforcement, applicable data rules,
and claim refresh/revocation alignment are future security work. No admin route
gates, Firebase rules, IAM, or shared services have been changed for this policy.
Current admin demo routes remain public read-only fixtures and are not secured.
Do not describe admin access as production-secured until those backend controls
are implemented and verified. See [AUTHENTICATION.md](../docs/AUTHENTICATION.md).
Build, app/spec type checks and 105 tests/18 files pass for this extension,
including six domain-policy tests. No visual UI behavior changed.

### Latest frontend guest-access slice (2026-10-06)

This slice supersedes the earlier unrestricted browser-local preview entry points
and localized `/draft` tooltip adjustment documented below. A shared customer-theme
sign-in dialog and sidebar-free `/sign-in` page now explain that authentication is
not connected. Header Sign in opens it; catalog cards retain disabled Add to project
with the exact **Sign in to add to project** hover/keyboard tooltip. The later
catalog cleanup (2026-10-06) removes per-item Sign in/Review account CTAs;
account access stays in the header without selecting or queuing a product.
On a populated unlinked `/draft`, Sign in to continue retains the all-row list ID
and current review fingerprint. Linked/empty list copy restrictions remain separate.

All `/my/**` direct URLs, including nested project BOM and placeholder pages, are
guarded before rendering and redirect with a validated local return URL to
`/sign-in`. No customer sidebar or local project titles are shown to guests.
Guest linked-list/history views also hide project names and links. Guests can still
browse, view details, edit/export equipment lists, and start/reopen list history.
No project or receipt is written by opening/canceling sign-in. Catalog filters
remain in place while the dialog opens/closes; filters are not persisted across
page reloads by this slice.

`CustomerAccessService` uses a provider-owned session signal, never a browser
storage login flag. Its default provider is permanently signed out. The only
current project repository has synthetic `local-preview` ownership, so real account
IDs fail closed instead of gaining access to old local data. Test providers alone
unlock the retained preview code. There is no public demo-login switch. Existing
local projects, BOMs, active selection, guest history, and legacy backup are preserved,
not migrated or reassigned to an account. Project entry/mutation handlers check the
same gate; open project dialogs close on loss of access. The customer shell hides
and redirects on session revocation.

`PendingCustomerAction` holds a route, a product identity/quantity, or an equipment
list identity/fingerprint. It is stored separately in sessionStorage under
`solar.sign-in.pending.v1`, with schema/shape/size checks, allowed-route validation,
and a 24-hour restore limit. Invalid, expired, or future-dated stored requests are
ignored. No credentials or authenticated state are stored there. Storage failure
keeps the request in memory and explains its visit-only retention. Repeated dialog
requests open only one dialog; cancellation retains intent without performing it.
Navigation closes the sign-in dialog. My-page navigation does not overwrite a
retained item/list request. No automatic addition or action resumption is implemented.

Actual authentication/provider choice, registration, logout/account switching,
post-login review/resumption, account-scoped project persistence and backend rules
remain pending. Before a real session can use projects, replace the synthetic
repository and access boundary together. Frontend guards are not data security;
admin demo routes remain unchanged and have no production authorization. No Firebase
service, dependency, shared rule, hosting setting, credential, or deployment was changed.

Verification: production build and app/spec TypeScript checks passed; **88 tests
across 15 files** passed. New coverage checks guarded direct/nested URLs, safe
return URLs, default/real-ID fail-closed behavior, ignored fabricated browser auth,
pending product/list retention and corrupt/expired/future/invalid stored requests,
memory fallback, single-dialog/cancel behavior, guest-hidden linked names/history,
retained item intent across My navigation, and blocked wizard confirmation on
session loss. Earlier local workflow tests use explicit test-only preview sessions.

Browser checks confirmed the shared header/item dialog, retained product/quantity,
catalog filter preservation on cancel, disabled-action keyboard tooltip, Tab
containment, Escape/return focus, guarded My and direct project-BOM URLs, guest-safe
linked-list history, and the unchanged 32-panel current list. Desktop/mobile light
and dark dialogs and the sidebar-free mobile gate render without horizontal
overflow. Fonts/glyphs load, public corners remain 2px, admin restores blue
`#1379F0`, 12px cards and system fonts, and public styling returns afterward.
Console errors were absent. Viewport overrides 1440x900/390x844 produced CSS widths
1309/355 at existing zoom; default viewport and original light preference were
restored. Existing projects/history were neither deleted nor migrated. A single
panel request remains as a session-local sign-in intent; it was not added anywhere.
Actual login/resumption and backend enforcement cannot be verified while disconnected.

Frontend TypeScript contracts now cover the planned projects, mixed BOMs, guest
lists/link receipts, customer records, and per-PO history. The project preview uses
the project contract in browser-local storage under `solar.projects.preview.v1`, with
a synthetic local-preview owner, not real account ownership. See
[FRONTEND-MODELS.md](../docs/FRONTEND-MODELS.md) for implemented types and boundaries.
These contracts alone do not implement persistence or the transactional flows below.

The Angular application lives in `solar-ui`. `/catalog` uses sidebar-free storefront
navigation, and `/draft` uses the same shopping shell. `/bom` redirects to `/draft`
while retaining `solar.bom.v1`. Customer My pages use a separate green shell. The
browser-local project preview at `/my/projects` (the `/my` default) supports
list/search/cards, project creation from its New project wizard entry, explicit
active-project set/clear, and a project overview. It uses a synthetic owner, not a
real account. `/my/favorites`, `/my/profile`, and `/my/settings` remain local-preview
placeholders. `/admin/inventory` and
`/admin/suppliers` remain in the blue WorkspaceShell and expose Continue shopping.
There are no customer accounts or favorites yet. Project preview data is local to
the browser and is not account-owned.
Prices, stock, supplier terms, and specifications are illustrative fixtures.
The guest draft stores product IDs and quantities under the retained
`solar.bom.v1` key. It accepts positive whole quantities independent of stock,
including when restoring saved rows; missing products remain visible as unavailable
rows with a removal action. It does not create snapshot history. Catalog guests use
the Add to Cart CTA. Customer navigation has no admin links or quotation
labels. `/` continues to redirect to `/catalog`.
Purchase orders, their status histories, locking, and historical product
preservation are not implemented.

The implementation separates customer navigation from administration while
retaining positive whole-number quantity validation, tier pricing, VAT breakdown,
exports, and accessible interaction patterns. Only the bounded project preview
currently stores project data locally; no account, favorite, or profile data is
present. Preserve the guest draft during migration.

## Two customer page types

Current customer terminology: the guest equipment list is presented as **Cart**,
with **Add to Cart** as the catalog action and a standard KeenIcons cart icon.
This naming change does not add checkout or change the browser-local data model,
storage keys, `/draft` URL, quantity/price calculations, CSV export, or one-time
copy/link semantics. Project BOMs remain separate from the Cart. Older implementation
notes referring to equipment lists describe the same retained Cart data.

### Shopping shell: explore equipment

Use a storefront header and footer, with logo, search, equipment categories,
favorites (signed-in only), the Cart or the customer's active project,
and an account menu. There must be no persistent navigation or filter sidebar. Put
filters above the product grid; use an expandable filter panel on mobile. Remove the
existing admin links from the catalog header and footer, and keep administration
links out of customer navigation. Use Cart labels for guest shopping actions,
not quotation labels.

| Page | Proposed route | Purpose |
| --- | --- | --- |
| Home | `/` | Store introduction, categories, and featured equipment; `/` keeps redirecting to `/catalog` until Home ships |
| Catalog | `/catalog` | Search, category/brand filters, sorting, and product discovery |
| Category | `/catalog/:category` | Focused browsing for panels, inverters, batteries, mounting, or protection |
| Product details | `/products/:slug` | Images, specifications, price tiers, availability, and related equipment |
| Cart | `/draft` | Temporary store-product list without free-text lines or row checkboxes; after sign-in, copy the whole Cart into a project once |
| Sign in / registration | `/sign-in`, `/register` | Access personal saved work without a sidebar |

Product details should be directly linkable. Keep the existing details dialog as
an optional quick view. Customer product actions are Add to project, Favorite, and
View details, with the principal action visually distinct from secondary actions.
Guests can browse and build a Cart without signing in; their
actions are Add to Cart and View details. Favorites are not available to
guests: hide the Favorite action rather than storing guest favorites.

### Customer shell: My pages

Recommended layout: a dedicated customer sidebar on desktop and a navigation
drawer on mobile. This must not reuse the combined customer/admin navigation.
Keep Continue shopping visible. `/my` should open My projects; a separate dashboard
is not needed for the first release.

Sidebar order: My projects, Favorites, Profile, and Account settings. A My purchase
orders entry is added with the ordering integration; each project's overview then
lists its own POs. There is no separate quotation record or page: quotation review
is the pre-lock stage of a PO (see the PO lifecycle). Do not advertise disconnected
order features as working services.

| Page | Proposed route | Purpose |
| --- | --- | --- |
| My projects | `/my/projects` | New project CTA and popup wizard; find, reopen, duplicate, archive, and restore projects |
| Project overview | `/my/projects/:projectId` | Project information, editable BOM summary, notes, and associated PO statuses when connected |
| Project BOM | `/my/projects/:projectId/bom` | Manage mixed BOM lines; select lines for PO creation and export; review estimates |
| Favorites | `/my/favorites` | Reusable saved equipment, filters, and Add to project |
| My purchase orders | `/my/purchase-orders` | Cross-project PO list with independent statuses; later integration |
| Purchase order details | `/my/purchase-orders/:purchaseOrderId` | Project association, ordered lines, review (quotation) stage, status history, and locked revision details; later integration |
| Profile | `/my/profile` | Contact information, company, and optional contractor details |
| Account settings | `/my/settings` | Preferences and account/security controls |

My pages are account-owned in the connected version. During a frontend prototype,
any browser-only storage must be clearly labeled as local/demo data, not a signed-in
account or cross-device persistence.

## Projects and equipment workflow

A project represents an installation or purchasing job, not an order. The initial
model has a name, classification, installation type, system configuration, work
scope, optional location/description/notes, draft or archived status, and
created/updated timestamps. Every project owns one editable BOM from creation,
even when it is empty. BOMs are independent between projects and can mix store
products with free-text entries; free-text entries are part of the MVP, not a later
integration. The BOM is the changing installation plan, not the purchase commitment.
Creating or locking a PO never locks the project's BOM. A project may have zero,
one, or many POs for separate purchases against its requirements. Estimated totals
must distinguish catalog pricing from user estimates. BOM quantities record what
the job needs; current SKU stock never limits or reduces them and is shown for
information only.
Ownership must be enforced by the backend when persistence is connected.

Duplicate creates a new Draft project named "Copy of <name>" with the same metadata
and copies of the BOM lines (new line IDs). It does not copy POs, status history,
or the active-project selection. Archived projects are read-only and cannot receive
additions; Restore returns them to Draft without making them active. Archiving is
blocked, with an explanation, while any of the project's POs is not in a final status.

### Project classifications and attributes

Keep the following as separate project fields rather than combining their values
in a single dropdown. Classification describes the site's primary use;
installation describes how equipment is mounted; configuration describes the
system; work scope describes the job. These fields are independent of the project's
draft/archived lifecycle status and do not imply engineering approval.

| Field | Options | Default/selection behavior |
| --- | --- | --- |
| Classification | Residential, Commercial, Industrial, Agricultural, Institutional / Public facilities, Other | Required explicit selection; no default specified |
| Installation | Rooftop, Ground-mounted, Carport, Other | **Rooftop by default for new projects**, editable by the user |
| System configuration | Grid-tied, Hybrid, Off-grid, Undecided | No default specified; Undecided is a valid explicit choice |
| Work scope | New installation, Expansion, Retrofit, Maintenance | No default specified; ask the user to select |

Residential, Commercial, and Other are the original required classification
buckets. Industrial, Agricultural, and Institutional / Public facilities are the
recommended initial extensions from the classification discussion. Utility-scale
remains a possible future bucket, not part of the initial recommended set.
Allow an optional description when classification or installation is Other.

Examples of classification: houses/apartments are Residential; shops/offices/hotels
are Commercial; factories are Industrial; farms/irrigation are Agricultural;
schools/hospitals/government or community facilities are Institutional / Public
facilities. For mixed-use sites, select the primary use and describe the rest in
project notes.

Example: Agricultural + Ground-mounted + Off-grid + New installation. A residential
project can instead use Rooftop + Hybrid + Expansion; changing one field must not
silently change the others or alter the BOM.

Show these fields in project creation/editing and the project overview. Persist
them with the project; keep them intact when duplicating or archiving it. Apply
the Rooftop default only when creating a new project, not when reopening an existing
project with an explicit installation choice. There are no earlier project records
to migrate.

### Shared New project wizard

The My projects page must have a clearly labeled **New project** primary CTA,
including in its empty state. It opens a popup titled **New project wizard**,
not a separate creation page. Reuse this same wizard when users choose Create
new project from an item's Add to project flow on catalog/category/product
exploration pages, or from the guest equipment list's Add to project flow after sign-in.

The wizard collects project name, classification, installation, configuration,
work scope, and optional location/description/notes. Installation starts as
Rooftop, while the other selections follow the defaults/selection rules above.
Suggested step structure:

1. Project details: name, classification, and optional location/description.
2. System and work: installation, system configuration, work scope, and optional notes.
3. Review and create: confirm entered parameters and any pending item(s). From
   exploration, show the selected product and quantity. From the guest list, list
   all of its rows with quantities and units, and state that the list becomes
   linked to the new project.

Back/Next navigation must retain entries and show validation beside affected
fields. Final confirmation is Create project when opened from My projects,
Create project and add item when opened with a pending product, or Create project
and link list when opened from the guest list. Opening the wizard or navigating
its steps must not persist a project or add an item.

Successful creation always initializes the project's own BOM. From My projects,
it starts empty; from an item, it contains that selected item and quantity; from
the guest list, it contains all list rows. Recommended completion behavior: open
the new project overview from My projects; from exploration or the guest list,
remain on the originating page and show confirmation with a View project/BOM link.

#### Initial My projects preview slice (historical baseline)

The initial browser-local prototype supported search by name, location, and category,
project cards, and a project overview at `/my/projects/:projectId`. The shared
three-step wizard was launched from My projects only. It requires a name,
classification, system configuration, and work scope; installation starts at Rooftop,
with Ground-mounted, Carport, and Other available as selections. Optional fields are Other details,
location, description, and notes. Back retains entered values; cancel and step
navigation make no writes. Final confirmation persists the project with an empty
owned BOM, then opens its overview. Active selection is explicitly set or cleared,
is stored alongside the projects in the local envelope, and is not changed by project creation. Customer navigation
displays the active local project.

Storage uses the dedicated `solar.projects.preview.v1` key and a synthetic
`local-preview` owner. This is not real account ownership or backend persistence.
Malformed or foreign-owner local data is protected from overwrite. Failed writes
publish no project and permit an input-retaining retry. A basic stale-tab read
comparison rejects known conflicts; it is not a server transaction. The preview does
not implement archiving, duplication, metadata editing, BOM item editing, product
addition, guest-list linking, authentication, backend persistence, or purchase orders.
The existing `solar.bom.v1` guest equipment list remains unaffected.

### Add to project and active project

#### Historical local implementation (before guest gates)

Catalog cards expose Add to project alongside the existing guest-list action.
The chooser displays the product and editable quantity, the named active project
when eligible, another explicitly selected draft project, or Create new project.
It swaps to the same three-step wizard within one CDK dialog, retains the pending
product/quantity through review, and confirms with Create project and add item.
Successful catalog additions stay on the catalog with a destination confirmation
and View project BOM link. No addition or creation silently changes active state.

Project creation and its initial store line use one local-envelope write. Stable
request IDs prevent duplicates on retry; new independent additions of the same
product intentionally create separate lines. Confirmation validates the current
fixture product/unit/variant and editable destination, without stock caps. Storage
failure publishes no partial write, preserves modal inputs, and permits retry.
The existing malformed/foreign/stale-tab protections remain; these are prototype
safeguards, not backend transactions or account authorization.

The editable BOM route is `/my/projects/:projectId/bom`, linked from its overview.
It supports store-product and unpriced free-text rows, description/unit/notes,
free-text edits, positive safe whole quantity edits, removal confirmation and Undo
of the last removal until another removal or leaving the page. Archived records
are read-only. Missing catalog references remain visible/unpriced with their saved
identities and quantities. Current fixture per-line store tiers are illustrative;
prices are not snapshotted, and unknown/uncalculable amounts are not zero costs.
Manual-estimate entry and tax policy remain pending; existing manual estimates
can be rendered separately and are preserved on text edits.

Rows start checked on page entry. Check all supports partial/none/all states;
explicit deselection survives dialogs and ordinary rerenders, and newly added
rows start checked. Selection is transient and reinitializes on a fresh page visit.
CSV export uses only selected rows, preserves line IDs/types/descriptions/units/
notes/pricing provenance, keeps unknown amounts blank, and protects spreadsheet
formula prefixes. Export is disabled and explained when no rows are selected.
No project-BOM Add to project, PO creation, snapshots, revisions, backend calls,
or account workflows were added. Guest-list linking/history has a subsequent local
implementation described in the next section.

Catalog/mixed-BOM verification, 2026-10-06: production build, 62 tests in 11 files, and app/spec
TypeScript checks pass. Browser checks confirmed catalog wizard item retention,
one-dialog focus after swapping, successful initial-item creation, existing-project
addition with separate repeated product lines, unchanged active project, mixed
free-text editing, above-stock quantity reload, partial/none/all selection,
disabled export explanation, removal cancellation, mobile editor scrolling/Tab/
Escape/return focus, font/icon loading, 2px public cards, light/dark rendering,
admin theme restoration, and a clean console. Viewport overrides 1440x900/390x844
used actual CSS widths 1309/355 under user zoom, then were reset; light preference
was restored. `Local preview - Mixed BOM` remains as local sample data. Removal/Undo,
write failure/retry, missing references, archived guards, and selected-only CSV
payloads also have automated coverage. The in-app download event timed out, so
actual CSV file delivery in a regular browser remains unverified.

The rules below describe the full intended connected flow; local guest linking is
described separately below and account-backed behavior remains deferred.

Clicking Add to project on an item or on the guest equipment list (after sign-in)
opens a shared project-destination popup or popover. Keep the item's identity and
quantity, or the guest list's rows and their count/quantities, visible. Each
addition creates new destination BOM lines; an existing line for the same product
stays a separate line and is not merged or changed. Offer three choices:

| Choice | Behavior |
| --- | --- |
| Add to active project | Show the active project's name and explicitly add to its BOM after confirmation |
| Choose a different project | Select an eligible existing project and confirm addition to that project's BOM |
| Create new project | Open the shared New project wizard with the selected item(s) and quantities carried forward |

An active project is an explicit customer selection, not an arbitrary first or
most-recent project. Display it in customer navigation or the destination popup
and provide a way to change it. Only an owned, editable project may be targeted.
Archived projects must not receive additions. If there is no eligible active
project, omit/disable that choice with an explanation and offer the other two.
If no projects exist, make Create new project the clear next action.

Choosing another project for an item or batch addition must not silently change the active
project; provide an explicit Make active choice if that behavior is offered.
Likewise, creating a project must not silently change the active selection.
Keep active-project state scoped to the current customer and clear inaccessible
selections on account change, archiving, or loss of permission.

Canceling project selection or the wizard adds nothing and creates no project.
Returning from a canceled wizard can restore the destination chooser and pending
item(s)/quantities, without forcing the user to find products again.
Preserve form
inputs on recoverable errors, prevent repeat submissions, and do not show success
until the intended write completes. At confirmation, revalidate that products still
exist and that the destination is accessible; do not check SKU stock. Project creation with its initial BOM/item(s)
and batch addition should be atomic or safely retryable so failures do not produce
orphan projects, missing items, partial unreported copies, or duplicate additions.

Use one accessible dialog flow rather than stacked interactive dialogs. Provide
a visible title, labeled controls, keyboard focus management, accessible errors,
Cancel/close behavior, and focus restoration to the invoking CTA. Keep the green
theme and responsive spacing on desktop/mobile. BOM additions are not limited by
SKU stock for either line type.

The three-way project flow applies to signed-in customers. Guests retain the
temporary equipment-list path described below; do not expose private project lists.
If sign-in is needed to create/save an account-owned project, preserve pending
item(s), the guest list, and return context without claiming a local draft is a
cloud-saved project.

### Guest list copying and linking

#### Historical browser-local implementation (before guest gates, 2026-10-06)

`/draft` now demonstrates the all-row destination chooser and shared wizard under
an explicit no-sign-in/local-preview label. Active/existing/new destinations are
available; copying never changes active selection. The project batch and one-time
copy receipt/link are saved together, including project creation with its initial
batch. Failed storage, empty/changed list reviews, unavailable product/unit/variant
references, or an archived/inaccessible local destination copy nothing. Missing
rows stay visible in the source; resolve or explicitly remove them and review again.
Stable request IDs allow identical retry without duplication, and linked lists
reject any new copy request. Guests have no row checkboxes or free-text entries.

Linked lists display a project link only for a matching accessible synthetic
local-preview owner; foreign receipt owners/missing projects have a generic label
and stay non-copyable. Later edits never sync. Start new equipment list confirms
an empty/unlinked ID, retains previous contents and links, and history reopens
lists without resetting their receipts. Cancel and failed new/reopen writes leave
current identity/history unchanged. No delete-history operation is implemented.

Guest list/history and projects share the schema-1 `solar.projects.preview.v1`
envelope through an optional `guestHistory` field so copy/link are one local write.
Existing project envelopes remain readable; legacy `solar.bom.v1` contents are
adapted lazily without writing until the first successful transaction. The raw
legacy key is retained untouched as a recovery backup, not the active list store
after migration. Valid above-stock and unavailable legacy rows are retained;
malformed legacy/history data is preserved and editing blocked rather than silently
reset. Detected stale envelope/legacy-migration conflicts reject the write.
Read comparisons are basic conflict safeguards, not atomic concurrent-tab locks.

Build, all 77 tests in 13 files, and app/spec type checks pass. Desktop/mobile
browser checks cover shared wizard all-row review, one-time linking, unchanged
active project, editable source independent of project quantity, cancel/confirm
new-list creation, retained history, reopen/reload with Add to project disabled,
responsive wrapping, scrollable dialogs, Tab containment and Escape focus return,
fonts/icons/public geometry, light/dark and administration isolation. Overrides
1440x900/390x844 yielded CSS widths 1309/355 at existing zoom; original light/default
viewport restored. The original 32-panel list remains current, linked to the new
sample `Local preview - Guest list link`; an empty unlinked list is retained in
history. Temporary quantity edits were restored to 32. CSV file delivery remains
unverified. No account, Firebase, purchasing, or deployment work is included.

The following rules remain the intended connected behavior. Local demonstration
does not satisfy real sign-in, account switching, or backend enforcement.

Subsequent guest CTA adjustment: `/draft` Add to project stays disabled while
authentication is unconnected and exposes the exact tooltip "Sign in to add to
project" on hover and keyboard focus. A focusable shared-tooltip wrapper supports
the native disabled button; the same reason is visible and accessibly described.
Empty/linked-list explanations remain separate. Existing local copy helpers/tests
are prototype-only, not authorization. The later frontend guest-access slice above
also gates catalog and My-page entry points. Real authentication and backend
enforcement remain pending.

Only a BOM that is not yet linked to a project can be copied, and the guest
equipment list is the only such BOM. Project BOMs are always linked to their own
project and have no Add to project action, so a BOM is never copied into itself or
into another project.

- The guest list holds store products only; it has no free-text lines or row
  checkboxes, and copying always includes all of its rows.
- Add to project on the guest list requires sign-in, then uses the shared
  destination chooser and New project wizard. An empty list cannot be copied.
- On success, each guest row is added exactly once to the destination BOM as a new
  separate line with its quantity, and the guest list is automatically linked to
  that project.
- A linked guest list stays viewable and editable, shows Linked to <project> with a
  link, and disables Add to project with an explanation. Later edits never sync to
  the project.
- Offer **Start new equipment list** on a linked list. Explain that this starts an
  empty, unlinked list, not a second copy or synchronization of the linked list.
  On confirmation, retain the previous list, its latest local edits, and its link
  in local list history; make a fresh list with a new ID the current list. Cancel
  changes nothing. Previous lists remain reopenable and editable, but reopening a
  linked list never re-enables Add to project. To purchase later additions, add
  products to the new list or use exploration's item-level Add to project.
- Scope each link to its list ID and customer identity. Sign-out/account switching
  must not reveal another customer's project name or let a different account
  re-copy a linked list. Local list history is planning data, not ProductSnapshots,
  immutable BOM revisions, or cross-device persistence. No existing list is erased
  or implicitly unlinked by starting a new one.
- The copy and the link are recorded together: cancel or failure copies nothing and
  leaves the list unlinked and unchanged, and retries never duplicate lines.
  Connected copying must enforce this with an authoritative list-ID/copy receipt
  and an idempotent backend write, not merely a disabled browser button.

### Project BOM line selection

Project BOM row checkboxes select the lines used for PO creation (when connected)
and export.

- Every project BOM row has a labeled checkbox, including store-product and
  free-text rows.
- All rows are checked when the BOM is first presented. Do not reset a user's
  explicit deselection on ordinary rerenders or when returning from a popup.
- Include a Check all checkbox in the table header (or equivalent mobile list
  header). It checks/unchecks all rows and is indeterminate for partial selection.
- Show a selection summary, such as "3 of 5 items selected." This is a count of
  selected rows, not the sum of their quantities.
- Disable Create PO and Export when nothing is selected, and explain that at least
  one BOM line must be selected. An empty BOM has no enabled selection actions.
- Retain selection through dialogs and error recovery. Never recheck excluded rows
  automatically or include them in a PO or export.

Implementation checks should cover initial all-checked state, partial selection
and indeterminate Check all, none selected, selecting all again, mixed line types,
and POs/exports containing only the selected lines.

### BOM line types

| Type | Content | Pricing and availability |
| --- | --- | --- |
| Store product | Stable source product reference and editable quantity, not limited by SKU stock; live catalog details, with unavailable references flagged | Estimates use current catalog data; stock is informational; immutable snapshots are created only when a PO locks |
| Free-text entry | User-entered item/description, quantity, unit, and optional notes; no catalog product reference required | No implied store price, stock, supplier, or availability |

Store-product and free-text lines must have an explicit type and stable line ID.
Users can add, edit, and remove free-text entries directly in the project BOM
without creating inventory records. These entries can represent items sourced
elsewhere or requirements not listed in the store. Adding a free-text entry must
not publish a product or create a supplier quotation/order automatically.

Recommended estimate behavior: allow an optional manual unit-cost estimate for
free-text lines, clearly labeled as user-entered rather than a store offer. An
unpriced line is unknown, not zero; show how many lines are unpriced and label
the priced subtotal as incomplete. Separate store-priced totals from manual
estimates and do not automatically apply store discounts, stock limits, or store
VAT assumptions to free-text entries. Manual-estimate tax treatment remains to
be defined before implementation.

Exports and PO records must preserve both line types, descriptions, quantities,
units, and pricing provenance. Free-text entries in a PO under review are
requirements needing review, not confirmed store-supplied items. If a referenced
store product becomes unavailable or is removed from the catalog, preserve its BOM line
and flag it for review rather than silently dropping it or changing its type.

### Purchase orders are separate commitments

Confirmed design: one Project has one continuously editable BOM and zero or more
PurchaseOrders. Each PO belongs to that project but owns its own items, quantities,
prices, lifecycle, and status history. No project-wide order status is inferred
from a single PO. Project Draft/Archived state remains separate from PO status.

Creating a PO copies the lines checked in the project BOM and chosen quantities; it does not move
or consume the source rows. A PO may purchase only part of the BOM or some of a
line's required quantity. Store the source BOM-item association for tracking, but
do not use that reference to render a locked order's historical details. Deleting
or changing a source BOM line must not cascade into associated PO records.

Before locking, a draft PO has editable provisional lines. Editing the BOM never
automatically synchronizes a PO, even while the PO is a draft. A user must explicitly
change or refresh that PO, and changes invalidate any pending commercial approval
and require re-review. Ordinary draft saves, Add to project actions, guest-list
copies, and pre-lock PO submission or review do not create ProductSnapshots or
immutable PO revisions. SKU stock applies to PO quantities during review and
locking, not to BOM requirements.

#### Duplicate products: availability and quantity tiers

Independent BOM/PO line IDs preserve source-line tracking; they are not separate
stock pools. During PO review, locking, and approved amendments, the server must
sum demand across all PO lines drawing on the same sellable product/variant and
inventory pool. Use stable product/variant identifiers and compatible stock units,
not product names or editable SKU labels. Different prices or source BOM lines do
not exempt demand from aggregation. Do not combine incompatible variants/units or
invent unit conversions. Free-text lines have no automatic store-stock validation.

For example, two PO lines of 6 identical panels demand 12 panels. With 10 available,
the review must flag a shortage of 2 and locking must fail until quantities or an
explicitly supported fulfillment arrangement are agreed. Neither BOM line is
clamped, removed, or merged. Recheck current available-to-promise stock atomically
at commitment time; row-by-row checks against the same stock value are insufficient.
Reservation/backorder rules remain TBD and are not implied by saving/submitting a PO.
At amendment review, account for this PO's existing commitments/holds and validate
the revised net demand; do not count its original reserved quantity twice or
release it before an amendment succeeds. Concurrent commitments from other POs
must be accounted for by the server's availability/commitment policy.

Proposed volume-pricing policy: sum compatible quantities within this PO for the
same product/variant, unit, currency, and current pricing offer/tier schedule, then
apply that group's eligible unit tier price to each constituent line. Preserve
separate lines and their source associations. Do not pool unrelated POs/projects,
different offers, manual prices, or free-text estimates. If terms differ, keep
pricing groups separate while still aggregating demand for the same stock pool.
Record the quantity basis, tier/offer identity, and agreed per-line prices at lock;
later catalog changes do not reprice history. Confirm this pricing policy before
transactional implementation; stock aggregation is required regardless of tier policy.

At the configured locking transition, validate ownership, items, availability,
agreed quantities/prices, and terms; then atomically create the first immutable
PO revision with complete product snapshots and record the PO's new status.
Failed validation or snapshot capture must not leave a status claiming the PO
is locked without its historical record. Repeated requests must not duplicate
orders, revisions, or status events. Backend access controls enforce the lock.

After locking, item/quantity/price/term changes require a controlled amendment
or replacement PO, not an edit to the locked record. A confirmed amendment creates
a new immutable PurchaseOrderRevision while retaining earlier revisions; a
replacement remains explicitly linked to its predecessor. Status progression
alone records events and does not create a new commercial-content revision.
The BOM remains editable throughout, including when any associated PO is locked
or completed. Cancelling a PO preserves its revisions and status history.

### Suggested PO lifecycle (not finalized)

The following names and the Confirmed lock point are proposals. Final status
names, allowed transitions, roles, and the exact locking threshold remain TBD.
Use an explicit allowed-transition policy, not alphabetical ordering or a numeric
"past status" comparison. Quotation review is the pre-lock stage of the PO, not a
separate record: the UI may label Submitted through Awaiting customer confirmation
as a quotation request, but it is the same PO and status history.

| Proposed status | Meaning / content behavior |
| --- | --- |
| Draft | Editable provisional PO; no immutable snapshot/revision |
| Submitted | Awaiting review; no snapshot; changes require renewed review |
| Under review | Validate products, quantities, current availability, prices, and terms |
| Awaiting customer confirmation | Customer considers the reviewed proposal; changes invalidate pending approval |
| Confirmed | Recommended lock transition: customer accepts reviewed terms; create revision 1 and product snapshots |
| Preparing | Fulfillment underway; commercial content remains locked |
| Dispatched | Shipment underway; commercial content remains locked |
| Completed | Fulfillment completed according to the final business rules; locked history remains available |
| Cancelled | Permitted cancellation branch; keep any already-created locked revisions and status events |

If cancellation occurs before locking, there is no locked revision to create
retroactively. Cancelling after locking never unlocks or deletes the historical
record. Review rejection/change-request paths and cancellation eligibility need
definition before implementation. Returns after delivery are not silently treated
as cancellations. Keep payment status separate; suggested payment states are
Unpaid, Partially paid, Paid, and Refunded, with exact payment/refund rules TBD.
Partial deliveries and fulfillment progress may need separate tracking from the
PO's top-level status. No PO status automatically reserves stock or changes payments
until the relevant backend workflows are explicitly designed and implemented.

### Locked PO history and complete product snapshots

This supersedes the earlier snapshot-on-add and BOMRevision approach. ProductSnapshot
and immutable revision history begin only when a PO locks. BOMRevision is not
needed for order locking; any future BOM edit audit would be a separate feature.
Live BOMs and unlocked POs use current/provisional data and cannot guarantee complete
preservation of earlier catalog details after modification/deletion. Missing live
product references must be flagged rather than silently dropped or fabricated.

Locked PO details and exports must render without a successful lookup of the current
catalog product or project BOM. At locking, preserve all customer-visible product
fields, not just a name and price: SKU, name, brand, category, full description,
technical specifications, unit, variants/options, supplier display details, relevant
price tiers/pricing basis and currency, and images/datasheets/supporting documents
available at lock time. Capture the agreed line prices, quantities, notes, totals,
tax/discount basis, and order terms in the PO revision. Free-text lines retain their
complete descriptions, quantities, units, notes, and any explicitly agreed pricing;
they do not automatically become confirmed store products.

Record lock/capture timestamp, actor, revision and snapshot schema version, and
source product/version identifier where available. Historical availability/depot
information is as-of information, not a current-stock guarantee. Do not expose
private supplier costs, credentials, or internal-only administrative fields.

Retain immutable/versioned image/document assets or copies from locking onward.
Mutable URLs, deleted originals, and expiring download URLs cannot guarantee history.
Product deletion must not cascade into locked PO snapshots/revisions or their
retained assets. Access and retention policies must protect these customer records.

Proposed model additions (names/storage layout to be finalized):

| Model | Role |
| --- | --- |
| PurchaseOrder | Project/owner reference, order number, current status, effective revision reference, totals, timestamps, and separate payment/fulfillment tracking when connected |
| PurchaseOrderItem | PO-owned line type, source BOM-item/product reference where applicable, quantity, unit, provisional/agreed pricing, and notes; no automatic BOM synchronization |
| ProductSnapshot | Complete immutable customer-visible product details and durable asset references captured at PO locking, independent of the live catalog |
| PurchaseOrderRevision | Immutable locked PO content: item details/snapshots, free-text content, quantities, prices, totals, terms, revision number, actor, and timestamp; created at locking or approved amendment |
| PurchaseOrderStatusEvent | PO identity, from/to status, timestamp, actor, optional reason, and associated revision where relevant; one PO's history is independent of others |

Historical PO viewing must not reprice from new tiers, clamp quantities to today's
stock, or omit deleted products. Current-product comparisons are separate and can
show Product changed or No longer in catalog without blocking historical details.
Copying a locked PO into a new draft is a new planning action, not transfer of its
lock or acceptance; current-offer checks remain necessary. The original locked PO
and its product snapshots remain unchanged.

There are no earlier orders to migrate. Capture complete details at every lock
transition and never fabricate missing fields.

### Required, ordered, delivered, and cancelled quantities

Recommended project reporting (detailed accounting rules remain TBD): show the
current BOM requirement alongside effective ordered, delivered, and cancelled
quantities across its associated POs. Maintain stable source-line associations;
matching only by product name is not sufficient, especially for free-text items
or changed units. Show removed/unmatched source-line purchases separately rather
than erasing their orders or assigning them to a different requirement silently.

Example: required 20 panels; two locked POs order 8 and 6. Show Required: 20,
Ordered: 14, Remaining to order: 6. Delivered is a separate fulfillment quantity,
not another deduction from remaining-to-order: delivered units already belong to
the ordered total. Ordered counts only POs that have passed the lock transition,
using each PO's effective revision and excluding approved cancellations. POs that
have not locked show as Proposed, whatever their final status names.

Use the effective approved PO revision for reporting; do not sum old and amended
versions as separate purchases. Account for approved cancellations without changing
historical records. Exact cancellation/return/replacement calculations need definition.
When the BOM is reduced below committed quantities, display an over-ordered variance
rather than reducing PO quantities automatically. Changes to one PO's status or
amendment must never mutate another PO or the live BOM.

Favorites are reusable inspiration; projects are actionable equipment lists.
Use the shared destination chooser and New project wizard above when adding
equipment. Confirm the destination by name; do not silently add to another job.

The primary journey is:

Browse -> favorite or add equipment -> create/select project -> refine BOM ->
export or submit a PO for review when connected.

Guests use the temporary equipment list; copying it follows the guest list rules
above and never overwrites existing project lines. Redirect the current `/bom` URL
to `/draft` without losing `solar.bom.v1` data.

The exact PO review/resubmission workflow remains to be defined. Changes to a
reviewed proposal require explicit re-review, not silent synchronization. A draft,
PO submission, or export does not reserve stock or place an order. Customer POs here are distinct from the later inbound
supplier-purchasing workflow.

## Shared theme and interaction rules

Both customer shells use the approved Solar Wholesale Engine theme in
[UI-THEME.md](../UI-THEME.md): forest green, lime accents, derived mint surfaces,
Space Grotesk headings/labels/actions/prices, DM Sans body text, and nearly square
2px public cards with subtle shadows, following the Stitch catalog. Administration retains
Provia blue and a separate shell under `/admin/**`.

Continue using KTUI components and the shared
[solar-ui-actions skill](../.agents/skills/solar-ui-actions/SKILL.md). Keep verified
KeenIcons, reusable primary/secondary actions, keyboard/hover hints, disabled-action
explanations, and responsive wrapping. Do not replace the icon system with Stitch's
raw icon names. Route appearance must also reach dialogs, tooltips, and toasts.

## Delivery phases

1. **Completed and verified, 2026-10-06.**
   Separate the layouts. Extract the storefront header/footer into a shopping shell;
   add the green customer shell; isolate blue administration. Remove admin links and
   quotation labels from customer pages, redirect `/bom` to `/draft`, and keep `/`
   redirecting to `/catalog` until Home ships. Preserve draft data, and stop clamping
   or dropping draft quantities by stock. Missing references remain visible as
   unpriced, removable rows. Production build, 30 tests, strict TypeScript checks,
   and desktop/mobile navigation/theme/drawer browser checks passed. These results
   predate phase 2.
2. **In progress; bounded My projects local prototype verified, remaining MVP pending.**
   The browser-local preview provides list/search/cards, the three-step wizard from
   My projects, an empty owned BOM on create, explicit active-project set/clear,
   and a project overview. Storage uses `solar.projects.preview.v1` with a synthetic
   local-preview owner, not real account ownership. Preserve write-failure/stale-tab
   safeguards. Catalog-to-project destinations, atomic initial-item creation,
   mixed BOM editing, selection, and selected CSV content are now implemented
   locally as described above. Guest linking/history now also has a local adapter;
   connected sign-in/copy enforcement, manual estimate entry, accounts,
   and real CSV file delivery remain pending. Continue the remaining work below,
   preserving completed behavior rather than reimplementing it.
   Continue the customer
   MVP with directly linkable product details, project BOM editing for store-product
   and free-text lines, favorites, profile, and project selection when adding items.
   Include the separate classification,
   installation, configuration, and work-scope fields, with new-project installation
   defaulting to Rooftop. Reuse the popup New project wizard from My projects, item
   actions, and the guest list; support active/other/new project destinations,
   one-time guest-list copying with automatic linking and a non-destructive Start
   new equipment list flow, and default-checked project
   BOM row selection with Check all, without duplicate or accidental additions.
   Keep this BOM editable; immutable product
   snapshots and revisions belong to later locked POs, not normal draft saves.
   Local prototypes remain explicitly labeled. Prioritize these before PO or
   checkout screens. Home/category landing content can follow the core flow.
3. Connect accounts and persistence. Use shared Firebase project `dumaget-me-solar`.
   Use named Cloud Firestore database `store-dev` for storefront development;
   explicitly select it in clients and rules/index deployment, never `(default)`.
   `store-dev` is now provisioned as Standard / Native / Singapore (`asia-southeast1`)
   with direct-client deny-all rules. Resolve the documented Auth activation hold
   and verify server IAM/API ownership before connecting private data; provisioning
   does not enable account persistence. See [provisioning record](../docs/FIRESTORE-PROVISIONING.md).
   Always use the lowest-cost suitable options and default new regional resources
   to Singapore; higher-cost exceptions require explicit approval. See the
   [cost/region policy](../docs/INFRASTRUCTURE.md#cost-first-backend-policy).
   Define data boundaries, authentication, backend-enforced user ownership, and
   separate admin permissions before connecting private data. Persist projects and
   favorites, implement guest-list copying, and connect profile/settings. Never expose the
   local Admin SDK credential to Angular or public assets.
4. Connect transactional features. Replace fixtures with verified catalog data and
   server-authoritative pricing/stock; define PO submission/review. Implement
   multiple customer POs per project with independent statuses, an explicitly agreed
   lock transition, complete product snapshots, immutable PO revisions, amendments,
   status events, aggregate duplicate-product demand validation, explicit quantity-
   tier grouping, and quantity reporting. Status names/lock threshold remain TBD.
   Delivery addresses, checkout/payment, supplier workflows, and engineering checks
   remain deferred until their requirements and backend capabilities are defined.

Deployment remains a separate task using the main site's current Firebase Hosting
strategy and a dedicated storefront target. Follow
[INFRASTRUCTURE.md](../docs/INFRASTRUCTURE.md); this plan does not authorize changes to shared
rules, creation of hosting sites, DNS changes, or deployment. Review the documented
dependency security findings before production.

## Verification and acceptance

Phase 1 verification above remains historical and unchanged. Initial phase 2 validation
confirmed: production build passed; 46 tests passed in 9 files; app/spec
`tsc --noEmit` checks passed; and the browser checks below passed.

- [x] My projects preview list/search/cards and empty state with a three-step wizard entry.
- [x] Wizard Back retains fields; cancel and step navigation do not persist; final confirmation saves a project with an empty owned BOM and opens its overview.
- [x] Project classifications, configuration, work scope, Rooftop-only installation default, optional Other/location/description/notes, and project overview are represented.
- [x] Active project is explicitly set/cleared and is not silently changed on creation; customer navigation shows the active local project.
- [x] Local preview storage uses `solar.projects.preview.v1` and a synthetic owner; malformed/foreign data is protected, failed writes do not publish and allow retry, and known stale-tab conflicts are rejected by read comparison.
- [x] Browser check: empty state and New project; inline invalid name/classification focus; Cancel and Escape return focus and create nothing; Rooftop default with other enums unchosen; Back retains entries; final confirmation creates one local preview project with an empty owned BOM, opens its overview, and leaves active project null.
- [x] Browser check: Make active persists after reload; empty search results and Clear; mobile nav and dialog; the optional Other field scrolls while Cancel remains reachable; Tab stays within the dialog.
- [x] Browser check: light/dark desktop and mobile; fonts and KeenIcons load; public corners are 2px; admin restores blue `#1379F0`, vendor 12px corners, and system font, then public styling returns; console has no errors.
- [x] Viewport overrides were 1440x900 and 390x844; user zoom made actual CSS widths 1309 and 355. Light/default viewport was restored and active project cleared afterward. The test project `Local preview - Rooftop` remains in browser-local records.
- [x] Phase 2 production build, 46 tests in 9 files, and both app/spec `tsc --noEmit` checks passed.

- Shopping pages have no persistent sidebar at desktop or mobile widths.
- My pages use customer-only navigation, with an accessible mobile drawer, active
  page indication, and an obvious return to shopping.
- Both customer shells and overlays retain the green theme in light/dark modes;
  administration remains blue after navigation in either direction.
- Every project has its own BOM from creation, including an empty BOM. Multiple
  projects remain independent; adding to one does not change another.
- New projects default installation to Rooftop; users can change it. Classification,
  configuration, and work scope remain separate selections. Saved values survive
  reopening/duplication/archiving, and metadata changes do not mutate BOM lines.
- No unapproved defaults are assumed for classification, configuration, or work
  scope.
- Duplicating copies metadata and BOM lines but not POs. Archived projects are
  read-only and restorable, and cannot be archived while a PO is open.
- New project on My projects and Create new project from an item or the guest list
  open the same popup wizard with the correct defaults and retained step inputs.
  Product and guest-list entry points preserve the pending item(s)/quantities
  through review and add them exactly once.
- Add to project supports the named active project, another eligible project,
  and creation via the wizard. No-active/no-project/archived-project states have
  clear alternatives; choosing another destination never silently switches active.
- Canceling either popup makes no writes. Validation, access changes,
  failed writes, and repeated submissions do not create orphan projects or duplicate
  items. Keyboard focus stays within the dialog and returns to its invoking CTA.
- Project BOMs have no Add to project action. The guest list copies all its rows
  once, as new destination lines, then shows Linked to <project> with Add to project
  disabled and explained; it stays editable. Cancel or failure leaves it unlinked,
  and retries never duplicate lines.
- Start new equipment list confirms a new empty/unlinked list with a new identity;
  cancel changes nothing. Previous linked contents/edits remain locally recoverable,
  reopening cannot enable re-copying, and account switching never leaks linked
  project details or bypasses one-time copying.
- All project BOM rows start checked. Check all supports checked, unchecked, and
  indeterminate states; PO creation and export use only checked rows and are
  disabled with an explanation when none are selected. Selections survive dialogs.
- Adding a product already in the destination BOM creates a separate line. BOM
  quantities are never limited or reduced by SKU stock, on entry or on restore.
- PO review/lock/amendment aggregates same-product stock demand across separate
  lines: 6 + 6 against stock 10 reports a shortage of 2 and cannot lock. Different
  prices/source lines cannot bypass stock validation. Test compatible pricing-tier
  aggregation, incompatible variants/units/offers, free-text exclusions, concurrent
  commitments, and preserved independent line associations.
- A single BOM supports mixed store-product and free-text lines. Users can add,
  edit, and remove free-text entries without creating catalog products.
- Unpriced entries are visible and never counted as confirmed zero-cost items;
  manual estimates are distinguished from store prices. Exports and PO records
  preserve line types and pricing provenance without implying a locked BOM.
- One project's BOM remains editable while it has multiple independently progressing
  POs. Creating/editing/locking/cancelling a PO never changes another PO or its BOM.
  Creating a PO copies selected items/quantities without moving source lines.
- No ProductSnapshot or immutable PurchaseOrderRevision is created by adding a
  BOM item, saving a draft, or creating an unlocked PO. The configured lock transition
  atomically records revision 1, complete snapshots, and the status event; failures
  and retries cannot leave a falsely locked or duplicate record.
- Locked PO views/exports preserve complete product details, agreed prices,
  quantities/totals/terms, images, and documents after catalog/specification/price/
  supplier/asset edits or deletion. Viewing history neither clamps against current
  stock nor silently reprices.
- Confirmed amendments preserve earlier PO revisions; cancellation retains existing
  history, while pre-lock cancellation creates no snapshot retrospectively. Each
  PO has its own status events, and payment state is not conflated with PO status.
- Required/ordered/delivered/cancelled reporting uses effective PO quantities without
  double-counting revisions or delivered units; reduced BOM requirements expose
  over-ordering rather than silently changing commitments. Missing source references
  preserve orders. Final status/lock/accounting rules must be agreed before release.
- Existing guest draft data survives the `/bom` to `/draft` migration and copying;
  canceling or failing a copy never changes the guest list.
- Private records are restricted to their owner by backend rules, not just route
  guards; unauthorized requests are rejected. Account switching must not leak data.
- Search/filter state, direct links, browser back navigation, responsive actions,
  keyboard focus, verified glyphs, loading/empty/error states, and unavailable-product
  handling are checked. Pricing remains covered by tests; stock-cap tests are
  replaced by stock-independent quantity tests.
- Verify CSV file delivery in a regular browser. Do not describe unconnected
  PO submission, checkout, reservation, or live inventory functions as operational.
- Run relevant tests and the production build for implementation, followed by
  desktop/mobile browser checks. No runtime changes or new test results are implied
  by recording this document.
