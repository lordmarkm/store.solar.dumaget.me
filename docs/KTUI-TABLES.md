# KTUI browsing tables

## Decision (2026-10-11)

Use existing @keenthemes/ktui 1.2.7, imported from its public
components/datatable entry point. No new dependency, enterprise license,
Firestore count query, database migration or cloud write is required.

The Angular adapter lives in solar-ui/src/app/shared/ktui-table.ts with
responsive styles in ktui-table.css. Use KtuiTable and KtuiTableColumn for
browsing tables; do not copy native table row loops into feature templates.
KTDataTable actually creates tbody rows, cells and colgroup through its
supported columns.render/createdCell callbacks. This is not CSS-only adoption.

## Cursor/API boundary

- Features own authorization, API filters, query validation, debouncing,
  stale-response fences, loading/error/retry and cursor history.
- Supply only the already authorized, bounded API result. Inventory remains
  10 records per page with its existing Previous/Next controls.
- KTUI's remote mode and built-in numeric/total-based paginator are not used:
  their page/size/totalCount contract does not match opaque Firestore cursors.
  Keep existing API-owned cursor controls outside the widget.
- No widget search/sort/size/total controls are mounted. Header sorting is
  explicitly disabled and stateSave is false. Never filter only loaded rows.
  Future sort controls must issue a server query and reset cursor history.
- The local provider is used only as the rendering transport for a bounded
  server batch, not as the authority for dataset filtering or pagination.
  Its pageSize equals the supplied batch length (minimum one), preventing a
  second slice. Internal batch count is never presented as a collection total.
  Load-more views render their existing accumulated, bounded API results.
- The legacy un-routed fixture ProductsPage remains a preview with local fixture
  filters/pagination, not a connected API example or a compliant live query.

## Angular cells and safety

Declare typed ng-template columns using solarTableColumn,
[solarTableColumnOf], header, width and let-row. Provide rows, rowKey, label
and optionally busy/emptyTemplate to app-ktui-table. Widths should be percentages.

The documented KTUI local-input skeleton carries generated index tokens only.
Never insert product/supplier text into HTML strings. Angular templates create
escaped cell content, RouterLink, pipes, CDK menus and shared hover-only tooltips.
Their attached embedded views continue reacting to signals and disabled guards.
Do not expose the raw KTUI instance for feature-level search/reload/page calls.

Each data snapshot gets a fresh vendor root and instance. Replacement/destruction
disposes the instance and detaches/destroys every Angular cell view (including
overlays). A follow-up microtask also disposes initialization-time listeners,
because KTUI finalizes local draws asynchronously. Empty API batches immediately
replace old records. Features must still clear private rows on auth changes.

## Layout and interactions

Use KTUI table styling with semantic theme tokens. Shared scoped adaptations
wrap long values and stack the same vendor-generated cells below 1024px; they
are not another table rendering engine. data-label supplies visible field
labels in stacked rows. Do not add horizontal scrolling, clip data, shrink
text into unreadability or maintain duplicate mobile row templates.

Keep all useful fields, including Supplier. Main-row actions remain secondary
icon-only controls with accessible record-specific labels, hover-only tooltips
and native titles. Grouped triggers include the small down chevron; menu entries
retain text. Inventory retains zero primary buttons, stock guards and unchanged
write/ledger/retry semantics. Dialog footer placement remains a separate audit;
this table integration does not claim every existing dialog is compliant.

## Verification

Focused adapter tests in shared/ktui-table.spec.ts cover real KTUI ownership,
25-row batch rendering without truncation, reactive disabled state/handlers
without rebuilding, escaped text, instance/view cleanup and empty results.
Run from solar-ui:

    npm test -- --include=src/app/shared/ktui-table.spec.ts
    npm run build

Browser checks must inspect actual datatable-initialized roots, filters/empty
states, menus and document/container scrollWidth versus clientWidth at desktop
and narrow widths. Unit tests/builds alone do not establish layout compliance.
Do not create stock/catalog records merely to verify presentation.

Current evidence: production build, test-source TypeScript check, four adapter
tests and diff check pass. Live browser checks confirmed actual initialized
KTUI roots for inventory/products, supplier filtering and empty inventory
results, intact quantity/other menus, and equal document/container widths at
default desktop and 390px mobile (products also 640px). Filters were restored.
No live stock/catalog mutations were submitted. Broader interaction tests and
actual browser-zoom/keyboard audits remain pending in TODO.md.
