---
name: solar-customer-theme
description: "Theme customer-facing pages in store.solar.dumaget.me to match its /catalog reference: green/mint Metronic/KTUI tokens, Space Grotesk and DM Sans, angular cards, responsive shopping and My pages, and public overlays. Use when building, restyling, or reviewing these customer views; not for blue administration pages, unrelated websites, business-policy changes, or backend setup."
---

# Solar Customer Theme

Use the implemented `/catalog` as the visual baseline, with the approved customer
roadmap determining page purpose. Keep the shared Metronic/KTUI foundation rather
than reproducing Stitch with another component or icon library. This skill guides
styling; it does not authorize implementing extra workflows or deploying anything.

## Reference and scope

Work in the `store.solar.dumaget.me` checkout (currently
`D:/git/solar/store.solar.dumaget.me`), with Angular under `solar-ui`.
Resolve the following paths from that repository root, not from this skill folder:

- `solar-ui/src/app/features/catalog/catalog.html`: storefront composition and spacing.
- `solar-ui/src/theme/public-theme.css`: authoritative public tokens, fonts, geometry, and dark-mode overrides.
- `solar-ui/src/styles.css`: shared helpers, app-owned secondary buttons, font imports, and styling pipeline.
- `solar-ui/src/app/core/theme.service.ts` and `solar-ui/src/app/app.routes.ts`: route appearance and overlay inheritance.
- `UI-THEME.md`: provenance and theme boundaries.

Read those sources before styling. For new page structure or workflow wording,
also read the relevant section of `docs/USER-FACING-PLAN.md`; use
`docs/FRONTEND-MODELS.md` only when the task touches typed records.
If the checkout is unavailable, report the missing reference instead of treating
this solar-specific theme as a global website style.

The catalog is a scaffold, not a specification for customer behavior. Do not
introduce admin navigation or quotation labels into customer pages, or treat
sample pricing as live offers. Draft planning quantities are independent of
stock. Preserve existing behavior during purely cosmetic work; do not silently
change workflows as part of theming.

## Palette and theme isolation

Use semantic utilities such as `bg-card`, `text-foreground`, `border-border`,
`bg-primary`, and `text-primary-foreground`. Do not hard-code light-theme hex values
in components. Current light-theme anchors are:

| Role | Token | Value |
| --- | --- | --- |
| Primary actions | `--primary` | `#0E4433` |
| Lime highlight | `--secondary` | `#C7E86B` |
| Support/eyebrow | `--public-support` | `#166B4F` |
| Neutral text | `--foreground` | `#17312B` |
| Page background | `--background` | `#F3FBF7` |
| Card | `--card` | `#FFFFFF` |
| Muted surface/text | `--muted` / `--muted-foreground` | `#DDF2E9` / `#527266` |
| Accent surface | `--accent` | `#CFE9DD` |
| Border/input | `--border` / `--input` | `#C2DCCF` / `#A8C8B8` |

Pair each surface with its foreground token, especially buttons in dark mode:
the dark public primary becomes lime with a deep-green foreground. Use the
existing dark overrides, not an invented inversion or per-page palette.

Customer routes select `data: { appearance: 'public' }`, directly or through an
appropriate public parent. `ThemeService` selects the deepest route appearance
and sets `data-solar-theme` on the document root. Keep that root-based approach so
CDK dialogs, menus, tooltips, and other overlays inherit the palette. Do not set
root theme state manually from page components or force a shared admin parent
to public. The independent `.dark` preference must survive route changes.

Place reusable public overrides in `public-theme.css`, scoped to
`:root[data-solar-theme='public']`. Do not recolor vendor CSS or the blue workspace.

## Typography and angular geometry

- Body copy: `DM Sans Variable`. Headings, labels, buttons, table headings,
  `.eyebrow`, `.public-label`, and `.public-price`: `Space Grotesk Variable`.
  Use the existing self-hosted Fontsource imports; no remote font dependency.
- Reuse `.page-title` for ordinary page headings and `.eyebrow` for small uppercase
  section labels. Catalog hero headings are 30px/36px responsive, weight 700;
  section headings 24px/600; product headings 16px/600 with 24px line height.
  Product body copy is 12px with 20px line height; supporting copy can be 14px.
- Use `.public-label` for SKU/compact labels and `.public-price` for prices.
  Prices have tabular numerals, with the main catalog amount 20px/600. Do not
  apply text-font overrides to KeenIcons or every descendant indiscriminately.
- Public cards, controls, image stages, categories, and `.solar-dialog-panel`
  use `--public-radius: 2px`. Prefer `.kt-card` and the existing public classes
  over new per-page border-radius rules. Preserve intentional circles such as
  avatars and status dots; do not flatten all rounded elements.
- Keep the vendor `--radius` unchanged: its derived sizes can become negative
  if reduced to the public corner size. Admin geometry remains independent.
- Public card shadow is `0 1px 2px` at 5% black in light mode; product hover/focus
  shadow is `0 4px 6px` at 8%. Reuse `.public-product-card` and its 200ms shadow
  transition, with the existing dark equivalents. Do not add card lift/scale.

## Page composition

Shopping/exploration pages have no sidebar. Use the storefront header/footer,
`.page-width` (`max-w-7xl`, horizontal padding 16/24/32px), and main padding
`py-6 sm:py-8`. Keep borders and pale surfaces rather than large decorative effects.

For catalog-like collections, reuse the compact hierarchy: optional
`.kt-card.public-hero`, section heading, wrapping `.public-category` filters,
search/filter card, then `grid gap-5 sm:grid-cols-2 xl:grid-cols-3`. Hero padding
is `p-6 sm:p-8`; filter padding `p-4`; product content padding `p-5`.
Use `.product-stage` for equipment images and `.public-panel` for nested panels.
Keep product text readable and action footers aligned with flex-column content,
`mt-auto`, and `flex flex-wrap gap-3`. Selected categories expose `aria-pressed`.
These are collection patterns, not a required grid for every customer page.

My pages (projects/BOM, favorites, profile, and planned POs) share these tokens,
fonts, cards, and controls but use the planned customer-only navigation/sidebar
with responsive mobile access. Do not equate a customer sidebar with the blue
admin shell. The implemented `ShoppingShell` serves `/catalog` and `/draft`;
`CustomerShell` serves `/my/**`; `WorkspaceShell` serves administration only.
`/bom` redirects to `/draft` while retaining legacy browser data. Customer pages
include browser-local project planning and must retain prototype labeling:
these records are not account-backed or synced. Consult the roadmap's current
implementation notes for enabled project/catalog/BOM workflows rather than
inferring completion from a themed control. Account services and purchasing
remain separate work.

## Components, actions, and overlays

Reuse KTUI buttons, inputs, selects, cards, badges, and tables plus existing
Angular-owned shared components. Preserve Tailwind 4/PostCSS and the KTUI
`@source` registration. Fontsource and `public-theme.css` follow vendor imports.
Do not upgrade packages or initialize conflicting DOM-owned state just to theme.

Use `kt-btn kt-btn-primary` for the principal CTA and `kt-btn kt-btn-light` for
ordinary secondary actions. The latter is app-owned in `styles.css`, not an
installed KTUI variant: preserve its semantic-primary outline and shared states.
Catalog product-card footer actions are icon-only (`kt-btn kt-btn-icon`), with
product-specific accessible names and shared hover-only tooltips. Cart is primary;
Details and Add to project are secondary. Keep visible labels on header, hero,
filter, and page-level controls; do not generalize this to every card/action.
Guest equipment-list UI wording is Cart / Add to Cart, using the verified cart
glyph. Project BOMs retain their name; legacy routes, storage keys, and internal
models do not change merely to match the label.

When adding or changing actions/icons, read the companion repository skill
`.agents/skills/solar-ui-actions/SKILL.md` for KeenIcons mappings, hierarchy, and
accessible tooltip behavior. Preserve the public 2px geometry here and keep admin
geometry separate. Use verified local `ki-outline` glyphs with matching
fonts, `aria-hidden="true"` for decorative icons, and inherited action color;
do not copy raw Stitch Material Symbols or substitute emoji. If the companion
is unavailable, inspect local icon CSS/fonts and shared tooltip implementations.

Reuse shared product dialogs, tooltip, theme toggle, and brand where appropriate.
Dialog surfaces use `bg-card text-card-foreground`, public panels, and the shared
`.solar-dialog-panel`; preserve CDK focus trapping, Escape dismissal, return focus,
viewport sizing, and scrolling. Visual tooltips appear only while their trigger is
hovered and not dismissed: focus alone, including restored dialog focus, cannot
open them. Keep click/Escape dismissal and the theme-colored connecting arrow.
Disabled-button wrappers remain keyboard reachable with permanent `sr-only`
descriptions, independent of the bubble, without extra tab stops around enabled
buttons. Check focus, selected, hover, and disabled states.

## Verification and handoff

For UI changes, run relevant checks and a production build, then inspect the
rendered customer page at desktop (~1440px) and mobile (~390px). Check actual
font/glyph loading, 2px public corners, wrapping/overflow, light/dark contrasts,
keyboard actions, and overlays. Visit an admin route and return: blue tokens and
original fonts/radii must restore there, while customer styling restores here.
Respect reduced-motion preferences. Report browser checks that could not be run.

For skill-only edits, validate skill metadata and referenced paths; do not claim
new UI tests or completed roadmap features. Keep project theme documentation
consistent with material styling changes, and report any business/UI distinction
that matters to the requested task.
