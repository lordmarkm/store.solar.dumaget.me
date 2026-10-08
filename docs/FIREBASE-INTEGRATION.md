# Firebase Auth / Firestore integration foundation

Recorded: 2026-10-07, Asia/Manila.

## Current boundary

This is the first local integration slice, not live activation. Existing modular
Firebase Google sign-in feeds provider-owned identity; an on-demand Angular API
client obtains a fresh ID token, and Fastify verifies it with Firebase Admin
before selecting a self-owned Firestore profile. Both backend activation flags
and `STOREFRONT_AUTH_ENABLED` remain false. During the initial local slice, no user sign-in, credential loading,
database creation, cloud write, domain edit, IAM/billing change or deployment was
performed. `/ready` remains 503; `/health` is process-only.

Subsequent explicit provisioning approval created `store-dev` and released its
API-only deny-all rules. Standard / Native / Singapore metadata, 26 local denial
tests, deployed-source equality and a live anonymous 403 are verified. No live
documents were written; runtime activation remains disabled. See the
[provisioning record](FIRESTORE-PROVISIONING.md). The earlier empty inventory is
superseded; Auth remains unchanged.

Current cloud checks show:

- Shared project: `dumaget-me-solar`; only database `store-dev`, Standard / Native /
  `asia-southeast1`; deletion protection enabled, PITR disabled.
- Auth subtype: `IDENTITY_PLATFORM`; Google provider enabled.
- Authorized domains: only `dumaget-me-solar.firebaseapp.com` and
  `dumaget-me-solar.web.app`.

The user has selected Standard edition, Native mode and regional Singapore
(`asia-southeast1`) for `store-dev`, with lowest-cost suitable options as the
standing policy for new services. Creation and direct-client rule deployment are
complete; authenticated application activation and server IAM review are not.
Ordinary Firebase Authentication with Google only remains the target. This
cost-first instruction does not accept the unexpected Identity Platform subtype;
safe Auth recovery is still unresolved. See the
[cost/region policy](INFRASTRUCTURE.md#cost-first-backend-policy).
The selected named database `store-dev` does not receive Standard's free quota.
See [Firestore pricing](https://cloud.google.com/firestore/pricing) and the existing
[Auth hold](AUTH-PROVISIONING-OUTCOME.md).

## Request/data flow

```text
Firebase Auth session (browser SDK)
  → on-demand ID token → fixed /api/v1/me* routes
  → Admin token verification (including revocation)
  → server-owned UID → customers/{base64url(uid)} in named store-dev
```

The browser does not import the Firestore SDK for this slice. It never supplies
the owning UID, account email, admin flags or storage path in a profile write.
Admin SDK bypasses Firestore Security Rules, so trusted API authorization is
mandatory; naming a database alone does not secure it. Subsequent provisioning
added named-only deploy configuration and deny-all direct-client rules. Before
live application activation, review server IAM and the API boundary separately.

`FirebaseGateway` lazily selects `getFirestore(app, 'store-dev')`, retains one
client, and terminates it when the API closes. The disabled runtime never opens
credentials or initializes services. No `(default)` fallback is permitted.

## Profile API and document contract

| Endpoint | Behavior |
| --- | --- |
| `GET /api/v1/me` | Verified self identity plus server-calculated admin eligibility/authorization |
| `GET /api/v1/me/profile` | One self-document read; `{profile: null, version: null}` if absent, no automatic write |
| `PUT /api/v1/me/profile` | Explicit full editable-field save with expected-version transaction |

Documents reside at `customers/{base64url(UTF8(uid))}`. Encoding keeps even UIDs
containing slash/dot characters in a single safe document segment. The stored
`customerId` is always the original verified Firebase UID. No user-list endpoint
or cross-owner query exists.

Internal document:

```text
schemaVersion: 1
version: positive safe integer
profile:
  customerId, displayName, email, createdAt, updatedAt
  optional phone, companyName, contractorDetails
```

The HTTP profile envelope contains only `profile` and `version`.
The save input permits only `expectedVersion`, `displayName`, and the three
optional fields. `expectedVersion: null` creates only if absent; a positive
version updates only the current version. Missing/invalid tokens return 401,
unverified/missing account email prevents saves (403), malformed writes return
400, stale saves return 409, and inaccessible/corrupt data fails closed.

Display name is trimmed/nonempty and at most 100 characters; phone 80, company
120, contractor details 2000. Null/empty/omitted optional fields clear them on a
full replacement. Owner/email/server timestamps are not editable; `createdAt`
is preserved, and the version increments inside the transaction. Unexpected
fields (including role/claim metadata), foreign ownership, unsupported schemas
and invalid stored timestamps are rejected rather than silently overwritten.
The profile document is reserved for this schema, not shared preferences/projects.
Its concurrency version is unrelated to commercial PO revisions or BOM snapshots.

Each read targets one document; saves use a bounded three-attempt transaction.
No collection scans, realtime listeners, composite indexes, automatic login-time
writes, paid infrastructure or PO/product snapshot changes are added.

## Angular boundary

`AuthSessionService.idToken()` asks the SDK driver for the current Firebase user;
synthetic/test sessions are ineligible. A session revision guards token fetches
and HTTP responses against account changes, sign-out, and A→B→A races. Tokens
are used only transiently in Authorization headers, never persisted in app data
or sent in URLs. No global interceptor sends credentials to unrelated hosts.

`StoreApiService` exposes on-demand identity/profile/save methods. Requests use
fixed relative store API routes, omit cookies, refuse redirects, disable caching,
and have a bounded timeout. Responses are validated before use and errors are
sanitized; writes have no automatic retry. No component calls these methods yet.
Real Firebase sessions still cannot open the synthetic project repository; login
does not adopt preview/guest data or replay pending Add-to-project intent.

Angular's development proxy forwards only `/api/v1/**` to the loopback API at
`127.0.0.1:4400`. Restart `npm start` after changing proxy configuration. Production
API routing, compute deployment and Hosting rewrites remain separate work; do not
publish the API via the main site's Hosting target or assume the proxy is deployed.

## Activation checklist

1. Establish safe recovery to standard Firebase Auth; retain Google-only intent.
   Do not silently accept Identity Platform or use destructive/undocumented reversal.
2. Complete: provisioned `store-dev`, Standard / Native / Singapore
   (`asia-southeast1`). Do not recreate it, create `(default)` or add paid extras.
3. Complete: named-only deny-all rule deployment and representative denial tests.
   Still review server-owned schemas and least-privilege runtime permissions;
   Admin SDK access bypasses rules and is not validated by this deployment.
4. Merge approved local/storefront authorized domains, preserving existing entries.
5. Privately configure trusted server credentials (never browser/build assets).
6. Verify cloud configuration and backend connectivity before enabling flags.
7. Have the user complete Google login; verify ID-token/owner isolation end to end.
8. Connect profile UI, then build account-owned projects/BOM persistence separately.

Do not assign admin custom claims, migrate old local data, enable paid optional
services, or relax authentication/rules as a shortcut. Live OAuth, emulator SDK
flows, actual Firestore transactions, IAM, rules and cloud readiness are not yet
verified by the offline tests.

## Verification (2026-10-07)

- Backend source/test type checks, compilation and 32 offline tests pass. Coverage
  includes verified self access, protected disabled defaults, field/owner tampering,
  encoded UID path safety, malformed/foreign records, version conflicts, bounded
  transaction options, and sanitized failures. Firestore adapter tests use a test
  double; they do not establish actual emulator/cloud transaction correctness.
- Angular production build, app/spec strict type checks and 172 tests across
  26 files pass. New coverage includes SDK token ownership, A→B→A invalidation,
  fixed-path credential transport, malformed responses, captured save input,
  timeout/abort behavior, and no automatic write retries. Existing project/guest
  access and data-retention tests remain passing.
- No cloud settings were mutated; dependency versions and lockfiles are unchanged.
- After restarting the scoped Angular dev server, HTTP checks confirm catalog
  200, proxy `/api/v1/me` and profile GET/PUT 503 `BACKEND_DISABLED`, unknown API
  route 404, API health 200 and readiness 503. The proxy returns API JSON rather
  than Angular's HTML shell. No authenticated or cloud write was attempted.
