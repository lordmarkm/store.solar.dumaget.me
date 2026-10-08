# Approved local Auth activation — 2026-10-07

The user explicitly approved temporary use of the existing Google-only
Identity Platform setup, local authorized-domain configuration, and granting
the store administrator claim only to verified `mark@solar.dumaget.me`.
This resolves the activation hold for local verification, not the underlying
subtype mismatch or production deployment. Standard Firebase Auth remains the
preferred long-term/cost-first target; no downgrade was attempted.

## Changes and verified boundaries

- Existing shared project remains `dumaget-me-solar`. Auth subtype remains
  `IDENTITY_PLATFORM`; Google is the only listed enabled provider; MFA is disabled.
- Merged `localhost` and `127.0.0.1` into authorized domains, preserving
  `dumaget-me-solar.firebaseapp.com` and `dumaget-me-solar.web.app`.
  The update mask targeted only `authorizedDomains`; a fresh GET verified all
  other configuration fields were unchanged. No storefront production domain
  was added and no Auth provisioning/deploy command was rerun.
- Enabled `STOREFRONT_AUTH_ENABLED` in local source. Browser verification shows
  the enabled Google sign-in action on `/admin/products/new`. This is not a
  Hosting deployment or verification of production OAuth/CSP settings.
- Approved server/tooling use of the existing ignored Admin JSON via ADC. The
  SDK loads it privately; its contents are never printed or copied into frontend
  assets, source modules, logs or builds. No IAM permissions were added.
- Fresh database metadata verifies named `store-dev`: Standard, Native,
  `asia-southeast1`, deletion protection enabled, PITR disabled. Two bounded
  Admin SDK queries verified supplier/product read access and empty collections;
  no live documents were seeded by these checks. Existing client deny-all rules
  remain unchanged. Write access is not proven by a successful read.
- No billing, API enablement, Hosting, DNS, email/phone/anonymous providers,
  advanced paid features, indexes, rules, unrelated users or databases changed.

The existing Google Cloud login needs the request-only quota header
`X-Goog-User-Project: dumaget-me-solar` for Auth configuration calls. This is not
a billing-association or persistent CLI setting change.

## Completed local verification

The approved Mark account did not exist at the first bounded account lookup.
The user completed Google sign-in themselves; no user was pre-created.
The trusted operator script then verified the enabled, verified account and
granted `storeAdmin: true` only to `mark@solar.dumaget.me`. The
bootstrap merges other custom claims rather than overwriting them. Refresh the
token by signing out/in after the grant. Domain matching alone still cannot grant
admin access, and no wildcard/domain-wide claim assignment is authorized.

The local API was restarted with `FIREBASE_BACKEND_ENABLED=true` and
`FIREBASE_AUTH_SETUP_APPROVED=true`, project/database pins unchanged, loopback
binding, exact local CORS, and ADC path supplied only to its process environment.
Checked-in defaults remain disabled. Direct and proxied requests without bearer
tokens returned 401 for `/me`, `/admin/products`, and `/admin/suppliers`; `/health`
returned 200. Verified unauthorized users must return 403. `/health` is process-only and
`/ready` still returns `BACKEND_NOT_READY` until connected readiness is implemented.

The user signed out/in to refresh the browser token after the claim grant.
The real admin UI then created `UI verification supplier 2026-10-07` and
`UI verification solar panel 2026-10-07` (SKU `UI-VERIFY-20261007`). Both remained
visible after independent full page reloads. The product selected the newly
persisted supplier and displayed PHP 1,234.56 with `draft` state.

A fresh bounded Admin SDK check against named `store-dev` verified the supplier
exists and is active, exactly one matching SKU exists, the product is a draft,
the supplier ID is linked correctly, the price is exactly `123456` centavos in
`PHP`, both records' server-created actor IDs match the approved account, and
both minimal audit records exist. No default database was queried. These are
real browser/API/Firestore writes, not fixtures or emulator records.

The two clearly labeled development records and their transactional metadata
remain in `store-dev`; no cleanup/deletion was performed. They are not real
trading data, and the product was not published. Frontend on port 4300 and the
loopback API on port 4400 remain running. Customer catalog fixtures, inventory
preview, publishing, edit/delete workflows and connected readiness are separate
unfinished work; no production deployment is implied.

Regression verification after activation: frontend app/spec type checks,
189 tests across 30 files and production build passed; backend check/build and
43 tests passed. No source changes were made by the verification worker.

The published Auth social-provider tier includes no-charge usage up to 50,000
monthly active users, followed by usage pricing. Shared-project usage and actual
billing remain unverified; using Google only does not guarantee zero charges.
The named Firestore database has its own usage costs and no Standard free quota.
No budget alerts or monitoring were enabled by this activation.

References: [Identity Platform configuration](https://docs.cloud.google.com/identity-platform/docs/reference/rest/v2/Config),
[Auth pricing](https://cloud.google.com/identity-platform/pricing),
[original Auth incident](AUTH-PROVISIONING-OUTCOME.md),
[admin creation contract](ADMIN-CATALOG-CREATION.md).
