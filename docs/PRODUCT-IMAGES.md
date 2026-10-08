# Product images

User decision, 2026-10-08: use Google Cloud Storage's eligible US free tier for
product pictures, and support pasting pictures from the clipboard in admin forms.
This is an exception to the Singapore regional default for image storage only.
Firestore remains Standard / Native / store-dev in Singapore. Website deployment
continues to follow the main site's Firebase Hosting strategy.

## Storage and public-access boundary

- Project: dumaget-me-solar.
- Dedicated bucket: dumaget-me-solar-store-images-dev.
- Region: us-west1 (Oregon); regional Standard storage, uniform bucket-level access.
- New bucket soft delete is disabled; no versioning, Autoclass, retention lock,
  paid CDN, function, transformation subscription or additional database is added.
- Only optimized product pictures belong here. Never upload service-account keys,
  credentials, personal documents, private supplier terms or purchase-order files.
- Bucket creation succeeded. After the safety review flagged draft-image exposure,
  the user explicitly approved public access including drafts. The bucket has
  allUsers / roles/storage.legacyObjectReader: anonymous object reads, without
  anonymous listing or writes. No existing buckets were changed.
- Uploads are server-only and require the existing verified email/domain policy
  AND trusted storeAdmin claim. There are no anonymous/browser bucket writes,
  Firebase client Storage SDK, new Auth providers, shared security-rule changes,
  default Firebase bucket registration or project-wide IAM grants.

Every image uploaded to this dedicated bucket,
including unused/draft images, is accessible by its URL. Only product records
that have been explicitly published appear in the public catalog. Product
publication is not a secrecy boundary for image bytes in a public-image bucket.
If that policy changes, implement a reviewed private-preview and published-only
delivery design rather than assuming that unpublishing revokes image URLs.

## Upload workflow

Admin New product and Edit product have a reusable picture field. Choose a file,
or focus its paste area and press Ctrl+V with an image copied to the clipboard.
The ordinary paste event supplies clipboard image data; no persistent Clipboard
API permission is requested. Pasting text into other inputs stays normal.

- Accept JPEG, PNG and WebP; maximum input 5 MiB, one frame, 24 megapixels.
- Up to six unique images per product; the first is the primary picture.
- SVG, GIF/animation, remote URLs, forged MIME declarations and malformed images
  are not supported. The backend decodes the bytes and checks the actual format.
- Backend generates a detail WebP bounded by 1600 x 1600 and a thumbnail bounded
  by 400 x 400, retaining aspect ratio and not enlarging smaller originals.
- EXIF/location/source metadata and original files are not retained.
- Upload failure does not clear product text or automatically save/publish it.
  Save/Publish stays blocked while uploads are pending.
- Removing a picture changes the form only. After a successful Save, removed
  stored pictures are cleanup candidates; unreferenced files are deleted.
  Pictures still used by another product, a public projection or a historical
  hold are retained. Failed/cancelled Saves cannot trigger this deletion.
  Private changes still reach the public listing only after explicit republishing.
- At least one picture is required for Publish/Republish; incomplete drafts may
  still be saved. Existing historical public records without pictures remain
  readable with an honest fallback until their next republish.

Customer cards and compact Cart/BOM rows use thumbnails. Product details show
the full-size picture with selectable gallery thumbnails. Public views retain
the green/mint angular-card theme; administration retains its blue theme.

## API and model

POST /api/v1/admin/product-images accepts the raw image bytes and matching
Content-Type. Authentication runs before buffering/decoding. Image bodies are
limited to 5 MiB; other JSON routes retain the existing 64 KiB limit. The upload
route has its own per-process rate limit, and processing concurrency is bounded.

Successful response: { image: ProductImage }. ProductImage is the exact five-field
contract id, url, thumbnailUrl, width, height. The identifier is a lowercase
SHA-256 of versioned source bytes; the canonical URLs are:

    https://storage.googleapis.com/dumaget-me-solar-store-images-dev/products/{id}/detail.webp
    https://storage.googleapis.com/dumaget-me-solar-store-images-dev/products/{id}/thumb.webp

Both dimensions refer to the normalized detail image. Paths and hosts are
server-controlled. Creates/updates accept optional images: ProductImage[]; omission
preserves saved images on update, while [] clears the working copy.
The server validates canonical paths, bounded dimensions, duplicates and maximum
count, and checks both stored objects and their pipeline/dimension metadata before
attaching supplied pictures. Public projections explicitly include only the
safe image descriptors, not upload identities or supplier details.

Versioned content-derived paths plus generation-match-zero writes prevent
overwriting earlier assets and make retries/identical uploads reusable. Output
uses public,max-age=31536000,immutable cache headers. Post-Save deletion and
bounded orphan cleanup are implemented as described below.
This feature does not create ProductSnapshots or purchase-order revisions.

## Deletion after Save (2026-10-09)

Product create/edit/publish transactions enroll and touch productImageAssets
ledgers for attached images. Removed working/public images are queued in the
same committed transaction, then prioritized for cleanup after Save. Referenced
images are never eagerly deleted by a form Remove click.

Cleanup claims the ledger transactionally and checks bounded private/public
image-reference queries, upload leases, and productImageRetentions/{imageId}.
Attach transactions touch the same ledger and reject deleting/deleted assets,
fencing concurrent reuse. Reupload is possible after deletion completes.
Deletion is restricted to the dedicated bucket's two canonical WebP paths;
pipeline/dimension metadata is checked and deletes use the observed generation.
404 is idempotent. Partial failure retains a tombstone and retries after five
minutes. A confirmed catalog commit is still a successful Save even when storage
cleanup is temporarily unavailable; queued work survives process restart.

Unused uploads get a 24-hour grace period, including abandoned forms and newly
uploaded pictures removed before being saved. An upload has a five-minute lease.
The next admin product Save/publication operation opportunistically sweeps up to
six due jobs in addition to its own removed pictures. Authenticated admins may
also POST /api/v1/admin/product-images/cleanup with no body/query. It accepts a
bounded best-effort sweep; it does not certify that all pending files are gone.
There is no paid timer, Cloud Function or continuously running scheduled worker:
without further admin activity, cleanup waits until the next operation.

Historical image retention is a prerequisite of future locked-PO implementation.
That transaction MUST enroll/touch each asset, reject deletion tombstones and
create immutable productImageRetentions holds BEFORE exposing a locked snapshot.
Holds are not automatically released. This slice tests that hold protection;
it does not implement PO locking or promise historical assets absent those holds.

Bucket soft delete/versioning are disabled, so physical deletion cannot be
recovered from this bucket. Immutable browser/CDN caches may keep public copies
for their cache lifetime; deletion/unpublication cannot revoke those cached URLs.
No preexisting live product images were deleted during implementation verification.

## Cost limits

The eligible US Cloud Storage free tier includes 5 GB-month Standard storage,
5,000 Class A operations, 50,000 Class B operations and eligible North American
outbound transfer up to 100 GB/month (excluding China and Australia). These are
usage allowances, not a guaranteed zero bill or hard spending cap. Account-wide
eligible usage can consume them; traffic, upload/validation requests and retained
unused pictures must be monitored. Thumbnail generation runs in the existing
API process, not a separate paid image-processing service.

If the API is eventually hosted in Singapore, transfers of originals from the
API to the US bucket and cross-region validation/delivery designs need a fresh
cost review. Keeping a US image bucket does not move compute or Firestore.

References:
[Cloud Storage pricing](https://cloud.google.com/storage/pricing),
[public data and metadata access](https://cloud.google.com/storage/docs/access-control/making-data-public),
[Admin Storage API](https://firebase.google.com/docs/storage/admin/start).

## Verification

Backend type checks, build and 69 unit/API tests pass. Frontend app/spec type
checks, production build and 68 focused image/catalog/API/editor/dialog tests pass.
Synthetic clipboard-event tests cover image paste, ordinary text paste, failures,
session changes and six-file host-binding updates. Gallery selection is covered.
The preceding full frontend run had 282 passing tests and the same 9 existing
project/Auth-flow failures; it preceded the additional passing gallery test.
Do not describe the entire frontend suite as passing.

Isolated Firestore emulator image lifecycle and publication checks pass, including
create/publish/reload, idempotent retries, private edits, omitted-image preservation,
empty-image publication rejection and republishing. No live catalog records were
created for these checks. API health and direct/proxied catalog reads return 200.
Live admin paste/upload and public picture display still need UI confirmation.

Live bucket verification passed using the existing server credential: upload,
identical-upload deduplication, anonymous HEAD 200 for both WebPs and immutable
cache headers. Only two newly generated 16 x 16 random probe assets were written
then removed. No product records, supplier records or existing images changed.
Bucket metadata confirms regional US-WEST1 / STANDARD, uniform access and
soft-delete retention zero. Public binding is get-only; no public listing/writes.
Browser helper initialization failed twice with helper_unknown_error; do not
describe real clipboard/desktop/mobile interaction as visually verified.
