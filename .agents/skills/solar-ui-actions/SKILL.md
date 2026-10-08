---
name: solar-ui-actions
description: "Apply store.solar.dumaget.me Metronic/KTUI action and KeenIcons conventions, including icon-only catalog card buttons, Cart versus project glyphs, accessible names, and hover-only tooltips. Use when adding, restyling, or reviewing actions/icons on customer or admin pages; not for changing business workflows or unrelated projects."
---

# Solar UI Actions

Adapted from `D:/git/provia/pickle-lab-public-ui/.agents/skills/provia-ui-actions/SKILL.md`.
Preserve Provia's action hierarchy, installed KeenIcons, accessible tooltips, and
responsive spacing while adapting labels and context to solar workflows.

## Source of truth

Keep this skill versioned in the solar repository, currently
`D:/git/solar/store.solar.dumaget.me`. Resolve these paths from that repository
root, not from this skill folder, and inspect the relevant sources before edits:

- `UI-THEME.md`: approved action conventions and theme boundaries.
- `solar-ui/src/app/features/catalog/catalog.html`: reference card action rail.
- `solar-ui/src/app/shared/tooltip.ts`: shared hover state and CDK positioning.
- `solar-ui/src/styles.css`: secondary buttons, disabled wrappers, tooltip arrows.
- `solar-ui/src/theme/metronic/components/keenicons.css` and
  `solar-ui/public/assets/fonts/keenicons-outline.woff`: actual glyph mappings/font.

Solar's current implementation overrides earlier Provia examples. Do not assume
Provia component names exist here. If the checkout is unavailable, report the
missing reference rather than applying solar-specific conventions elsewhere.

Initial reference sources under `D:/git/provia/pickle-lab-public-ui`:

- `src/app/modules/player/video-reviews/video-reviews.component.ts`: action hierarchy,
  compact icon rails, labels, and state-dependent hints.
- `src/app/modules/player/skill-assessment/skill-assessment.component.ts`: labeled
  card actions and wrapping, aligned footers.
- `src/app/shared/player-tooltip/player-tooltip.component.ts`: historical hint,
  overflow positioning, and disabled-control support. Adapt into a shared solar
  tooltip rather than retaining player terminology.
- `src/styles.css`: app-owned neutral button variant and interaction states.
- `src/theme/metronic/components/keenicons.css` and
  `public/assets/fonts/keenicons-{outline,solid}.woff`: actual mappings and fonts.

Consult `D:/git/provia/courts/docs/Metronic-Index.md` and its icon catalog when available.
External paths are optional references, not solar runtime dependencies. If missing,
inspect the local theme and installed KTUI package. Do not edit Provia or Metronic
vendor repositories to style solar.

## Actions and layout

- Keep semantic colors, bordered cards, and spacing. Public pages use green/mint
  tokens and 2px angular geometry from the companion
  `.agents/skills/solar-customer-theme/SKILL.md`; administration retains blue and
  its established radii. Adapt structure to the requested workflow.
- Use `kt-btn kt-btn-primary` for the principal task CTA, such as Add to Cart or
  Save SKU. Do not make every navigation or row action primary.
- Use `kt-btn kt-btn-light` for ordinary secondary actions, with shared size classes.
  This variant is app-owned, not supplied by installed KTUI. Adapt its definition
  once in the solar global stylesheet: pale neutral surface, readable text/icons,
  semantic-primary outline (green public, blue admin), hover/focus states, and distinct disabled styling. Do not
  redefine it per page.
- Catalog product-card footer actions are icon-only: combine `kt-btn kt-btn-icon`
  with the appropriate variant and move wording into the shared tooltip. Cart is
  primary; Details and Add to project are secondary. Retain concise visible labels
  on header, hero, filter, and page-level CTAs. Do not silently convert every
  supplier/admin card or unrelated action to icon-only.
- Group related actions with explicit wrapping flex/grid spacing. Use `gap-3` (12px)
  or comparable spacing for card footers; stack at narrow widths. Use flex-column
  cards with padded `mt-auto` footers when aligned bottoms help scanning.

## KeenIcons

Current catalog mappings, verified in the solar outline stylesheet:

| Action | Classes | Codepoint | Shared tooltip |
| --- | --- | --- | --- |
| Add to Cart / Cart navigation | `ki-outline ki-handcart` | `\ea37` | `Add to Cart` for the add action |
| View product details | `ki-outline ki-eye` | `\ea08` | `Details` |
| Add to project | `ki-outline ki-clipboard` | `\e9a3` | `Add to project`, or the disabled reason |

Use a shopping-cart glyph for Cart, not the project clipboard. Customer-facing
guest equipment-list wording is **Cart** / **Add to Cart**. This naming does not
rename project BOMs, legacy `/draft` or `/bom` routes, browser storage keys, or
internal models, and does not introduce checkout or inventory reservations.

- Use installed KeenIcons, normally `ki-outline`, consistently with Provia. Mark
  decorative icons `aria-hidden="true"` and inherit the control's color. Use solid
  icons only for an established pattern or meaningful selected state.
- Verify the selector, `::before` mapping, family, and loaded font. A plausible
  class or vendor catalog entry does not prove the app loads that glyph. Provia's
  application stylesheet contains only a subset of vendor icons.
- Pair mappings with matching fonts and verify font URLs at runtime. Do not replace
  missing glyphs with emoji, raw Material Symbol names from Stitch, or another library.
- For a missing solar glyph, inspect the matching local vendor catalog and add the
  verified mapping to the shared solar icon stylesheet. Do not guess codepoints.
  Keep a clear text label if the needed asset cannot be verified.
- Source-verified outline choices: `ki-eye` (View), `ki-pencil` (Edit), `ki-file-up`
  (Import/upload), `ki-arrows-circle` (Refresh/retry), `ki-filter` (Filter), `ki-check`
  (Confirm/save), `ki-cross` (Cancel/close), and `ki-trash` (Remove/delete). Verify
  against the solar assets before use.
- Use explicit Angular class bindings for state-dependent icons. Update accessible
  labels and tooltip wording along with the glyph when action state changes.

## Accessible hints and disabled actions

- Reuse `app-tooltip`: compact theme-colored label with small bold text. Visual
  tooltips are hover-only: `hovered && !dismissed` controls the CDK overlay.
  Mouseenter opens/rearms; mouseleave closes even while the button remains focused.
  Never open from focus/focusin, or restore a bubble solely because a dialog returns
  focus to its trigger. Preserve dialog return focus itself.
- Pointerdown, click, outside click, and Escape dismiss until a fresh hover.
  Tooltips must not intercept pointer input. Avoid clipping; check positioning at
  viewport edges and inside overlays.
- Include an `aria-hidden="true"` theme-colored arrow connected to the trigger:
  downward for an above-button bubble, upward for the below-button fallback.
  Preserve horizontal alignment when CDK pushes the bubble at viewport edges.
- Give icon-only controls an accessible `aria-label` and native `title`. Preserve
  visible action wording in accessible names; include the product, SKU, supplier,
  or other record name when repeated actions need context. Catalog examples:
  `Add to Cart: {product.name}`, `View {product.name}`, and
  `Add {product.name} to project`. Native titles must describe the same action;
  the shared tooltip carries its concise visible wording or disabled reason.
- Explain unavailable states, such as insufficient stock, missing supplier selection,
  pending submission, or a submitted quotation. Preserve existing disabled guards.
- Disabled native buttons cannot receive focus. Use the shared tooltip wrapper's
  `focusable` equivalent only for disabled controls and expose the action and reason
  on the wrapper. For guests, the project hint is `Sign in to add to project`.
  Avoid extra tab stops around enabled controls.
- Keep the disabled wrapper's `aria-describedby` linked to a permanent `sr-only`
  description, independent of the visual bubble. Keyboard focus exposes the
  reason to assistive technology but must not open the visual tooltip.
- Keep native `disabled` and existing action guards. For pointer handling, use the
  scoped `.solar-tooltip-trigger button:disabled` (and descendants) pointer-events
  rule so the wrapper receives hover/click dismissal, with a not-allowed cursor.
  Do not apply pointer suppression to enabled controls or all buttons globally.

## Preserve and verify

Preserve routes, quantities, prices, supplier selection, stock guards, permissions,
mutations, and loading/error behavior unless requested otherwise. Keep submitted
records visible and read-only, with explicit reopening where supported. Preserve
established modal dismissal behavior.

Preserve the Tailwind 4/KTUI pipeline in `UI-THEME.md`, including PostCSS and the
KTUI `@source` registration before importing its stylesheet.

For implemented controls, run relevant existing checks and the production build.
Add focused tests when changing guards, state transitions, or click destinations;
cosmetic changes do not require tests that mirror markup. Inspect rendered glyphs,
font loading, spacing, mobile wrapping, accessible names, and disabled descriptions.
Check hover exit while focused, click dismissal, and Details -> Close: returned
focus must not reopen a tooltip without hover. Keyboard navigation alone must not
open visual bubbles; screen readers must still receive disabled reasons.
Compilation alone does not prove icons or spacing. Report unavailable browser checks.
Maintain existing task tracking when present; do not invent completed UI work for
a skill-only task. For skill-only edits, validate metadata, referenced local paths,
and consistency with the companion customer-theme skill; do not claim new UI tests.
