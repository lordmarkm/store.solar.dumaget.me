# Account projects and editable BOMs

Approved implementation scope: 2026-10-08 (Asia/Manila).

This slice connects the existing customer project wizard, My projects, mixed BOM
editor and explicit Cart-to-project flow to the existing API. The 2026-10-09
extension adds project details editing, archive/restore, duplication, API search
and filters, and a 10-record customer list. It does not implement purchasing,
account adoption of old previews, favorites, inventory reservations or automatic
post-login action execution.

## Project management extension (2026-10-09)

- Edit details uses a populated customer-themed popup with the same field limits
  and required choices as creation. Clearing optional details removes their stored
  values; changing metadata never rewrites BOM lines or quantities.
- Archive requires confirmation. It makes the project and BOM read-only and
  clears the active selection in the same transaction, incrementing preferences
  only when needed. Restore returns it to Draft, clears archivedAt and does not
  select it as active. There is no implemented PO service in this slice; before
  introducing POs, enforce the roadmap's nonfinal-PO archive restriction atomically.
- Duplicate requires confirmation and creates a Draft named Copy of <name>
  (within the 120-character limit). It copies details and mixed BOM lines with new
  project/BOM/line IDs and timestamps. Missing/unpublished product references stay
  visible as unavailable. POs, status history, removed-line tombstones, Cart links
  and active selection are not copied.
- Lifecycle requests use expectedVersion and a stable request UUID. Exact retries
  return the existing result, not another copy or archive event. Conflicts require
  reload/review, not silent rebasing. Old-session responses cannot mutate UI state,
  show a success toast or navigate. Save/lifecycle results use KTUI toasts.
- My projects searches name/location case-insensitively and filters by status,
  classification, configuration and work scope. Filter options are the explicit
  contract vocabulary, not values seen on the current page. Clear filters is a
  compact icon action in the same wrapping toolbar.
- The list sends limit=10 and shows a single returned page with Previous/Next
  cursor navigation, loading, empty, retry and stale-result protection. Search is
  debounced; any criterion change resets cursor history. No global count is
  advertised. Refresh/Retry keeps the criteria. The shared chooser cache is not
  used as the displayed filtered dataset.

### Query cost boundary

The API validates search (maximum 120 characters), enum filters, UUID cursor and
limit (10 or 50). Default limit=50 preserves the existing destination chooser;
My projects explicitly requests 10. Ownership remains derived from the token.
Ordering is document ID ascending, not date/name sorting or an offset.

One enum equality, when present, uses its automatic single-field index. Search
and any remaining criteria are evaluated on the API before returned pagination,
not on downloaded frontend rows. Simple/unfiltered requests read page-size plus
one candidate; combined criteria/search examine at most 50 plus one lookahead.
The continuation is the last consumed candidate, not the last matched record.
Sparse segments may contain fewer than 10 (even zero) matches with a continuation;
the UI must explain that the search continues, not claim global absence.
No unbounded scan, paid search, migration, new cloud index deployment or realtime
subscription is introduced.

## User behavior

- Sign in to create projects or add equipment to a project. Shopping and the
  browser-local Cart remain available without an account.
- New project opens the existing three-step wizard. Classification, configuration
  and work scope require a choice; installation alone defaults to Rooftop.
- Creation produces one project with its own empty BOM, or atomically includes
  the reviewed product/Cart rows. Creation and additions do not change the active
  project; selecting or clearing the active project is a separate account action.
- Each repeated product addition is an independent BOM line. Quantities are
  positive safe whole numbers, not stock-capped. Free-text requirements are
  unpriced, not zero-priced store offers.
- BOMs remain editable: add/edit free text, change quantities, confirm removal,
  and use immediate Undo. Checkboxes start checked; Check all and selected CSV
  export remain view state, not approval or purchasing actions.
- Current published product details resolve store references. Unpublished,
  deleted or incompatible-unit products remain visibly unavailable/unpriced;
  they are never silently dropped from existing BOMs.
- Current BOM completeness is displayed as non-blocking presence state: every
  project configuration requires an inverter line, and hybrid projects require
  a battery line. This is UI completeness only, not an electrical compatibility
  rule, design approval or save gate. BOM lines remain continuously editable;
  users can add components without first satisfying these indicators.
- The BOM groups independent component lines in responsive KTUI tables, with
  category-level Add actions such as Add inverter and Add battery. Multiple and
  repeated products remain separate lines with independent quantities. Panels,
  batteries on non-hybrid projects, mounting, protection and Other/free-text
  requirements are optional. Existing unavailable product references remain
  visible and editable.
- A category Add action opens a picker with a published-products-only API-filtered catalog branch and
  cursor pagination of 10 products per page. It targets the explicitly current,
  owned Draft project; it does not infer the destination from or change the
  active-project preference. The existing BOM stays editable while the picker
  is used. This is ordinary BOM editing, not the future staged Build Assistant.
- Add free-text line is inside the component picker, not on the main page. It
  switches the same dialog to the shared editor with the chosen category/quantity.
  Optional componentCategory persists in embedded BOM lines; categorized free
  text groups with that component and counts only toward UI presence, not
  electrical validation. Legacy/unclassified lines remain Other requirements;
  Add requirement opens its picker without a catalog query. Cancel writes nothing
  and remains last in the lower-right footer. Editing preserves saved categories.
- ATS is a required current-BOM slot for all configurations, separated from other
  Protection by explicit subtype. The public picker filters Protection / ATS on
  the API before cursor pagination; no title inference. Free-text ATS requires
  componentProtectionType: 'ATS' and positive finite amperage in amperes, alongside
  componentCategory: 'Protection'. Preserve and validate merged metadata through
  editing, reload, duplication and Undo. Fractional amperage is allowed; quantities
  remain positive safe integers. See BOM-COMPONENTS.md version 3 for this UI-only
  policy and its evidence limits; no PO or electrical approval gate is implied.
- A nonempty, unlinked Cart copies every reviewed row once, with a server receipt.
  The source Cart is not emptied. Later Cart edits do not synchronize to the BOM.
  A new Cart keeps previous contents and links in local history.
- Loading, errors and stale-version conflicts must be visible. Retry does not
  duplicate committed additions; conflicts require reloading and reviewing.

## Ownership and retained local data

The API derives ownership only from a verified Firebase ID token. No request
accepts a customer ID, role, timestamp, project version to write, catalog price or
product snapshot. Project IDs are not authorization: another account's project
returns the same not-found result as an unknown ID.

Frontend account records are memory-only and cleared on identity/session changes.
Late responses cannot expose the former account's records or report success to
the new account. Private API requests use no-store and the established session
revision/token safeguards. Open editors must close on account changes.

`solar.projects.preview.v1` remains the local preview/Cart-history envelope, with
its synthetic `local-preview` projects preserved. Real accounts never adopt or
view those projects implicitly, even if a Firebase UID equals `local-preview`.
`solar.bom.v1` remains the retained legacy recovery backup. Sign-in/sign-out alone
does not assign, migrate, clear or rewrite either store.

Only an explicit reviewed Cart copy creates account-owned rows. The local link is
written after server confirmation. If browser storage fails afterward, the server
may already have saved the copy; retry the unchanged request to recover its receipt
without duplicating lines. Do not interpret that failure as proof of no server write.
Links owned by another account expose neither its project name nor navigation.

## API and storage boundary

All endpoints below require authenticated customer access; admin claims are not
required. They use the existing API and named `store-dev` database, Standard/Native
in Singapore (`asia-southeast1`), independently verified on 2026-10-08.

| Endpoint | Purpose |
| --- | --- |
| `GET /api/v1/me/projects` | Cursor-paged owned projects and active-project preference |
| `GET /api/v1/me/projects/:id` | One owned project, including its embedded BOM |
| `POST /api/v1/me/projects` | Create with optional initial store rows/Cart association |
| `POST /api/v1/me/projects/:id/commands` | Add rows, free-text save, quantity, remove or Undo |
| `POST /api/v1/me/projects/:id/management` | Edit details, archive, restore or duplicate with a reviewed version; returns project and current active preferences |
| `PUT /api/v1/me/project-active` | Explicit active selection/clear with preference version |

Project responses extend the planning Project DTO with a positive concurrency
`version`. Commands carry a stable UUID `requestId` and `expectedVersion`;
preference creation starts with a null expected version. These are operational
concurrency tokens, not immutable BOM revisions or PO snapshots.

Owned records live beneath `customers/{customerDocumentId(uid)}`; the existing
base64url UID encoding keeps slash-containing identities in a single path segment.
Projects, active preferences and request/Cart receipts use separate subcollections
or documents so project operations never overwrite the profile document.

Lists follow the query cost boundary above, ordered by document ID with cursors,
not offsets. A project embeds at most 200 BOM items; the existing
64 KiB request limit also applies. No unbounded scan, realtime listener, paid search,
additional composite index or new compute service is necessary.

Each mutation validates strict fields and runs a bounded transaction for the
project/preference and retry receipt. New store lines are checked against public
published projections and matching sellable units inside that transaction. Private
admin product/supplier details and client-supplied prices never become BOM data.
Missing references already present in a BOM do not prevent unrelated edits.

Identical retry IDs/payloads recover the committed result; changed payload reuse
conflicts. Cart copy identity is also retained per account and source-list ID,
preventing a new request from copying that list to another destination. Browser
fingerprints are review guards, not trusted catalog details or ownership proof.
Receipt retention has no automatic TTL or deletion policy in this slice.

Client Firestore access remains denied by the existing rules. This implementation
does not deploy rules/indexes, enable services, modify shared Auth/IAM/billing,
change Hosting or provision paid resilience features.

## Deliberately deferred

Projects/BOMs are never locked. Multiple purchase orders, selected-row PO creation,
statuses/transitions, lock threshold, snapshots, revisions, payment and fulfillment
require the separately approved PO policy. No status or lock point is inferred here.
Manual estimates/tax, migration of old preview projects and favorites remain
separate features. Metadata editing/archive/restore/duplicate are now included.
The inverter/hybrid-battery completeness indicators are not PO policy or engineering
compatibility checks, and do not require users to create missing component rows
before editing or saving an otherwise valid BOM.

## Verification

2026-10-09 integrated results: 425 frontend tests in 55 files and 98 backend tests
pass; production UI/API builds, app/spec/backend type checks and git diff check
pass. New project-management emulator scenarios exercise ownership, stale writes,
optional-detail clearing with retained BOM lines, archive/restore/archive cycles,
atomic active clearing and retry preservation of a later active selection, duplicate
idempotency/unavailable references and 61-project cursor/filter continuation. The
existing customer-project emulator suite also passes (Cart receipts, BOM commands,
removed-line Undo, preference concurrency and profile isolation).

Only fixed-loopback demo-store-provisioning / store-dev emulators and isolated
HTTP/SDK doubles were written by tests; no live projects, stock, rules/indexes,
IAM or Hosting content were changed. Local /health and /my/projects respond 200;
unauthenticated project list responds 401. These smoke checks do not demonstrate
authenticated writes or correct visual rendering.

Real-browser desktop/mobile/dark layout, dialog focus/glyph/font rendering and
authenticated create/edit/archive/restore/duplicate remain unverified: the browser
connection exited before it could observe the page. The existing public-theme and
action skills guided semantic green/mint styling, angular KTUI surfaces, shared
KeenIcons/tooltips and CDK overlays; admin styling and vendor CSS are unchanged.

Use isolated
test doubles and a `demo-*` Firestore emulator; do not seed live store projects as
part of automated tests. Real-account browser creation/reload, mobile/dark layouts,
and actual CSV file delivery must be reported separately from automated results.
