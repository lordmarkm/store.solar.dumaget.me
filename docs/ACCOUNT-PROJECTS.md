# Account projects and editable BOMs

Approved implementation scope: 2026-10-08 (Asia/Manila).

This slice connects the existing customer project wizard, My projects, mixed BOM
editor and explicit Cart-to-project flow to the existing API. It does not implement
purchasing, account adoption of old previews, project duplication/archive, favorites,
inventory reservations or automatic post-login action execution.

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
| `PUT /api/v1/me/project-active` | Explicit active selection/clear with preference version |

Project responses extend the planning Project DTO with a positive concurrency
`version`. Commands carry a stable UUID `requestId` and `expectedVersion`;
preference creation starts with a null expected version. These are operational
concurrency tokens, not immutable BOM revisions or PO snapshots.

Owned records live beneath `customers/{customerDocumentId(uid)}`; the existing
base64url UID encoding keeps slash-containing identities in a single path segment.
Projects, active preferences and request/Cart receipts use separate subcollections
or documents so project operations never overwrite the profile document.

Lists are bounded to 50 records plus one look-ahead document, ordered by document
ID with cursors, not offsets. A project embeds at most 200 BOM items; the existing
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
Manual estimates/tax, project metadata editing/archive/duplicate, migration of old
preview projects and favorites remain separate features.

## Verification

Implementation checks and results will be recorded here after review. Use isolated
test doubles and a `demo-*` Firestore emulator; do not seed live store projects as
part of automated tests. Real-account browser creation/reload, mobile/dark layouts,
and actual CSV file delivery must be reported separately from automated results.
