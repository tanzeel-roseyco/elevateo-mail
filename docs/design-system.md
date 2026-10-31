# Elevateo corporate design system

The product has one light appearance: white surfaces, near-black text and restrained gold outlines. The operating system's dark preference does not change the product palette. Navigation, authorization, API contracts and mail workflows are unchanged.

## Tokens and measured contrast

The web source of truth is `apps/web/src/styles/index.css`. Tailwind's default colour palette is disabled. Components use semantic utilities (`bg-surface`, `text-fg`, `border-line`, `focus:ring-ring`) or these same CSS variables. Do not add palette literals in feature components.

Contrast uses WCAG relative luminance: linearize sRGB channels, then `(lighter + .05) / (darker + .05)`. Values below are rounded; automated tests compare unrounded values.

| Role / token | sRGB | Contrast on white | Contrast on neutral |
| --- | --- | ---: | ---: |
| Background, surface, primary button fill | #FFFFFF | n/a | n/a |
| Region separation / surface-2 | #F5F5F4 | 1.09:1 | n/a |
| Body / heading / fg | #171717 | 17.93:1 | 16.43:1 |
| Secondary labels / muted | #525252 | 7.81:1 | 7.16:1 |
| Meaningful border / line and focus / ring | #A67C00 | 3.82:1 | 3.50:1 |
| Danger | #B42318 | 6.57:1 | 6.03:1 |
| Success | #176B3A | 6.56:1 | 6.01:1 |
| Warning | #855400 | 6.43:1 | 5.90:1 |

Status backgrounds are #FFF4F2 (danger), #F0F8F2 (success), #FFF8E6 (warning). Tests also enforce 4.5:1 for each status label on its own tint. Skeletons use #E5E5E3; modal backdrops use #171717 at 40% opacity. Neither is a text or meaningful boundary token. Gold is not body text: its 3.82:1 ratio is sufficient for non-text indicators, not normal-size text.

## Component rules

- Primary buttons: white fill, near-black semibold label, 2px gold border. Secondary controls use a 1px border. Destructive buttons retain red with white text and explicit action labels.
- Fields: white surface, gold boundary, near-black value and muted placeholder; preserve labels, validation text and keyboard semantics. Focus is a 2px gold outline. Error states include explanatory text, not colour alone.
- Navigation: retain existing routes and conventional rail/drawer arrangement. Selected tabs use a gold underline; selected rows use a gold edge. Unread rows retain bold labels and a dark dot. Finder mode selection has a heavier border and label.
- Surfaces: white first; light neutral only for grouping, hover and read rows. No gradients or large gold fills. Modal backdrops remain translucent so the originating task stays visible.
- Typography: the system sans-serif stack, 14px default, existing heading hierarchy. Dense desktop rows and touch-sized mobile controls remain intact.
- Shape: 2px small radius, 4px cards/buttons/dialogs. Circular avatars, radio controls and unread dots retain their semantic shapes. Shadows are removed from normal surfaces; floating overlays have only a subtle 2px/8px shadow.
- Motion: no decorative pulse, scale or gradient effects. Preserve necessary loading indicators and reduced-motion behavior.
- Branding: use the canonical `assets/brand/elevateo-logo.png`, copied to web public assets and the iOS asset catalog. Do not recolour the supplied mark.
- User-defined tag colours are content data in `styles/tagColours.ts`, not application chrome. Badge labels remain near-black over a low-opacity tint; the selected swatch also has a shape/outline cue.

## Platform mapping

| Client | Native theme mechanism |
| --- | --- |
| Web | CSS `@theme`, root `color-scheme: light`, shared `src/ui` components; no dark variants or theme toggle |
| Tauri desktop | `WebviewWindowBuilder.theme(Light)`; hosted web UI consumes the same web token layer |
| Android | AppCompat night mode disabled, white system bars with dark icons; hosted Tauri web UI uses shared CSS |
| Windows | `App.axaml` Light Fluent palette, compact density, application brushes and styles; changes confined to theme resources |
| iOS | SwiftUI preferred light scheme, `CorporateTheme`, shared button/text-field styles, plain lists and canonical logo asset |

Native colours deliberately mirror the web tokens using platform theme resources; there is no runtime cross-language theme dependency. Update both representations together when changing the palette. Linux Docker verifies shared Swift logic but cannot compile or visually inspect SwiftUI. Platform build and inspection results are recorded separately in the verification receipt.

## Regression checks and usage

`src/styles/designSystem.test.ts` rejects hard-coded Tailwind palette utilities, arbitrary hex colour classes, RGB/HSL literals and `dark:` classes outside the explicit token files. Tests allow semantic utilities, verify rejected examples and measure required text/boundary contrast. Existing behavior tests remain authoritative; update appearance assertions only when the intended design changes.

Browser verification captures the actual running app at 1440px and 390px, including sign-in, inbox, thread, draft, review, status, outreach, finder, settings and async states. See [verification evidence](completion/design-system-20261101/README.md) for executed commands, screenshots, failures and platform limitations. A token contrast test alone is not a substitute for rendered UI inspection.
