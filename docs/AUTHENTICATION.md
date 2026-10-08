# Customer Google sign-in

Logout UX update (2026-10-07): all visible Cancel sign-in controls have been
removed from shopping, account panels and administration. Automatic popup return
grace and bounded recovery remain enabled; removing the button does not disable
those safeguards.

Successful explicit sign-out from any account routes to the public `/goodbye`
page. It reuses the green/mint KTUI storefront theme, Space Grotesk/DM Sans and
angular card styling. Its Back to home link targets `/`, the storefront root
(currently routed to `/catalog`), not the separate main solar site. The goodbye
message does not assert sign-out for a signed-in visitor opening the URL directly.

Global navigation is initialized by the root app, including entry into inventory
or other routes that do not instantiate a login panel. A goodbye redirect requires
both a successful SDK sign-out operation and a newer observer-confirmed null
session. The order of those confirmations does not matter. A failed sign-out,
initial guest restoration, passive session loss or account switching alone does
not generate the completion event. A stale prior operation cannot sign out the
new account in app state or redirect it. Completion cancels pending admin-login
navigation and uses replacement history. Existing private-data revocation stays
in place; confirmed logout is not blocked by an obsolete dirty editor or the
customer shell's sign-in fallback. Cart and retained intents are not erased.

Logout verification: 218 tests across 32 files, app/spec type checks and the
production build passed. Eleven focused tests cover customer/admin redirects,
both SDK/observer confirmation orders, failures, stale account operations,
direct goodbye visits, the root link and removed Cancel controls. Tests use
injected providers rather than real OAuth. Browser automation could not initialize;
live sign-out and Back to home confirmation remain manual.

Sign-in UX update (2026-10-07): when Auth is restored and signed out, the shopping
header Sign in button opens the Google popup directly from the original click;
no account dialog or second Continue action precedes it. Busy/restoration guards
prevent duplicate popups. The existing dialog remains for signed-in account
review or an unavailable-provider explanation. Cart and pending requests are
retained; login does not copy or assign old preview projects.

Customer and admin login entry points share `AuthNavigationService`. Only a new
user-initiated login, an SDK-observed Firebase session, completed popup operation,
and current server-confirmed admin authorization can trigger the post-login
redirect. `/admin` is the admin home route and redirects to `/admin/products`.
Email/domain eligibility alone never redirects a customer into administration.
Restoring an existing session does not pull users away from shopping. Navigation,
account changes, sign-out or disposal invalidate pending redirects; popup errors
remain sanitized and retryable. No Firebase provider, claims, rules or cloud
configuration changes are part of this UX update.

Popup recovery: Firebase SDK 12.19.0's installed close polling intentionally
allows an eight-second auth-event grace. If a browser fails to report closure,
returning to the page after leaving it starts the same eight-second grace; only
an unconfirmed UI wait is then released. Focus is not proof of closure or login.
An SDK-observed signed-in session is not canceled by that focus recovery. All
popup waits have a two-minute bound. The formerly visible Cancel sign-in control
was removed at the user's request. Automatic recovery does not change credentials,
create identity, close a window via private SDK internals, or suppress Firebase's
authoritative observer.
A later SDK session may still arrive, but an abandoned request cannot auto-redirect;
a new popup attempt is managed by Firebase's single-popup lifecycle. Old promise
results cannot change the busy/error state of a newer attempt. Retry preserves
the original retained intent and age; no cart/project writes are performed.

Verification: 207 tests across 31 files, app/spec type checks and production build
passed. Includes delayed server-authorized admin redirects, domain-only denial,
restored sessions, stale account/navigation/disposal responses, cancellation,
retry, focus recovery and bounded timeout. The user confirmed one-click Google
opening in the actual browser. Browser automation could not initialize, so the
post-change real Google redirect and recovery still need manual confirmation;
automated tests use injected provider/API doubles, not real OAuth credentials.

Approved activation update (2026-10-07): the user accepted temporary local use of
the existing Google-only Identity Platform setup and Mark-only admin bootstrap.
Local domains are now authorized and the client flag is enabled. Historical hold
statements below are superseded for this approved local verification only;
production deployment and the underlying subtype recovery remain unresolved.
Mark's verified claim, refreshed login, real supplier/product UI creates and
reload persistence now passed. See [approved activation](AUTH-ACTIVATION.md).

Update 2026-10-07: canonical supplier/product admin pages now use the private API
and server-confirmed admin authorization; they no longer expose sample lists.
Domain matching alone still cannot authorize an administrator. An operator-only
Mark claim bootstrap was executed after explicit approval and verified first
login. The unexpected Auth subtype still needs a long-term decision before
production. See [admin catalog creation](ADMIN-CATALOG-CREATION.md).

Recorded: 2026-10-06, Asia/Manila. Scope: approved Google Authentication only,
not Firestore, shared rules, purchasing, IAM changes, billing upgrades or Hosting.

## Implemented / still pending

- Registered Firebase web app `store.solar.dumaget.me`, app ID
  `1:177959719186:web:1f99f7ab52c55a889723cb`, project `dumaget-me-solar`.
- Pinned modular Firebase JS SDK 12.19.0. Browser app name `solar-storefront`.
  Public identifiers live in `solar-ui/src/app/core/firebase-config.ts`; no secret
  credentials belong there. Analytics, Storage, Firestore and Admin SDK are not
  initialized. The Admin JSON remains ignored and outside frontend/build assets.
- Session-only SDK persistence; provider observer is authoritative, including
  restored state, account changes and sign-out. The UI waits for restoration before
  opening sign-in. Google popup requests account selection, with no added scopes.
- User-initiated action only; sanitized canceled/blocked-popup, domain/provider,
  network and other failures. No automatic account linking or token logging.
- The user supplied the public OAuth support email `mark@solar.dumaget.me`.
- **Cloud setup is unresolved.** The official firebase-tools Auth-only orchestration
  request completed, but its result reports subtype `IDENTITY_PLATFORM`, not the
  approved standard `FIREBASE_AUTH`. Google (`google.com`) is enabled. This does not
  verify end-to-end Firebase Auth; no sign-in was attempted.
- Authorized domains remain only `dumaget-me-solar.firebaseapp.com` and
  `dumaget-me-solar.web.app`; `127.0.0.1`, `localhost`, and
  `store.solar.dumaget.me` were not added. `STOREFRONT_AUTH_ENABLED` remains false.
- Operation `operations/workflows/NmFhMTUwMTAtOTg2NS00ZTM5LThhYzktZDQ3YjI5NzRiMzU1`
  completed successfully. It used
  `POST firebase.googleapis.com/v1alpha/firebase:provisionFirebaseApp` for app
  `1:177959719186:web:1f99f7ab52c55a889723cb`, brand `Dumaget.me Solar`, Google
  enabled only, and the supplied email. The subtype is output-only in the inspected
  API discovery, which listed no public downgrade method. A safe self-service
  recovery path is not established; user decision or Google support may be needed.
- No billing association change was requested or submitted. Billing read returned
  HTTP 403 `SERVICE_DISABLED`, so billing/cost state could not be verified. Blaze
  was already shown in the console before this operation. No claim is made about
  charges or absence of charges.

`STOREFRONT_AUTH_ENABLED` remains false in the public config. Production shows a
disabled Google action and setup-pending explanation. Do not enable it or attempt
login until the unexpected subtype is resolved and the provider and required
authorized domains are verified. SDK/session tests explicitly inject drivers
regardless of this production setup flag.

## Local backend authentication boundary (2026-10-07)

Integration foundation: the SDK driver can now obtain an ID token for the current
Firebase identity, and the on-demand Angular API client sends it only to fixed
store API routes. Tokens are not added to application signals, profile DTOs,
local/session storage, URLs or logs. Account changes invalidate pending token and
API responses, including a switch away from and back to the same UID. The API's
new self-profile routes derive ownership from the verified token, not request
fields. The live Auth hold, disabled flags, guest-data retention and synthetic
project isolation remain unchanged. No profile is created by login or a GET.
See [Firebase integration foundation](FIREBASE-INTEGRATION.md).

The separate Fastify API bootstrap now has a lazy Firebase Admin token verifier
and `/api/v1/me` self-identity route. Both `FIREBASE_BACKEND_ENABLED` and
`FIREBASE_AUTH_SETUP_APPROVED` default false; attempting to enable the former
without the latter fails configuration. The existing Auth hold remains in force:
these flags do not authorize recovery, live sign-in or cloud changes.

When separately activated, verification uses Firebase ID tokens with revocation
checks, not a client-supplied UID or role. The server-controlled domain list defaults
to `solar.dumaget.me`; matching a verified exact domain means eligibility only.
The scaffold's admin helper additionally requires a trusted `storeAdmin === true`
custom claim. No claim is assigned here and no admin mutation endpoint exists.
The new Angular client is on-demand only; no page or route is auto-connected.
Empty policy denies every admin.

Offline tests inject verifier doubles directly; there is no environment-controlled
fake login or insecure emulator-token fallback. Default startup/health/tests do
not initialize Admin clients, inspect the private credential or call Firebase.
Live verification and permission/claim provisioning remain unverified and require
the agreed recovery/security work. See [backend bootstrap](BACKEND.md).

## Configurable admin email policy

The agreed default policy identifies eligible admin accounts by a configurable
domain allowlist, initially `['solar.dumaget.me']`. Eligibility requires a verified
email (`email_verified === true`) and an exact, case-insensitive match of the email
domain. A suffix match, wildcard, or subdomain match is not sufficient. The
`@solar.dumaget.me` convention is a policy input, not a claim that admin access is
currently granted or secured. `core/admin-access-policy.ts` implements the typed
frontend baseline (`DEFAULT_ADMIN_ACCESS_POLICY.adminEmailDomains`) and pure
`matchesAdminEmailPolicy` helper. The list is currently code-configurable, not a
connected settings screen. The helper is not wired to grants, navigation or guards.

Any frontend check based on this policy can only decide whether to show an
admin-entry affordance. It must never grant authorization. The authoritative
allowlist must be server controlled, bootstrapped by trusted deployment operators,
and subsequently configurable only by authorized admins;
missing or invalid policy denies access. Backend services must verify Firebase ID
tokens and verified email, enforce roles/claims and applicable data rules, and
ensure refreshed or revoked claims reflect policy changes. These are future
security requirements, not implemented by the frontend helper. This follows
[Firebase's verified-email/custom-claims pattern](https://firebase.google.com/docs/auth/admin/custom-claims).

No Firebase rules, shared project, IAM or admin route gates are changed here.
The previous admin-policy implementation passed build, app/spec type checks and
105 tests across 18 files, including six
policy tests covering exact domains, verified identity, configurable replacements,
lookalikes/subdomains, malformed identities and invalid/missing configuration.
Existing admin demo routes remain public, read-only fixtures and
are not secured. The supplied Google OAuth support email is
`mark@solar.dumaget.me`; the admin email domain is a separate policy value.

An Auth-only provisioning request was submitted using the official current
firebase-tools orchestration API, not an Identity Platform initialization/upgrade
API. It completed but returned unexpected subtype `IDENTITY_PLATFORM`. Further
cloud writes were stopped. No IAM elevation, billing association change,
Firestore/database change, shared rules, Hosting, or user inventory/deletion was
performed. Firestore database list remains empty. Downgrade impossibility has not
been established.

## Remaining provider setup

User decision (2026-10-07): always choose the lowest-cost suitable option. Ordinary
Firebase Authentication with Google only remains the target; this is not approval
to retain Identity Platform. Singapore (`asia-southeast1`) is the default for new
regional infrastructure, not an Auth location setting. See the
[cost/region policy](INFRASTRUCTURE.md#cost-first-backend-policy).

Resolve the unexpected Auth subtype before Auth configuration or live activation.
The safe recovery method is not yet established; consult Google support or choose
a reviewed recovery path before any further Auth mutation. Separately authorized
Firestore provisioning is complete; see [provisioning record](FIRESTORE-PROVISIONING.md).
Preserve the approved Google-only provider intent and supplied
support email. Do not assume downgrade is impossible or issue provisioning/upgrade
requests speculatively. Do not invent an OAuth client secret or place it in the
frontend. Do not commit debug/token logs.

After subtype recovery (or a separate explicit change to the user's decision), review
and merge authorized domains without removing
existing entries. Current verified entries are only
`dumaget-me-solar.firebaseapp.com` and `dumaget-me-solar.web.app`; local origins
`127.0.0.1`/`localhost` and `store.solar.dumaget.me` remain unconfigured. Configure
needed entries through supported Auth settings; domains have no scheme, path or port.
Do not add wildcard/unrelated domains or deploy the storefront over the main site.
Production CSP must accommodate actual Auth scripts/frames/connect endpoints;
review it explicitly instead of disabling security headers. Mobile browsers that
block popups may need a separately verified redirect flow; not implemented here.

## Project/data boundary

Every production Firebase identity carries `source: 'firebase'` and is denied
access to `solar.projects.preview.v1`, even a UID equal to `local-preview`.
Only explicit test fixtures exercise the retained preview workflows. There is no
runtime demo sign-in or localStorage login flag. Client guards are UX boundaries,
not server ownership enforcement. Admin demo routes remain unchanged and are not
production-authorized by this customer session.

My pages show the account explanation until the project repository and ownership
rules are implemented together. Guest catalog/list/history/export remain usable.
Pending product/list/route intent is validated in its own sessionStorage record,
never executes automatically, and is not cleared by login/logout. No guest list,
preview project, BOM, copy receipt, history, active selection or backup is assigned
to the new UID. Before enabling real project writes, obtain separate approval for
account-scoped persistence and shared backend-rule changes.

## Verification and handoff

No application code changed and no build or test suite was rerun for this cloud
provisioning/documentation update. See [provisioning outcome](AUTH-PROVISIONING-OUTCOME.md)
for the request, containment and pending user decision.

The earlier Auth-client implementation passed build and app/spec `tsc --noEmit`;
99 tests/17 files passed. SDK unit tests use
mocks, not cloud users. Coverage includes minimal identity mapping, session-only
configuration, restoration, observer authority, cleanup/late callback handling,
duplicate popup prevention, sanitized failures, sign-out errors, account changes,
UID collision denial, guarded My URLs and unchanged guest/intent storage.
No end-to-end OAuth success is claimed. Operation completion does not establish
the approved Firebase Auth subtype or a working storefront login.

Browser checks verified desktop/mobile light/dark dialog wrapping, no horizontal
overflow, loaded DM Sans/Space Grotesk, 2px panels, keyboard focus containment,
Escape and return focus. Default viewport/light preference were restored.

Once provider setup is verified, the user should complete Google sign-in themselves
and check: account name appears; reload restores this tab's session; cancellation
retains intent; Sign out updates the header; My pages and Add to project stay
blocked with the project-saving explanation; guest data remains unchanged. Signing
in can create an Auth user record in this shared project. Do not create test users
or delete existing users without approval. Confirm production domains before deploy.

Dependency audit currently reports 22 findings (2 low, 5 moderate, 14 high,
1 critical). Findings include pinned Angular/build tooling and Firebase umbrella
package dependencies (Firestore/grpc, not imported by this Auth-only browser code).
No `npm audit fix --force` or framework downgrade/upgrade was run. Resolve and
reverify compatibility before production deployment; successful tests alone do
not resolve security findings.

Primary references: [Firebase Google sign-in](https://firebase.google.com/docs/auth/web/google-signin),
[session persistence](https://firebase.google.com/docs/auth/web/auth-state-persistence),
[custom Auth dependencies](https://firebase.google.com/docs/auth/web/custom-dependencies),
[official Auth-only deploy source](https://github.com/firebase/firebase-tools/blob/main/src/deploy/auth/deploy.ts).
