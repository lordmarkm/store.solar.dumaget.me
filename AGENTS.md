# Solar ecommerce project instructions

## Subagent model selection

Always explicitly pin each subagent's model to the model requested by the user
before starting it. Do not rely on inherited defaults or reuse an existing agent
unless its model is verified to match the request. If the requested model is
unavailable or cannot be pinned, report the limitation before dispatching; do not
silently substitute another model.

## UI theme and icons

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

## Scaffold scope

The starter data is illustrative and the BOM is stored in the browser. Do not present
it as live stock, verified specifications, or real supplier terms. Admin routes are
demo views; add authorization before connecting private data or admin mutations.

Read `TODO.md` for current integration boundaries; implement future items only when
requested. Preserve the Tailwind 4 PostCSS and KTUI source/style registration.

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
prove the connected backend works. `/ready` is currently an intentional 503
placeholder, not a connected-readiness check; do not report it as ready.

## Hosting

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
