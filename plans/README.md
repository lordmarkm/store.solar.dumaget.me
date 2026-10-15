# Project plans

Canonical home for product roadmaps and future implementation plans.
Consolidated 2026-10-10 (Asia/Manila). Planning is not a claim that a feature is
implemented, and does not authorize cloud provisioning, live test data or deployment.

## Current priority

Build the customer project Build Assistant before purchase-order implementation.
The accepted interaction is a category-based component table, not a card list
with a permanent summary sidebar. Start with the first five tasks in the
[dedicated builder plan](PROJECT-BUILDER-PLAN.md#first-five-implementation-tasks).

## Canonical plans

| Plan | Scope | Current boundary |
| --- | --- | --- |
| [Project builder](PROJECT-BUILDER-PLAN.md) | Multi-item category picker, suggestions, compatibility, reviewed BOM append | Foundation contracts/audit/pure validator/doc gate implemented; UI/picker/apply pending |
| [User-facing website](USER-FACING-PLAN.md) | Shopping/My pages, Projects/BOMs, favorites/profile and later customer POs | Projects/BOM management is account-backed; builder is the next priority |
| [Admin product management](ADMIN-PRODUCT-MANAGEMENT-PLAN.md) | Product/supplier management, public content, specifications, media and later commercial features | Catalog/publication/images/supplier operations are implemented; older preview notes are historical |

The two existing standalone roadmaps were moved from docs/ without deleting
their implementation history. Old docs/ paths are forwarding notes, not duplicate
plans. The builder's accepted [mockup](mockups/solar-build-picker.html) is archived
with this plan; see [mockup notes](mockups/README.md) for its prototype limitations.

## Implementation contracts and remaining work

Keep these records in docs/: they describe implemented behavior, security/cost
contracts and operational evidence, not replacement copies of the plans above.

- [Account Projects](../docs/ACCOUNT-PROJECTS.md): owned editable BOMs, management,
  concurrency and bounded queries; real-browser verification remains separate.
- [Backend](../docs/BACKEND.md) and [integration](../docs/FIREBASE-INTEGRATION.md):
  API setup and boundaries. Builder API/specification gaps belong to the builder
  delivery plan; do not repeat the obsolete pre-activation next-slice prose.
- [Inventory](../docs/INVENTORY-MANAGEMENT.md#verification-and-remaining-tasks):
  implemented physical stock operations and remaining supplier/public availability,
  receipt/commitment/fulfillment and policy work. BOM planning never moves stock.
- [Admin contracts](../docs/ADMIN-CATALOG-MANAGEMENT.md),
  [publication](../docs/PRODUCT-PUBLICATION.md),
  [panel fields](../docs/PANEL-SPECIFICATIONS.md) and
  [product images](../docs/PRODUCT-IMAGES.md): authoritative existing capabilities.
- [Infrastructure](../docs/INFRASTRUCTURE.md#deployment-isolation): separate
  storefront Hosting deployment, shared-project safety and cost/region policy.
- [Authentication](../docs/AUTHENTICATION.md) and
  [approved local activation](../docs/AUTH-ACTIVATION.md): identity boundaries and
  production decisions. Local operation is not production approval.

## Maintenance

Builder rules require maintained [AI-consumable specifications](../docs/builder-rules/README.md)
and a [machine-readable index](../docs/builder-rules/index.json), updated together
with code/tests. These are contracts in docs/, not additional product roadmaps.

- Add new standalone plans here and link them from this index. Keep specifications,
  runtime contracts, provisioning outcomes and test evidence in docs/.
- [TODO.md](../TODO.md) remains the root implementation tracker, linking canonical
  plans rather than duplicating them. Dated latest-status entries take precedence
  over older historical checklists; unchecked historical entries can be stale.
- Record accepted decisions, open policies, dependencies, explicit next tasks and
  acceptance criteria. Distinguish mockup checks from implemented app verification.
- Preserve relative links when relocating a plan. Forwarding notes may remain for
  older links and skill references; canonical content has only one home.
