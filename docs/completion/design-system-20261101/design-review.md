# Dedicated design tradeoff review

Date: 2026-11-01. Reviewer: independent adversarial design reviewer.

Reviewed the current working-tree versions against the owner's white/gold brief and
`.planning/STANDARDS.md`. This is a bounded source review, not release approval.

## Coverage and result

| Source | Inclusive lines | Reviewed lines |
| --- | --- | ---: |
| `apps/web/src/styles/index.css` | 1–110 | 110 |
| `apps/web/src/ui/Button.tsx` | 1–52 | 52 |
| `apps/web/src/ui/Badge.tsx` | 1–38 | 38 |
| Total | One bounded batch | 200 |

Confirmed defects: **0**. Defect density: **0 defects per 1,000 reviewed lines**.
The requested correctness, edge-case, maintainability, boundary/security and performance
rubric was applied within this scope. No source edits or application tests were performed.
The final reread found no changes to these reviewed ranges since the initial review.

## Contrast simulation

Calculated WCAG relative luminance from the declared sRGB hex values, then used
`(Llighter + 0.05) / (Ldarker + 0.05)`. These are mathematical palette calculations,
not browser-computed accessibility-test results.

| Token | White `#FFFFFF` | Neutral `#F5F5F4` |
| --- | ---: | ---: |
| Gold outline `#A67C00` | 3.815:1 | 3.497:1 |
| Foreground `#171717` | 17.928:1 | 16.434:1 |
| Muted `#525252` | 7.814:1 | 7.163:1 |
| Danger `#B42318` | 6.574:1 | 6.026:1 |
| Success `#176B3A` | 6.561:1 | 6.014:1 |
| Warning `#855400` | 6.431:1 | 5.895:1 |

Gold exceeds the 3:1 meaningful-outline threshold on both declared surfaces. It
does not reach 4.5:1 for normal text, so using near-black body ink is necessary.
All listed text colours exceed 4.5:1 on both surfaces.

## Concrete choice simulation

| Choice | Practical result | Assessment |
| --- | --- | --- |
| White primary, 2px gold outline, semibold ink | Keeps the large area white; doubles the border weight relative to the 1px secondary button; text contrast remains 17.928:1 | Matches the brief. Actual adjacent-button prominence still needs visual inspection. |
| Gold-filled primary with dark ink | Increases emphasis through a large coloured area | Rejected by the owner's restrained-outline requirement. |
| Gold body text on white | Only 3.815:1 | Rejected for normal-size text. |
| User-colour badge tint with fixed dark ink | Preserves user tag identity while avoiding arbitrary saturated body ink | Suitable for the mandated light surfaces. |
| Semantic compatibility aliases | Existing consumers keep their public token names while the palette changes centrally | Lower migration risk than renaming component APIs; no new abstraction needed. |

The 2px keyboard focus outline is explicit and remains present for keyboard
targets. Disabled-opacity styling is appropriate only for inactive controls.
Status badges retain text content in addition to their status colours; callers
must continue supplying meaningful labels.

Obsidian tool discovery returned no available connection. The simulations above
were therefore performed directly; no Obsidian execution or saved note is claimed.

## Verification limits

UI verification remains with the root/visual-QA worker. This reviewer has not
inspected rendered screens, executed Docker tests, checked final compiled utility
precedence, or reviewed test/documentation coverage outside these 200 source lines.
The primary/secondary distinction at small sizes and rendered focus states should
be checked in the actual desktop and mobile application before completion.
