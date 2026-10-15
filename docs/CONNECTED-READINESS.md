# Connected readiness

Implemented and locally verified 2026-10-09 (Asia/Manila).

GET /health returns process health without credentials or network calls.
GET /ready returns status ready with HTTP 200 only when activation is approved
and each dependency read succeeds. Otherwise it returns status not-ready and
HTTP 503, with Retry-After: 60. Both include service solar-store-api; neither
exposes raw SDK errors, credentials, account details or project configuration.
HTTP responses retain Cache-Control: no-store and the existing rate limit.

## Exact dependency checks

- Firestore: one fixed _health/readiness document read in the explicitly named
  Standard/Native store-dev database in the existing Singapore project. The
  document need not exist; no marker, heartbeat or other document is written.
- Auth: one reserved UID lookup, solar-store-readiness-probe. A user-not-found
  result is successful reachability, not a failure. No user listing, identity
  response, sign-in, custom token, claims update or provider change is performed.
- Storage: metadata of the existing dedicated product-image bucket
  dumaget-me-solar-store-images-dev. No image is uploaded, listed or deleted.

These checks establish read reachability with server credentials, not full
read/write privileges, Google-popup functionality, admin claims or policy,
image deletion/upload permissions, index completeness, stock or PO readiness.
Auth and Firestore rules/IAM remain unchanged.

## Bounded, cost-first operation

Checks run only on demand, in parallel, once per process per 60-second cache
window. Both successes and failures are cached; simultaneous callers share a
single probe. There is no timer that periodically polls cloud services.
The response deadline is 3 seconds. A cold or slow dependency can yield 503;
retry after the cache expires. Late success does not turn a timed-out check
into success for that cache window.

A timed-out probe holds the in-flight gate until all underlying dependency
calls settle. Even after cache expiry, repeated requests cannot accumulate
hung SDK probes. Closing the app resolves pending checks as unavailable and
prevents a not-yet-started probe from opening cloud clients. A permanently
hung SDK request can therefore keep readiness unavailable until restart;
it does not create an unbounded number of retries.

There are at most one document read, one Auth lookup and one bucket-metadata
request per initiated probe. Multiple processes multiply this allowance.
Continuous minute-by-minute external polling could produce about 1,440 probes
per process/day; it is not free hosting or a billing cap. No polling/monitor
service, scheduler, warm instance, paid dependency or broader permission was
provisioned. Disabled defaults never initialize credentials.

## Verification

Unit/API tests cover cache reuse/expiry, recovery, concurrent callers, synchronous
errors, timeout, hung-call gating, close, disabled no-initialization, each failed
dependency and sanitized HTTP results. Live read-only checks against the approved
local configuration succeeded for all three dependencies. Final /ready and
/health returned 200; direct and proxied public catalog returned 200, and
unauthenticated account access returned 401.

Startup initially exceeded the deadline while SDK dependencies loaded; the next
expired-cache check succeeded. Readiness intentionally does not mask this with
a process-health-only success.
