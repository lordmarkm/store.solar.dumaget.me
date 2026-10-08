# Infrastructure and hosting decision

Image-storage update (2026-10-08): the user approved a US-region exception for
product images. Dedicated Standard bucket dumaget-me-solar-store-images-dev
was created in us-west1 with uniform access and soft delete off. After explicit
approval including draft exposure, anonymous object reads (not listing/writes)
were granted only on this bucket. See [product images](PRODUCT-IMAGES.md).
This is not a Firebase Hosting deployment or a Firestore/Auth region change.

Publication update (2026-10-07): local API product editing/Publish/Unpublish and
public catalog projections are connected to the existing named store-dev.
Shopping no longer uses sample products; cart/project persistence remains local.
No Hosting/deployment, rules/index, billing/IAM or provider change accompanied
this slice. See [product publication](PRODUCT-PUBLICATION.md).

Approved local activation (2026-10-07): the user accepted temporary use of the
existing Google-only Identity Platform setup and Mark-only store admin claim.
The local authorized domains and client are enabled; `store-dev` stays Standard
in Singapore, with rules/billing/IAM/Hosting unchanged. See
[activation record](AUTH-ACTIVATION.md). Historical Auth holds below no longer
block this approved local verification; production deployment and subtype
recovery remain separate decisions.

## Decision and current status

Follow the main site's current deployment strategy: Firebase Hosting, as confirmed
by its checked-in configuration and workflow. This supersedes the earlier S3 plan.
Use shared Firebase project `dumaget-me-solar` for Hosting and future backend services,
with a dedicated storefront Hosting site/target for `store.solar.dumaget.me`.

Storefront hosting configuration, scripts, workflow,
site/target mapping, and custom domain are not configured. Runtime Firebase services
remain limited to the Auth client described below; catalog data is illustrative and the BOM is browser-local.
No site creation, DNS change, upload, or deployment was performed. Recheck the main
site's implementation before deployment setup or a future strategy change; this
decision does not authorize automatic provider migrations.

## Named Firestore provisioned (2026-10-07)

After explicit user approval, `store-dev` was created in `dumaget-me-solar` as
Standard / Native / Singapore (`asia-southeast1`), with deletion protection on
and PITR off. Only the named database's API-only deny-all rules were released;
26 local emulator denial tests pass, deployed source matches, and a live anonymous
GET to a nonexistent probe returns 403. No live documents were written or seeded.
No `(default)`, optional paid features, Hosting, IAM or billing changes were added.
Auth subtype/domains and application activation flags remain unchanged. See the
[provisioning record](FIRESTORE-PROVISIONING.md) for commands, evidence and limits.
Earlier empty-database checks below are historical, superseded by this result.

## Auth/Firestore integration foundation (2026-10-07; historical pre-provisioning)

The first integration slice adds an on-demand Angular bearer-token API client,
loopback-only development proxy, and server-owned customer profiles through
`GET`/`PUT /api/v1/me/profile`. The Admin adapter still explicitly uses the named
`store-dev` database. Profile writes use a transaction, field allowlist and expected
version; no browser Firestore SDK or realtime listener is introduced. This is
local, offline-tested wiring, not live activation or account-owned project saving.

Fresh read-only metadata checks still report no Firestore databases, Auth subtype
`IDENTITY_PLATFORM`, Google enabled, and only the two default Firebase domains.
The user selected Firestore Standard in Singapore (`asia-southeast1`) and the
lowest-cost suitable service options. Standard Firebase Auth remains the target;
the unexpected Identity Platform subtype still needs safe recovery before live
activation. The database has not been created. No cloud resources, domains, rules, IAM, billing,
Hosting or credentials were changed. See [integration details](FIREBASE-INTEGRATION.md).

## Local API bootstrap (2026-10-07; historical baseline)

A separate Node.js/TypeScript Fastify scaffold now exists under `backend/`, with
its own pinned dependencies/lockfile, tests and root `api:*` scripts. Default
binding is `127.0.0.1:4400`. Health is local process-only; connected readiness is
not implemented. Firebase adapters remain lazy and disabled by default, explicitly
targeting `dumaget-me-solar` / `store-dev` when separately activated.

No database, schema, rules/indexes, IAM, billing, Auth, Hosting or provider settings
were changed. The Admin credential was not opened or copied into the backend.
The Angular client still uses fixtures/local planning and is not connected to this
API. A read-only `gcloud firestore databases list` metadata check on 2026-10-07
returned `[]`; no edition was available to inspect. Cost-first Standard remains
the planning preference, not a provisioned instance. See [BACKEND.md](BACKEND.md).

## Storefront Firestore database decision (2026-10-07)

Use Cloud Firestore named database **`store-dev`** in shared Firebase project
**`dumaget-me-solar`** for the storefront development backend. Its resource name is
`projects/dumaget-me-solar/databases/store-dev`. Do not use `(default)` or silently
fall back to it. Production database selection remains a separate decision.

Future browser/server clients, maintenance scripts, rules/index deployments and
any Firestore triggers must explicitly target `store-dev`. SDKs default to
`(default)` unless the database ID is supplied; rules must be deployed for the
named database. See [Firebase named-database documentation](https://firebase.google.com/docs/firestore/manage-databases).

Database naming is not an authorization boundary by itself. Preserve the planned
owner/admin enforcement and public/private projections; do not change unrelated
databases, shared Auth configuration or main-site Hosting. Use Standard edition
in regional Singapore (`asia-southeast1`); validate actual requirements and mode,
schema, rules, indexes and backend runtime before provisioning. Never deploy
permissive test rules for private data.

The original datastore decision did not provision resources. The subsequent
authorized creation and named-rule deployment are recorded above; client
activation and production database selection remain pending. The empty-database
inventory below remains historical evidence, not a fresh inventory.

## Firebase development skills (2026-10-07)

Use the official [firebase/agent-skills](https://github.com/firebase/agent-skills)
as Firebase implementation guidance. The selected skills are installed locally
for Codex discovery and retained under `.agents/skills/` in this repository:

- `firebase-basics`: CLI/project setup guidance.
- `firebase-auth-basics`: authentication guidance.
- `firebase-firestore`: database, modeling, SDK and index guidance.
- `firestore-rules-creation`: rule authoring and validation guidance.
- `firebase-security-rules-auditor`: independent rule-review checklist.

Source revision: `551653e800807378a3d9220b3c5547a06c01625b`. Preserve upstream
references and Apache-2.0 licensing; updates should be reviewed and recorded
rather than silently tracking the latest branch. Local modification (2026-10-07):
the repository and installed `firebase-firestore/SKILL.md` carry a scoped
storefront cost-first override and edition-neutral creation example. Preserve
that override on updates. Other imported files remain upstream copies. No upstream
scripts or Firebase commands were executed as part of installation or this edit.

Apply this project's explicit decisions before following generic setup examples:

- Use existing project `dumaget-me-solar` and named database `store-dev`; never
  create another project or fall back to `(default)` without a user decision.
- Cost-saving measures take precedence over Enterprise/advanced-feature
  recommendations in all imported skills. Use the lowest-cost suitable option,
  with Standard in Singapore selected for Firestore; validate requirements and
  current regional pricing before creation. Any higher-cost exception needs a
  concrete benefit, simpler alternatives, cost estimate and explicit approval.
- Auth activation remains on hold. Do not run the Auth provisioning/deploy examples,
  add anonymous/password providers, change authorized domains or reinitialize Auth
  as a consequence of installing/using these skills.
- Skill instructions are guidance, not permission for cloud writes, rules/index
  deployment, billing/IAM changes, service enablement or MCP/plugin installation.
  Keep the existing credential private and outside browser code/public output.
- Validate examples against current SDK/CLI support and agreed schemas. Use local
  emulator tests for allowed/denied access and transactions; a checklist or mental
  security review alone does not establish operational security.
- Preserve the server-controlled configurable admin policy, owner isolation,
  public/private product projections and the agreed mutable-BOM/locked-PO model.
  Example task statuses or hardcoded admin addresses do not define store policy.

This selection does not implement an API, connect the frontend to Firestore, install
the Firebase MCP server, or authorize deployment. Future backend work still follows
the customer/admin plans and authentication recovery constraints.

### Cost-first backend policy

- User decision (2026-10-07): always select the lowest-cost suitable service tier
  and architecture that meets the agreed requirements. Enterprise features are
  not defaults. Compare expected workload costs, not just edition names; any
  higher-cost exception requires explicit approval. Preserve security and data
  integrity even when optimizing costs.
- Default new regional resources to Singapore / SEA. For supported Google Cloud
  services use `asia-southeast1`, and colocate future regional API compute with
  the database where practical. If Singapore is unavailable, ask before choosing
  a different location. This is not a claim that Singapore is the globally
  cheapest region or authorization to migrate existing/shared resources.
- Exception approved 2026-10-08: product image storage uses regional Standard
  us-west1 for the eligible free tier; see PRODUCT-IMAGES.md. Other regional
  resources retain the Singapore default. Free allowances are not spending caps.
- Firestore selection: named `store-dev`, Standard edition, Native mode, regional
  `asia-southeast1`. Location is a provisioning decision, not an SDK runtime
  setting, and cannot be changed in place after database creation. See
  [official Firestore locations](https://firebase.google.com/docs/firestore/locations).
- Auth target: ordinary Firebase Authentication with Google sign-in only, not an
  Identity Platform upgrade. Auth does not take a Firestore-style region setting;
  the Singapore default does not relocate Auth or the global Hosting CDN. The
  existing unexpected subtype remains unresolved; no unsafe downgrade is implied.
- Keep development on emulators where practical. The chosen named `store-dev`
  database does not receive Standard edition's free quota; do not describe it as
  free or switch to `(default)` without a user decision. Check regional usage costs
  before provisioning. See [official pricing](https://cloud.google.com/firestore/pricing).
- Keep reads/writes bounded: cursor pagination rather than offsets, only required
  indexes, limited realtime listeners and appropriately invalidated public-catalog
  caching. Keep private data out of shared caches and revalidate PO pricing/stock.
- Prefer one maintainable API and on-demand compute when adequate. Avoid adding
  microservices, warm instances, paid search/analytics, PITR/backups or TTL merely
  for an enterprise-style checklist; discuss needs/costs and obtain approval first.
- Retain authentication, owner/admin authorization, safe transactions and complete
  locked-PO history. Do not trade them away for savings or disable existing
  recovery/security features. Establish recovery requirements before production.
- Propose usage/budget alerts and bounded retention for routine operational logs;
  never prune commercial history or audit evidence without an agreed policy.
  Monitoring is not a guarantee of zero charges, and no alerts/settings are enabled
  by this documentation change.

## Google Authentication integration update (2026-10-06)

The user approved Firebase Authentication with Google sign-in only, keeping
Firestore and shared security rules unchanged. A dedicated `store.solar.dumaget.me`
web app was registered in `dumaget-me-solar`:
`1:177959719186:web:1f99f7ab52c55a889723cb`. Its public SDK config is wired to the
frontend with Firebase JS SDK `12.19.0`, without Analytics, Firestore, Storage,
Admin SDK initialization, Hosting deployment, or IAM changes.

**The requested Firebase Auth activation is unresolved.** The user supplied
`mark@solar.dumaget.me`; the official current firebase-tools Auth-only orchestration
request completed successfully for this web app, brand `Dumaget.me Solar`, with
Google enabled only. Operation:
`operations/workflows/NmFhMTUwMTAtOTg2NS00ZTM5LThhYzktZDQ3YjI5NzRiMzU1`.
Verification unexpectedly returned subtype `IDENTITY_PLATFORM`, not the approved
standard `FIREBASE_AUTH`; no end-to-end sign-in was attempted. Authorized domains
remain only `dumaget-me-solar.firebaseapp.com` and `dumaget-me-solar.web.app`;
localhost and the storefront domain were not added. The client flag stays false.
The inspected API discovery exposes the subtype as output-only and listed no public
downgrade method, but downgrade impossibility is not established. Safe recovery is
pending a reviewed path, potentially user decision or Google support. No billing
association change was requested/submitted; the billing read returned 403
`SERVICE_DISABLED`, so costs could not be verified. Blaze was already shown before
this operation. No charges/no-charges claim is made. Firestore remains empty;
rules, Hosting, IAM, user inventory/deletion, and further cloud writes were untouched.
See [authentication status and recovery](AUTHENTICATION.md).

Registration returned a storefront measurement ID `G-P4PM6JB7PH` in its SDK config
because the shared project is Analytics-linked. The frontend deliberately omits
that identifier and does not import/initialize Analytics; event ingestion was not
inspected. Do not describe app registration as a storefront Hosting site or deploy.

Real Firebase UIDs are never assigned the existing `local-preview` projects.
Project entry points remain blocked until account-scoped persistence is separately
approved and implemented. Guest lists/history and pending actions are retained.
The inventory below combines the earlier read-only service inventory with the
later web-app registration and Auth provisioning updates. Unrelated services
were not re-audited during Auth provisioning.

## Verified main-site references

Reference repository: `D:/git/solar/solar.dumaget.me`.

- `.firebaserc`: selects `dumaget-me-solar`.
- `firebase.json`: serves `dist/solar-dumaget-me/browser`, with cache/security headers.
- `scripts/deploy-firebase.ps1`: builds and validates prerendered output, publishes
  its not-found page as `404.html`, and deploys Firebase Hosting.
- `.github/workflows/deploy-firebase.yml`: triggers on pushes to `main` or manual
  dispatch; installs/builds with Node 22, then uses
  `FirebaseExtended/action-hosting-deploy@v0` with `channelId: live`.
- `README.md`: names Firebase Hosting as its active Phase 1 deployment strategy.

AWS templates and infrastructure/upload scripts are historical references only,
not this storefront's deployment path. The initial review verified the checked-in
setup; the read-only inventory below subsequently verified the cloud-side Hosting
site and latest live release. Custom-domain mappings were not inspected. Leave the
sibling repository unchanged.

## Live Firebase service inventory

Verified: **2026-10-06 (Asia/Manila)**, shared project **`dumaget-me-solar`**.
This is a point-in-time inventory, not provisioning or deployment authorization.
An enabled API is not evidence that its product has been configured, is receiving
traffic, or is generating charges.

| Service | Verified cloud state | Storefront implication |
| --- | --- | --- |
| Firebase Hosting | One existing default site, `dumaget-me-solar`, at `https://dumaget-me-solar.web.app`; one `live` channel with a finalized deployment | Used by the main site; do not publish storefront content to this site |
| Google Analytics | Firebase project linked to Analytics property `554015771` (`dumaget-me-solar`); web stream measurement ID `G-5V3CNC3CG4` | Main-site Analytics linkage exists; storefront instrumentation is not connected |
| Authentication | Google (`google.com`) enabled; returned configuration subtype is `IDENTITY_PLATFORM` rather than approved `FIREBASE_AUTH`; only default `dumaget-me-solar.firebaseapp.com` and `dumaget-me-solar.web.app` domains are authorized | Activation outcome is unresolved; no login attempted and storefront flag remains off. See [authentication status](AUTHENTICATION.md) |
| Cloud Firestore | `firestore.googleapis.com` enabled; database list returns `[]` | No database has been provisioned |
| Cloud Storage | Google Cloud Storage APIs enabled; project bucket list returns `[]` | No bucket has been provisioned; do not assume Firebase Storage is configured |
| Remote Config | Remote Config and realtime APIs enabled; client template has zero parameters, parameter groups, and conditions, with no version metadata returned | No populated client configuration verified; server template and historical versions were not inspected |
| Cloud Messaging | `fcm.googleapis.com` and `fcmregistrations.googleapis.com` enabled | API availability only; messaging integration, registrations, and delivery usage not verified |
| App Distribution | `firebaseappdistribution.googleapis.com` enabled | API availability only; releases/testers and actual usage not inspected |
| Test Lab | `testing.googleapis.com` enabled | API availability only; test runs and usage not inspected |
| Supporting Firebase APIs | Management, Installations, and Security Rules APIs enabled | Does not establish runtime use or deployed rules; rules content was not inspected |
| Realtime Database | `firebasedatabase.googleapis.com` absent from enabled API inventory | API not enabled; no instance inventory performed |
| Cloud Functions / Cloud Run | `cloudfunctions.googleapis.com` and `run.googleapis.com` absent from enabled API inventory | APIs not enabled; no function/service deployments verified |
| Firebase App Hosting / App Check | `firebaseapphosting.googleapis.com` and `firebaseappcheck.googleapis.com` absent from enabled API inventory | APIs not enabled; no backends or enforcement configuration verified |

### Existing app and Hosting release

- Two registered Firebase web apps: **`solar.dumaget.me`**, state `ACTIVE`, app ID
  `1:177959719186:web:bf703bf9f6bd60799723cb`; and the storefront app
  `1:177959719186:web:1f99f7ab52c55a889723cb`.
- No separate storefront Hosting site appeared in the lists.
- Latest live Hosting release at inspection:
  `2026-09-21T01:03:18.903Z` (September 21, 09:03 Asia/Manila).
  Version `5dad69e24eca0b78`, status `FINALIZED`, 68 files.
- This verifies a deployed release, not that the latest local source is deployed,
  custom domains are correctly mapped, or every live page is healthy.
- The main-site repository also references `G-5V3CNC3CG4` in its Analytics bootstrap
  validation. Event ingestion/traffic was not audited.

Other enabled Google Cloud APIs include BigQuery-related services, Analytics Hub,
Dataform, Dataplex, App Engine, Datastore, Logging, Monitoring, Pub/Sub, and platform
management services. Their API enablement alone does not establish provisioned
resources or use; those products were outside this Firebase resource inventory.

### Evidence and safe rechecking

Read-only checks used existing CLI authentication, not the local Admin SDK key:

```powershell
gcloud services list --enabled --project=dumaget-me-solar
gcloud firestore databases list --project=dumaget-me-solar --format=json
gcloud storage buckets list --project=dumaget-me-solar --format=json
firebase hosting:sites:list --project dumaget-me-solar --json --non-interactive
firebase apps:list --project dumaget-me-solar --json --non-interactive
```

`firebase hosting:channel:list --project dumaget-me-solar --json --non-interactive`
was run from the main-site directory, which contains `firebase.json`. The storefront
does not yet have that file; running the channel command here reported that it
could not locate a Firebase app directory.

Additional authenticated GET checks used the documented
[Authentication configuration](https://docs.cloud.google.com/identity-platform/docs/reference/rest/v2/projects/getConfig),
[provider inventory](https://docs.cloud.google.com/identity-platform/docs/reference/rest/v2/projects.defaultSupportedIdpConfigs/list),
[Analytics linkage](https://firebase.google.com/docs/reference/firebase-management/rest/v1beta1/projects/getAnalyticsDetails),
and [Remote Config template](https://firebase.google.com/docs/reference/remote-config/rest/v1/projects/getRemoteConfig)
APIs. The existing Google Cloud login required the request-only quota header
`x-goog-user-project: dumaget-me-solar`; this did not change local/project settings.
Only configuration metadata/counts were reported, not credential values, user
accounts, stored files/documents, or Remote Config parameter values. The CLI's
Remote Config version-list command failed; the template GET supplied the recorded
current-client-template evidence instead, not a verified version history.

The original inventory itself made no mutations. Subsequent web-app registration
and Auth provisioning are recorded above and in
[the provisioning outcome](AUTH-PROVISIONING-OUTCOME.md). No rules/permissions or
Hosting content were changed. Further backend setup still requires explicit approval and an ownership/security
design. Recheck this inventory before implementation: the project is shared and
may change independently of this repository.

## Deployment isolation

Use a separate storefront Hosting site within the shared project; each site can
have its own content, configuration, and domains. See [Firebase multisite documentation](https://firebase.google.com/docs/hosting/multisites).
When deployment setup is requested, create/select that site, map a storefront deploy
target in `.firebaserc`, and reference it in `firebase.json`. The actual site ID and
target mapping are not configured; do not assume or invent them.

Scope CLI deployment to the storefront target and the GitHub action to its entry
point. Do not blindly copy the main site's unscoped deploy command: storefront
content must never replace `solar.dumaget.me`. Verify destination and domain before
enabling live publication. Project selection is not a Hosting target mapping or an
authentication/authorization implementation.

## Build, routes, and headers

Run `npm run build` from this repository root. Publish only
`solar-ui/dist/solar-ui/browser/`, never the repository root or `infra/`.
Angular's current asset input is `solar-ui/public/`; keep credentials outside it.

The main site is prerendered and expects `404/index.html`, `sitemap.xml`, and
`robots.txt`. This storefront is a client-side Angular app without those generated
pages: adapt build checks and the not-found conversion instead of copying them.
Configure appropriate app-route rewrites to `/index.html` while leaving missing
assets as real not-found responses. Test direct visits/refreshes on `/catalog`,
`/bom`, `/admin/inventory`, and `/admin/suppliers`, plus unknown paths and missing
assets. An Angular not-found view after an app-shell rewrite does not itself set
the HTTP response status to 404.

Reuse the main site's HTML no-cache policy, immutable caching for content-hashed
JavaScript/CSS, and security-header baseline. Current KeenIcons `.woff` filenames
are not hashed: use short caching or version them before choosing immutable caching.
Review CSP for this app's real endpoints when Firebase/APIs are connected; do not
remove the policy or blindly copy the main site's analytics allowances.
See [Firebase Hosting configuration](https://firebase.google.com/docs/hosting/full-config).

## Workflow to adapt

Follow the main site's install, production-build, and Firebase Hosting publication
pattern when implementation is requested. Adapt paths, output checks, target/entry
point selection, and concurrency scope for this repository. Verify a preview and
custom-domain setup before enabling live publication from `main`.
See [Firebase's GitHub deployment guide](https://firebase.google.com/docs/hosting/github-integration).

The main workflow uses Actions secret `FIREBASE_SERVICE_ACCOUNT_DUMAGET_ME_SOLAR`.
The storefront repository needs its own secret configuration; no secret was uploaded
or workflow enabled here. Never check in the local key or include it as a build
artifact. Review existing service-account permissions before deployment; copying
credentials does not prove required access. No shared rules or permissions changed.

## Local Firebase Admin credential

Source: `D:/git/solar/solar.dumaget.me/infra/dumaget-me-solar-firebase-adminsdk-fbsvc-250560e75d.json`.
Local copy: `infra/dumaget-me-solar-firebase-adminsdk-fbsvc-250560e75d.json`.
The user authorized this local copy; never print its contents.

The exact path and general Admin SDK filename pattern are Git-ignored. Keep the
file untracked: ignore rules cannot protect force-added or already tracked files.
Its copy was checksum-verified without displaying contents. It is outside Angular
sources/assets and hosting output, for trusted server/tooling use only. It is not
browser Firebase configuration or client-side authorization. No Admin SDK process
or credential environment variable has been configured.

Privately supply its path to trusted tooling when needed. CI/production must use a
managed secret or appropriate workload identity, not a committed key or frontend
environment module. Never include it in Hosting uploads, public assets, browser
bundles, logs, documentation, or deployment artifacts. Copies are not synchronized;
refresh/remove both on rotation/revocation. Copying does not create IAM permissions
or verify the service account's access.

Verify without opening the file:

```powershell
git check-ignore -- infra/dumaget-me-solar-firebase-adminsdk-fbsvc-250560e75d.json
git ls-files -- infra/dumaget-me-solar-firebase-adminsdk-fbsvc-250560e75d.json
```

The first command should return the ignored path; the second should return nothing.
