# Circuit breaker and ATS specifications

Current contract, 2026-10-14: Circuit breakers and ATS are separate top-level
categories, alongside Surge Protection Device. Protection is removed from
selection and new writes. The internal protectionType retains MCB/ATS compatibility
metadata, never name/SKU/image matching. See [category contract](PRODUCT-CATEGORIES.md).

## Data shape and units

Private product inputs/masters and public projections accept three optional fields:

```typescript
protectionType?: 'MCB' | 'ATS' | null;
mcbSpecifications?: { type: 'AC' | 'DC'; amperage: number } | null;
atsSpecifications?: { amperage: number } | null;
```

- For Circuit breakers, protectionType is MCB and mcbSpecifications
  is mandatory, including drafts. Its exact keys are type and amperage.
- type is required, case-sensitive AC or DC only. No implicit AC default and
  no combined AC/DC option. A future dual-rated model needs an explicit decision.
- amperage is rated current in amperes (A), required as a finite number greater
  than zero and no greater than Number.MAX_SAFE_INTEGER. Fractional ratings are
  allowed; blank, zero, negatives, strings, NaN and infinity are invalid. This
  representation bound is not a manufacturer-supported electrical rating range.
- ATS (automatic transfer switch) is a separate top-level category. It requires
  category ATS and atsSpecifications with exactly the amperage key, required
  on create, Save and Publish, including drafts. Its amperage follows the same
  positive finite numeric ampere bounds as MCB. Keep mcbSpecifications absent/null;
  ATS does not require an AC/DC field. No electrical compatibility or approval is implied.
- Surge Protection Device, unclassified legacy records and other categories keep both fields
  of specifications absent/null; nonnull MCB or ATS data outside its subtype is rejected.
- Legacy records without a discriminator remain valid and unclassified, even if
  their free-text name contains MCB. Do not guess or bulk backfill their ratings.
- Existing classified ATS records with missing/null atsSpecifications remain
  readable (private and historical public DTOs), with amperage unknown, but their
  next Save/Publish must provide a rating. Malformed nonnull ATS data fails closed.

Administrators choose Circuit breakers, then enter required MCB type
and Amperage (A). Create/edit validation and publication checklist mirror the
server. ATS shows required Amperage (A), with no MCB type input. Typed ratings
pass through the public DTO, catalog view and details;
private supplier URLs remain private. These are administrator-supplied facts,
not electrical approval or a compatibility calculation.

## Write/read boundaries

Current BOM policy also has a required ATS component slot; see BOM-COMPONENTS.md
version 4. It uses typed public ATS classification rather than title inference.
Customer free-text ATS has its own explicit subtype and required amperage;
that planning metadata does not modify catalog facts or certify compatibility.

parseProductInput and parseProductUpdate enforce complete MCB/ATS input. The product
repository additionally validates the merged current-plus-input working copy
before transaction writes, preventing omitted optional keys from creating
contradictions. Omission preserves previously saved specification metadata.
Switching categories clears inactive specifications explicitly with null and
supplies the new subtype's required ratings; leaving Circuit breakers/ATS clears the
discriminator and both specifications. Save never changes
the published projection; explicit Publish/republish copies the validated fields.
Unpublish does not require new input. Read-only parsers explicitly allow only
legacy missing/null ATS ratings; request parsers and merged write validation do
not use that exception. Stored malformed shapes fail closed rather
than being silently repaired. Existing unclassified historical records are not
rewritten. No Firestore rules/index/IAM or database-region change is needed.

## Evidence and maintenance

Backend implementation: backend/src/admin-catalog.ts and
backend/src/admin-catalog.repository.ts. Offline coverage:
backend/test/mcb-specifications.test.ts, including missing/invalid fields,
fractional amperage, legacy compatibility, category/subtype contradictions,
public projection and merged transactional preservation/clearing. Frontend
models, shared MCB helper, form/public-catalog/detail tests must remain aligned
with this contract. Update validation, DTOs, tests and this document together.

The user-requested SUNTREE SCB8-63 32A 2-Pole AC MCB is explicitly classified
MCB, AC, 32A from the supplied listing/user selection, not the approved
representative photo's 16A/C16 text. Its price, supplier URL and photo remain
unchanged by classification. No stock, project BOM, PO or builder rule changes
are implied. Do not infer breaker voltage, poles, trip curve, breaking capacity,
DC suitability or conductor sizing from these two required fields.

Verification on 2026-10-12: all 123 backend tests and backend check/build pass;
68 focused frontend tests and production build pass. The real authenticated
editor blocks Save with missing ratings, then persists MCB / AC / 32 A on the
existing Suntree draft (saved version 3), preserving its PHP 399.00 price, full
Shopee URL and approved representative image. Reload confirms values; the draft
was not published and no other live product or inventory record was changed.

## ATS extension (2026-10-12, initial classification evidence)

The Fanhey 2P 63A photovoltaic variant is an ATS, not an MCB, despite the sourcing
listing's ambiguous title. Set protectionType to ATS explicitly; user-confirmed
variant stays out of mcbSpecifications. Initially price and image were unknown;
the later required-amperage update below supersedes that initial contract.
Preserve its private Shopee URL, immutable SKU and draft
state. Backend input/stored/public validators and merged transaction validation
share this discriminator. Offline tests cover ATS round-trip, wrong-category and
MCB-data rejection, explicit MCB-to-ATS clearing and preservation on unrelated saves.

Verification: 125 backend tests, backend check/build, 74 focused frontend tests
and production build pass. The authenticated admin editor saves Fanhey product
fcd89df0-fb2f-442a-9f07-41f2c45d9ea3 as Protection / ATS (draft version 3),
confirmed after reload. Its immutable SKU, 2P 63A photovoltaic selection, private
Shopee URL, unset price and empty image list are unchanged. The editor's document
width equals scrollWidth (1015px), with no overflowing form/section containers.
No publication or inventory mutations were made; public ATS parsing/details were
verified by isolated tests, not by publishing this incomplete draft.

## Required ATS amperage and price update (2026-10-12)

ATS now requires atsSpecifications.amperage on every create/Save/Publish. This
supersedes initial ATS classification-only behavior. No inferred voltage, AC/DC
type or protection capability is added. Legacy read compatibility prevents
previously saved ATS drafts from making product/inventory lists unavailable.
Frontend record/public validation allows the read-only legacy exception; form
errors, publishing checklist and outbound request validation remain strict.
Tests cover positive fractional ratings, missing/invalid/extra-key values,
cross-subtype/category rejection, preservation and explicit clearing, legacy
readability, blocked legacy Save/Publish, and rated public projection. Supplier
URLs remain administration-only. No data migration or cloud configuration change.

Backend verification: all 127 offline tests and check/build pass. The authenticated
editor saves the existing Fanhey 2P 63A photovoltaic item with atsSpecifications
{amperage: 63} and amountMinor 117000 (PHP 1,170.00), draft version 4, verified
after reload. Supplier URL, SKU, draft state and empty images remain unchanged;
no publication or inventory writes. Current editor width and scrollWidth match
at 1015px, with no overflowing form/section containers.

Frontend verification: 79 focused tests across six files and production build
pass. ATS form fields, legacy edit completion, DTO input/read validation, rating
preservation, subtype clearing, public summary and details are covered. Legacy
public ATS copy is Amperage not specified; no name or title parsing supplies a value.
