# Product categories

Contract updated 2026-10-14 (Asia/Manila).

Selectable categories: Panels, Inverters, Batteries, Mounting, Circuit breakers,
Surge Protection Device, ATS, PV Isolator, and MCCB. Protection is no longer selectable, a filter
value, or accepted for new catalog writes. Uncategorized means classification
is absent, not a new category.

## Forms and ratings

Circuit breakers use the existing MCB contract: required AC/DC type and positive
finite amperage, including drafts. ATS requires positive finite amperage and must
not carry MCB ratings. Selecting these categories sets the retained internal
MCB/ATS discriminator; there is no Protection subcategory selector. Changing
category clears inactive ratings explicitly. Unrelated saves preserve ratings,
pictures, sourcing URLs and prices. Surge Protection Device, PV Isolator and MCCB have no invented
ratings or defaults. See [MCB/ATS specifications](MCB-SPECIFICATIONS.md).

## Legacy records and queries

Read adapters map explicit legacy Protection/MCB to Circuit breakers and
Protection/ATS to ATS. Untyped Protection remains unclassified: never guess SPD
from a title or picture. Existing BOM metadata stays readable. No collection
rewrite, republish, product deletion or historical PO-snapshot change is implied.
Future saves use the new vocabulary and existing version/retry safeguards.

Admin, inventory and component filters stay API-side before bounded cursor
pagination. Typed legacy records remain eligible for their mapped category;
no browser-only filter or collection download. Cursor scope retains the filter.
Admin/inventory ATS and Circuit breakers use existing category/SKU indexes with
category in [selected category, Protection]. Normalize and match candidates before
returning a page, with at most 50 candidates per request. Resume after the last
scanned record; a matching lookahead is not skipped. A scan segment may be empty
with a continuation cursor. Public filters use subtype equality and document-ID
ordering to include explicitly typed legacy records without new composite indexes.
No cloud index/rules/IAM/hosting/database-region change is authorized.

## BOM components

ATS, Circuit breakers, Surge Protection Device, PV Isolator and MCCB have separate slots. ATS is
required for every configuration under the existing UI policy; inverter and
hybrid-battery requirements do not change. Circuit breakers, SPD, PV Isolator and MCCB stay optional
under this policy, not electrical approval. Independent lines and Add / Add
another actions remain. Free-text ATS uses componentCategory ATS and required
amperage; old explicit Protection/ATS metadata is retained for compatibility.
Untyped legacy Protection lines appear under Other requirements.

The future staged builder may retain its internal protection group identifier,
mapped to the five explicit electrical categories, not a removed catalog filter.
PV Isolator and MCCB are independent categories, not MCB/ATS subtypes. Do not
infer them from legacy names or add MCB ratings as a requirement. New filters
use ordinary indexed category equality; no new index or migration is needed.

## Maintenance

Keep frontend vocabulary/DTOs/forms, backend validation and query mappings,
component grouping, tests, AGENTS.md and [BOM policy](BOM-COMPONENTS.md) aligned.
