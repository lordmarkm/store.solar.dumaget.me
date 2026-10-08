# Solar ecommerce UI theme

## Agreed direction

Use the same Metronic/KTUI theme foundation as the Provia project. The Google
Stitch project supplies the solar workflows, information architecture, and page
content; implement those screens using Provia's existing components. Public pages
use the user-selected Solar Wholesale Engine palette and typography below;
administration retains Provia's blue palette.

Design reference: https://stitch.withgoogle.com/projects/5180486357551022040

## Shared main-site branding

The storefront uses the logo from https://solar.dumaget.me/ (verified live on
2026-10-07): a `☼` sun on a 36px lime (`#c7e86b`) circle with dark-green
(`#0e4433`) ink, alongside the stacked Dumaget.me / Solar wordmark. Shared
`solar-ui/src/app/shared/brand.ts` applies this identity in the shopping, My pages,
and admin shells; its Space Grotesk/DM Sans fonts are already bundled locally.
Dark mode preserves the mark and adjusts wordmark contrast. The circular logo
is intentionally exempt from the public 2px surface rule; administration's blue
controls, card geometry, and body fonts remain unchanged.

The favicon SVG is copied unchanged from
`D:/git/solar/solar.dumaget.me/public/favicon.svg` into `solar-ui/public/favicon.svg`.
The index links only the SVG, matching the main site's explicit favicon link.
No ICO fallback is included in the storefront's public assets.
Keep this local copy aligned with the main site's source when its branding changes;
do not hotlink it or substitute the header's text glyph for the favicon artwork.

## Verified local reference

The Metronic implementation is in `D:/git/provia/pickle-lab-public-ui`.
`provia-backoffice-ui` currently uses a separate custom Tailwind/CDK setup, so
it is not the source for the requested Metronic/KTUI foundation.

- Angular 21.2 application with Tailwind CSS 4 and the Tailwind PostCSS plugin.
- Local Metronic Tailwind HTML 9.2.0 reference assets.
- Installed `@keenthemes/ktui` 1.2.7; keep this compatibility baseline unless
  an upgrade is explicitly part of the implementation.
- Shared light/dark semantic tokens in `src/theme/metronic/config.ktui.css`:
  background, foreground, card, border, input, primary, muted, and related tokens.
  The verified primary token is `#1379F0`; base radius is `0.5rem`.
- KeenIcons outline/solid icon styles and font assets.
- Metronic Demo 1 shell: fixed header, 280px sidebar, 80px collapsed icon rail,
  hover expansion, and responsive mobile navigation. Desktop header is 70px;
  mobile header is 60px.

## Component use

### Table filter toolbars

Keep Clear filters on the same toolbar row as the filters, aligned to input/select
controls. It is a compact secondary icon-only KTUI button with the shared
hover-only tooltip, accessible label and native title, not a full-width CTA below
the controls. Fields may reflow at narrow widths while the clear action remains
part of their toolbar. /admin/products follows this layout.

All table filtering/search must be API-side before pagination, not a filter over
loaded rows. This is a required guideline, not a claim that older tables already
comply. See AGENTS.md's Table filtering guidelines and the migration status in
[admin product management](docs/ADMIN-PRODUCT-MANAGEMENT-PLAN.md).

### Operation feedback

Admin save/publication feedback uses the installed KTUI Toast component through
the root-owned ToastService. Product/supplier creation, private product saves,
publish/republish and confirmed unpublish show success or mutation-failure toasts.
Successes last five seconds (paused on hover); failures remain until dismissed.
Validation failures retain field messages and show a concise toast. Canceled,
blocked and stale account/route operations do not emit outcome notifications.
Inline errors/statuses remain available; initial record-load errors stay inline.
Toasts survive successful redirects, never steal focus, have a labeled close
button, use verified KeenIcons, and treat API/record text as text rather than HTML.
Shared styles use semantic light/dark tokens and cap the visible width on mobile;
no vendor edits, notification package or new backend service is required.
Verified 34 focused toast/admin tests, app/spec type checks and production build.
The full run preceding the extra passing navigation-failure test had 290 passing
tests and the same 9 pre-existing project/Auth failures. Browser visual checks
remain pending because the helper could not initialize during the preceding task.

Use [solar-customer-theme](.agents/skills/solar-customer-theme/SKILL.md) when
building or restyling customer-facing shopping and My pages. It captures the
implemented `/catalog` palette, typography, angular geometry, shared components,
responsive patterns, and public/admin theme isolation. It does not turn catalog
demo workflows into product requirements or authorize additional account workflows.
The repository copy is the versioned source; an identical copy is installed under
the local Codex skills directory. When updating it, refresh that local copy too;
the copies are not automatically synchronized.

Follow the repository skill
[solar-ui-actions](.agents/skills/solar-ui-actions/SKILL.md) for Provia's icon usage,
action hierarchy, shared semantic-primary-outlined secondary buttons, accessible
tooltips, and responsive action spacing. Verify actual glyph mappings and fonts;
the Provia application stylesheet loads only a subset of KeenIcons.

Use shared KTUI button, form, card, badge, table, menu, pagination, modal, and
feedback treatments. Reuse the responsive spacing, borders, and interaction
patterns from the reference. Keep Angular responsible for application state;
initialize any DOM-based KTUI behavior after rendering and clean up instances
when leaving the page.

Apply the Demo 1 navigation shell to administration only. Shopping and customer
My pages use separate shells while sharing the public tokens and component
treatments. Preserve the solar branding and multi-supplier workflows.

The [user-facing roadmap](docs/USER-FACING-PLAN.md) separates a sidebar-free
shopping shell from a dedicated green customer My pages shell. The main working
tree implements this separation. The projects page now has a bounded browser-local
preview list, creation wizard entry, and overview; it uses synthetic local ownership
and has no account/backend connection. Favorites, profile, and settings remain
placeholders. Phase 2 production build, 46 tests across 9 files, and app/spec
`tsc --noEmit` checks passed. Browser checks confirmed loaded fonts and KeenIcons,
public 2px corners, light/dark desktop and mobile rendering, dialog focus containment
and scrolling, and restoration of admin blue `#1379F0`, vendor 12px radius, and system
font before returning to the public theme. Viewport overrides were 1440x900 and
390x844 (CSS widths 1309/355 under user zoom). The default light theme and viewport
were restored. See the roadmap for workflow checks and retained local sample data.
The phase 1 verification history remains recorded separately.

## Public theme reference

The catalog-to-project and mixed-BOM preview now reuses the same green tokens,
self-hosted fonts, 2px surfaces, verified KeenIcons, and shared CDK dialog styling.
The destination chooser swaps to the shared wizard inside one dialog; keyboard
focus moves into the wizard after the swap. Free-text editing and product details
preserve row selection, focus trapping, Escape dismissal, and return focus.
Light/dark desktop/mobile rendering and public/admin palette/font/radius isolation
were browser-checked for this slice. Default viewport and original light preference
were restored. Build, 62 tests, and app/spec checks passed; the older results below
remain historical. No vendor theme or stylesheet changes were needed.

The supplied Solar Wholesale Engine screenshot is the public visual reference:

- Primary: `#0E4433`; secondary: `#C7E86B`.
- Tertiary/support: `#166B4F`; neutral: `#17312B`.
- Headings, labels, actions, SKU labels, and prices: Space Grotesk; body text: DM Sans.
- Stitch's green catalog artboard was inspected on 2026-10-06: product cards use
  2px corners and a subtle 0 1px 2px shadow, headings use weights 600/700, and body
  text uses DM Sans. These page styles, not the rounded palette-board tiles, are
  the public card reference.

Mint surfaces and dark-mode colors are derived adaptations of this reference.
Keep KTUI structure, semantic borders, action hierarchy, and the shared KeenIcons
system. Public cards, controls, image stages, and detail-dialog panels use an
app-owned `--public-radius: 2px`; product cards have a subtle hover shadow without
moving or resizing. Explicit public label/price classes make typography reusable.
Do not shrink the vendor `--radius`: its derived sizes would become negative.
Administration retains the original Metronic radius and fonts. Circular indicators,
avatars, and icon glyphs are not flattened or given text-font overrides.
The variable fonts are bundled locally through Fontsource, not fetched from Google.

Route metadata selects `appearance: 'public'` for catalog, guest draft, customer My,
and not-found pages. The workspace defaults to Provia styling for both admin
routes. `ThemeService` sets `data-solar-theme` on the document root so dialogs,
tooltips, and toasts inherit the active palette too. Light/dark preference remains
independent of this route selection. Public overrides live in
`solar-ui/src/theme/public-theme.css`; do not edit vendor styles to recolor pages.

The guest-list linking/history preview also reuses these tokens and verified
KeenIcons. Its all-row destination flow swaps to the existing wizard inside one
CDK dialog; history and new-list confirmation use the same scrolling public panel.
No vendor/theme CSS changes or new icon mappings were needed. Build, 77 tests,
app/spec checks, desktop/mobile light/dark, dialog focus/scroll/Escape return,
loaded fonts/glyphs, 2px corners, and restoration of blue admin appearance pass
for this slice. Controls remain explicitly browser-local with no real sign-in.
The public skill's generic roadmap-status note needs no change.

## Required styling pipeline

The Angular application's `.postcssrc.json` must contain:

```json
{
  "plugins": {
    "@tailwindcss/postcss": {}
  }
}
```

Follow Provia's global stylesheet ordering:

```css
@import 'tailwindcss';
@source '../node_modules/@keenthemes/ktui/dist';
@import './theme/metronic/config.ktui.css';
@import '@keenthemes/ktui/styles.css';
@import './theme/metronic/components/index.css';
@import './theme/metronic/demo1.css';
@import '@fontsource-variable/dm-sans';
@import '@fontsource-variable/space-grotesk';
@import './theme/public-theme.css';
```

Include only the needed Metronic component styles and their assets; adapt the
component index if unrelated chart/map integrations are omitted. Consult
`D:/git/provia/courts/docs/Metronic-Index.md` and installed component sources for
compatible APIs. Prefer existing component classes over custom CSS.

## Implementation verification

Verify the production build and actual rendered Tailwind utilities, then inspect
the catalog and admin pages at desktop and mobile widths. Check sidebar collapse,
keyboard focus, forms, modal dismissal, and loading/empty/error states. A successful
build alone does not prove that the Tailwind/KTUI styling pipeline is working.

## Current status and historical verification

Google-auth presentation update (2026-10-06): the account panel/dialog/header
now use the real Auth session seam for restoration, Google action, signed-in
display name, busy/error feedback and Sign out. Signed-in users are explicitly
told that project saving is not connected; old local projects remain inaccessible.
The customer-theme/action skills preserve existing fonts/tokens, 2px panels,
KeenIcons and CDK focus handling; no vendor CSS or icon mappings changed.
Build, app/spec checks and 99 tests/17 files pass. Browser checks confirm
desktop/mobile light/dark wrapping, fonts, 2px panels and dialog keyboard focus.
Default viewport/light preference were restored. Auth-only provisioning completed
with Google enabled, but the result reports unexpected subtype `IDENTITY_PLATFORM`
instead of approved `FIREBASE_AUTH`; authorized domains are incomplete, no login
was attempted, and the storefront flag remains off pending recovery. See
docs/AUTHENTICATION.md. Earlier authentication-unavailable status and counts below
are historical.

The frontend guest-access slice uses the existing public tokens/fonts, 2px KTUI
surfaces, KeenIcons, focusable disabled-action tooltips, and shared scrolling CDK
panels. The sign-in page remains sidebar-free; `/my/**` is guarded in the normal
signed-out runtime. Luna implemented the bounded presentation panel/dialog while
the main task handled gates/state. Authentication is explicitly unavailable, not
a styled fake login. No vendor CSS or icon mapping changes were needed.
Build, 88 tests/15 files, and app/spec type checks passed. Browser checks confirmed
desktop/mobile light/dark wrapping, Tab/Escape/return focus, disabled-action keyboard
tooltips, loaded fonts/glyphs and 2px public panels. Admin still restores blue,
12px cards and system fonts; returning restores green. Default viewport and light
preference were restored. Account authentication remains disconnected.

Shared action hints are hover-only: focus, keyboard navigation and dialog return
focus never open a visual tooltip. The customer-theme and UI-actions skills encode
this hover-only convention. Pointerdown/click (including native
disabled buttons), outside clicks or Escape dismiss them until a fresh hover.
Leaving the trigger closes the bubble even when the trigger retains focus.
Disabled-action wrappers retain accessible labels and permanent screen-reader
descriptions, independent of whether the bubble is visible. Only disabled buttons
inside the tooltip wrapper retarget pointer events;
their disabled state and action guards remain intact. A theme-colored pointer
connects the bubble to the trigger, points downward above the button, and flips
upward when CDK places the bubble below. Its horizontal position follows the
trigger when viewport-edge positioning shifts the bubble.

Catalog product-card footer actions are icon-only at the user's request: primary
Add to Cart, secondary Details, and secondary Add to project. Each
uses the shared tooltip for its visible wording, native titles and product-specific
accessible names; only disabled project actions have a focusable hint wrapper.
The sign-in explanation and existing action guards remain unchanged. Both skills
scope this icon-only convention to catalog card footers; header, filter, hero and
page-level actions retain their labels.

The public guest equipment list is now named Cart across shopping navigation,
the `/draft` page, history/linking dialogs, sign-in copy and notifications. Cart
actions and navigation use the verified `ki-handcart` outline glyph (`\ea37`),
from Metronic 9.2 with a SHA256-identical font already bundled in this application.
This is presentation only: `/draft`, `/bom` redirects, storage keys, quantities,
one-time project copying and CSV behavior stay compatible. A Cart is not a
project BOM, an order, or an inventory reservation; existing preview warnings stay.

The Angular application is scaffolded in `solar-ui`. It copies the verified Provia
theme configuration, Demo 1 shell styles, selected component CSS, and matching
KeenIcons fonts. Shared UI uses KTUI styling and Angular-owned state. Theme versions
are pinned to the installed Provia baseline (KTUI 1.2.7, Angular 21.2, Tailwind 4.2).
Catalog, guest draft, local-preview customer My pages, inventory, and supplier routes
use illustrative/local data. `/bom` redirects to `/draft` without changing the
`solar.bom.v1` storage key. The guest draft accepts positive whole-number quantities
without stock limits, including on restoration; missing product IDs remain visible as
unavailable rows that can be removed. It has no snapshot history. Guest catalog CTAs
say Add to Cart. Customer navigation contains no admin links or quotation
labels; admin and supplier views remain in the blue workspace and provide Continue
shopping.

Layout separation verified 2026-10-06: production build, 30 tests, and strict
app/spec TypeScript checks pass. Desktop/mobile browser checks verified public
fonts and 2px cards, customer-only navigation, sidebar-free shopping, route palette
isolation, dark preference, and mobile drawer focus trapping/Escape restoration.
The legacy `/bom` redirect retains the existing guest list. Above-stock quantities
survived reload; original browser quantities were restored after testing.
Missing products remain visibly unpriced and removable (automated coverage).
The Stitch project itself has not been modified.

Historical verification, 2026-10-06 after the card/typography adaptation: production build and all
12 tests passed. Browser checks at 1440px desktop and 390px mobile confirmed
loaded Space Grotesk/DM Sans, 2px public cards/controls/detail panels, unchanged
KeenIcons fonts, no catalog overflow, dark mode, and Escape focus restoration.
The BOM inherits the public treatment; admin navigation restores `#1379F0`, the
original system fonts, 12px cards/detail panels, and 8px image stages.
Project/guest-copy/PO behavior remains planned, not implemented by this styling work.
