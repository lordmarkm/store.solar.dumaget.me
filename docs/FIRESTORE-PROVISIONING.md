# Named Firestore provisioning

Date: 2026-10-07, Asia/Manila.

## Verified outcome

- Created `projects/dumaget-me-solar/databases/store-dev` at
  `2026-10-07T05:41:13.018240Z` (13:41:13 Asia/Manila).
- Metadata confirms `STANDARD`, `FIRESTORE_NATIVE`, `asia-southeast1`, pessimistic
  concurrency, deletion protection enabled and PITR disabled. Database list now
  contains only `store-dev`; no live `(default)` exists.
- Released rules at `2026-10-07T05:41:49.150674Z` to
  `projects/dumaget-me-solar/releases/cloud.firestore/store-dev`.
  Ruleset: `projects/dumaget-me-solar/rulesets/2edb510c-467e-4d94-be9d-bcfdad4122d6`.
  Fetched deployed source exactly matches the local file. Source SHA-256:
  `97efde4b6e5fde82c825f3d18b402c28055b097f811cf53360d80dc90de9780e`.
- Cloud compiler accepted the source; no live test suite was submitted there.
  Luna's cached-emulator run passed 26 direct-client denial checks and successful
  local authentication/fixture controls. The temporary emulator was shut down.
- An unauthenticated GET to nonexistent `provisioning-probe/missing` returns
  `403 PERMISSION_DENIED`. An earlier reserved `__provisioning_probe__` path
  returned `400 INVALID_ARGUMENT` and was not counted as rules verification.
- No live application documents were written or seeded. No optional PITR,
  backups, TTL, composite indexes, paid search or compute services were added.
  Standard's built-in realtime capability remains enabled; the application has
  no Firestore listeners. No billing plan, IAM or new API enablement was requested.
- Auth remains `IDENTITY_PLATFORM`, with only the two existing default domains.
  Google/provider configuration, Hosting, Storage, main-site configuration and
  private credentials were not changed. No login or Auth downgrade was attempted.
- Backend `/health` remains 200, `/ready` remains 503 `BACKEND_NOT_READY`, and
  proxied `/api/v1/me/profile` remains 503 `BACKEND_DISABLED`. Provisioning did
  not enable frontend/backend activation flags or connect customer pages.

Metadata returned `freeTier: true`, while the published pricing page states named
databases do not receive free quota. Treat this discrepancy as unverified billing
eligibility, not a promise of free usage; actual charges/usage were not inspected.

## Authorized scope

The user approved provisioning after selecting the lowest-cost suitable options
and Singapore as the regional default. Scope is named database `store-dev` in
the existing shared project `dumaget-me-solar`: Standard edition, Native mode,
regional `asia-southeast1`. Do not create `(default)` or another Firebase project.
Auth recovery/activation remains a separate task; this does not accept Identity
Platform or authorize another Auth provisioning call.

The checked-in `firebase.json` has only the named Firestore target and local
emulator settings. It has no Hosting, Auth, Functions, Storage, indexes, extension
or lifecycle deployment configuration. Do not add a broad deployment hook.
No composite indexes or single-field exemptions are required by the current
self-profile document lookups. Built-in single-field indexing remains unchanged.

Rules are an API-only prototype: deny every direct-client read and write, for
guests, customers and admin claims alike, including nested/unknown paths. There
are no allowed client creates/updates requiring schema validators or owner helpers.
The server Admin SDK bypasses rules; API authentication, ownership, schema checks
and least-privilege runtime IAM still require separate end-to-end verification.

Named databases do not qualify for Firestore's free quota. Creation itself has
no additional fee, but usage is billable. Do not promise zero charges, change
billing plans or enable paid optional features. See
[official Firestore pricing](https://cloud.google.com/firestore/pricing).

## Reproducible scoped commands

Run from this repository with the installed CLIs after reviewing the target and
the current database metadata. Creation is a one-time operation, not a command
to run again over an existing database; never recreate or migrate a database to
make it match these defaults. Location cannot be changed in place.

```powershell
gcloud firestore databases list --project=dumaget-me-solar --format=json
gcloud firestore databases create --project=dumaget-me-solar --database=store-dev --edition=standard --type=firestore-native --location=asia-southeast1 --delete-protection --no-enable-pitr
firebase deploy --project dumaget-me-solar --config firebase.json --only firestore:store-dev --non-interactive
gcloud firestore databases describe --project=dumaget-me-solar --database=store-dev --format=json
```

The deploy config has no index file, so the scoped command releases rules only.
Do not use bare `firebase deploy`, `firebase init`, `--force`, or Auth deployment
as a shortcut. Use exact metadata before any later mutation and preserve other
project resources. Deletion protection prevents accidental deletion; it is not
a backup or authorization for destructive recovery.

## Local denial tests

Use the cached Firestore emulator and a compatible Java runtime:

```powershell
firebase emulators:exec --project demo-store-provisioning --config firebase.json --only firestore --non-interactive "node scripts/test-firestore-rules.mjs"
```

The script fixes the destination to loopback port 8180 and a `demo-` project, not
the live project. Unsigned mock tokens are emulator-only and never accepted by
the application API. A temporary local owner-only rule verifies the owner token
in the separate emulator default database, then restores its deny-all rules.
The named database keeps its startup-loaded rules unchanged; its existing fixture
is seeded/read with the emulator-only literal `Bearer owner` IAM bypass before
denial tests. No fixture is written to the live database, and no live `(default)`
database is created.

Review every denial result, not just the process exit code. Existing-document
get/update/delete and collection list must return `403 PERMISSION_DENIED`; a
malformed-token error is not proof of rules enforcement. The emulator suite is
not verification of production Auth, server IAM or actual API transactions.

## Attack review

The catch-all false condition denies public listing, non-owner reads/writes,
update/schema bypasses, owner hijacking, immutable-field edits, invalid types,
oversized fields, omitted fields, role escalation, extra fields, invalid state
transitions, path scoping tricks, timestamps, negative/overflow values, mixed-PII
reads, counter replay and orphaned subcollection access. No query is intended to
be allowed from the browser; server SDK queries bypass these rules. There are
no allowed updates or client validator paths to bypass. Local tests cover
representative denials, not every payload/permutation in this review.
