# Backend bootstrap

Local activation update (2026-10-07): temporary existing Google-only Auth usage,
local API activation and Mark-only bootstrap are now human-approved. Defaults
remain disabled; the approved running process supplies its flags/ADC privately.
Real login, trusted claim and supplier/product UI write/reload verification
passed against named `store-dev`. See
[activation record](AUTH-ACTIVATION.md); older activation-hold statements below
are superseded only within this approved local scope.

## Scope and current state

Update 2026-10-07: protected supplier/product create and paginated list APIs,
connected admin forms and an operator-only Mark bootstrap are now implemented.
See [admin catalog creation](ADMIN-CATALOG-CREATION.md) for the authoritative
contract and verification boundary. Earlier bootstrap-only statements below are
historical. Approved local Auth activation, Mark's claim and live UI persistence
are verified; production activation and underlying subtype recovery remain pending.

The Node.js/TypeScript Fastify API is bootstrapped under `backend/` and has its own lockfile, separate from the Angular application. The first Auth/Firestore integration slice adds protected customer-profile routes; live activation remains on hold. See [integration foundation](FIREBASE-INTEGRATION.md). Use a supported Node.js runtime at least 22.9 (for the optional env-file flag); validation uses the locally installed Node 26.4. From the repository root, the available scripts are:

| Script | Purpose |
| --- | --- |
| `npm run api:dev` | Run the API for local development |
| `npm run api:build` | Compile the API |
| `npm run api:test` | Run API tests |
| `npm run api:start` | Start the built API |
| `npm run api:check` | Run the API checks |

Install the backend dependencies with `npm ci --prefix backend`.

The server binds to loopback at `127.0.0.1:4400` by default. `GET /health` reports process status only. `GET /ready` deliberately returns `503 BACKEND_NOT_READY`: live activation and connected readiness probes remain pending. A healthy process returning `200` from `/health` does not establish cloud readiness.

`GET /api/v1/me` is protected by a Firebase bearer ID token. `GET` and `PUT /api/v1/me/profile` use the same verified identity to select one customer-profile document in `store-dev`. All protected routes return `503` while the Firebase backend feature is disabled. There is no product/project/PO CRUD API or `/admin` endpoint.

Security defaults include Helmet headers, an exact CORS origin allowlist, a 64KiB
body limit, bounded HTTP timeouts, and an in-memory limit of 60 requests/minute/IP
on registered routes. The limiter is per process, not a distributed/global quota.
The local server does not trust forwarded client IPs; review proxy and edge limits
before any public deployment. No Redis or always-on external service is added.
Logs use route patterns/statuses, not raw URLs, request bodies, tokens or identities;
error responses are sanitized and include a request ID.

The current default configuration is:

```text
FIREBASE_BACKEND_ENABLED=false
FIREBASE_AUTH_SETUP_APPROVED=false
FIREBASE_PROJECT_ID=dumaget-me-solar
FIRESTORE_DATABASE_ID=store-dev
ADMIN_EMAIL_DOMAINS=solar.dumaget.me
```

The domain setting identifies eligible email domains only; it does not assign roles or grant administrative authority. The scaffold's `requireAdmin` helper additionally requires the trusted `storeAdmin === true` custom claim; no claim is assigned here and no admin mutation endpoint exists. An empty domain list denies every admin. Changing this server policy takes effect on subsequent requests; tokens are verified with revocation checks when activated.

Both activation flags are false by default. Enabling the backend without the explicit Auth-setup acknowledgement fails configuration validation. These flags are operator safeguards, not permission to bypass the documented activation hold. Backend credentials may use Application Default Credentials through `GOOGLE_APPLICATION_CREDENTIALS` only after approved activation. With the feature disabled, startup does not initialize Admin SDK clients or load credentials. Emulator-mode environment overrides are rejected for now. Do not add an insecure token-verification fallback.

Copy `backend/.env.example` to a private `backend/.env` only when customizing local process settings; the example's safe defaults need no credentials. Never copy the Admin JSON into `backend/`, browser assets or the build output. Health/startup/tests neither read the private key nor make cloud requests by default. The Firestore adapter is lazy and explicitly selects `getFirestore(app, 'store-dev')`; the profile repository receives it only after protected-route activation and token verification. Default disabled routes never invoke it.

Authentication remains on hold. Angular now has an on-demand ID-token/API client and a development proxy, but no page automatically loads/saves a profile, and project entry points stay gated. This foundation does not deploy databases, rules, indexes, or media workflows, and it does not implement purchase-order workflows. ID-token handling and repositories are verified with local test doubles only; live OAuth, IAM and datastore permissions remain unverified. A fresh read-only metadata check on 2026-10-07 still returned no Firestore databases, so no instance edition was available to inspect.

## Cost and data planning

Subsequent authorized provisioning created `store-dev` and released its named-only
deny-all rules. Live metadata is Standard / Native / Singapore, with deletion
protection on and PITR off; local rule-denial tests and a live anonymous 403 are
verified. No documents were seeded, credentials loaded or runtime flags enabled.
The empty inventory above is the pre-provisioning foundation baseline, not current
state. Server IAM and authenticated API connectivity remain unverified. See the
[provisioning record](FIRESTORE-PROVISIONING.md).

Use Firestore Standard / Native mode in Singapore (`asia-southeast1`) for named
`store-dev`, as selected on 2026-10-07. Always choose the lowest-cost suitable
service option; higher-cost exceptions require explicit approval. Prefer colocated
on-demand regional compute when it is eventually requested. Region/edition are
provisioning settings, not runtime SDK flags; these choices do not create or move
a database. See the [cost/region policy](INFRASTRUCTURE.md#cost-first-backend-policy).

Use local tests and inject a fake token verifier in tests only; there is no environment-controlled fake-sign-in mode. Named `store-dev` does not receive Standard edition's free quota. Review current regional pricing and usage limits before activation. Actual emulator startup/configuration is a future slice; this bootstrap provides offline injected tests, not a running emulator.

The dependency lockfile pins the bootstrap toolchain independently of Angular.
A targeted override replaces `gaxios@6.7.1`'s transitive `uuid` with `11.1.1` to
address [GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq).
The installed gaxios caller uses the compatible CommonJS `v4` export. No Firebase
packages were force-upgraded. Recheck this override on upstream SDK updates and
before adding Storage/media integrations; those runtime flows are not live-tested.

Before implementing CRUD, document the complete data schema and the owner/access policy for every resource. Any future protected administrative writes need trusted role and policy validation; an email-domain match alone is not authorization.

The proposed next business slice is catalog CRUD with a public read projection. It must include backend token validation, role and policy checks, concurrency handling, and audit records. The self-profile foundation is implemented separately; account-owned projects/BOMs and their UI remain pending. Purchase-order lock and status behavior remains to be defined.

## Bootstrap verification (2026-10-07)

- Backend source/test type checks and production compilation passed.
- Root `api:check`, `api:build` and `api:test` commands also passed in the actual
  repository after a locked install. The compiled server's local HTTP smoke checks
  returned health 200, readiness 503 and disabled identity access 503; configured
  local CORS and `Cache-Control: no-store` were confirmed.
- 23 offline tests passed: HTTP health/readiness, disabled access, bearer validation,
  eligible-versus-authorized admin policy, error sanitization, CORS/headers, rate
  limiting, configuration bounds and lazy service lifecycle.
- Dependency installation uses `--ignore-scripts`. The runtime dependency audit
  reported zero advisories after the targeted uuid override, including after the
  actual repository install; repeat audits before deployment.
- No live OAuth, Auth recovery, credential loading, datastore access, mutation,
  emulator startup or deployment was tested or enabled.

## Related project documentation

- [Infrastructure](INFRASTRUCTURE.md)
- [Authentication](AUTHENTICATION.md)
- [User-facing plan](USER-FACING-PLAN.md)
- [Admin product-management plan](ADMIN-PRODUCT-MANAGEMENT-PLAN.md)

## Official Firebase references

- [Set up the Firebase Admin SDK](https://firebase.google.com/docs/admin/setup)
- [Manage data with multiple Cloud Firestore databases](https://firebase.google.com/docs/firestore/manage-databases)
- [Verify ID tokens](https://firebase.google.com/docs/auth/admin/verify-id-tokens)
