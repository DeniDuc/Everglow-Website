# Design tokens

Source: the live everglowet.com Booqable theme (CSS variables in the page source, 2026-10-29), refined for contrast and consistency. Implemented in `src/app/globals.css` (`@theme`).

## Typography

| Token | Value | Use |
| --- | --- | --- |
| `--font-display` | Bona Nova 400/700 | Headings (site used 56/48/40 px, weight 400) |
| `--font-sans` | Poppins 400/500/600 | Body, UI |
| `--font-script` | Dancing Script 500 | The "Our" eyebrow above section titles |
| `.heading-xl` | clamp(2.5rem, 6vw, 4.5rem) | Hero / page titles |
| `.heading-lg` | clamp(2rem, 4vw, 3rem) | Section titles |
| `.heading-md` | clamp(1.5rem, 2.5vw, 2rem) | Card titles |

## Colour (storefront)

| Token | Hex | From the live site |
| --- | --- | --- |
| `ink` | #231905 | `--color-primary` |
| `ink-soft` | #44413B | `--color-secondary` |
| `ink-muted` | #6F6A60 | new (AA on cream) |
| `slate` | #3F4A4D | logo grey |
| `cream` | #FFF8F1 | colour set 3 background |
| `sand-100` | #F7EBD3 | `--background-accent`, browser theme colour |
| `sand-200` | #EFDAB0 | accent (set 3) |
| `gold-300` | #D5BF96 | outline / logo gold (decorative only) |
| `gold-500` | #B8975C | eyebrows, icons |
| `gold-700` | #7D5F2C | prices and links — darker than the old #D5BF96 so text passes WCAG AA |
| `line` | #23190526 | borders (`--color-border`) |

## Shape, depth, motion

- Radius: cards 16 px (`--border-radius-block-rounded`), buttons pill.
- Shadows: `shadow-soft` (resting cards), `shadow-lift` (hover, dialogs, floating date bar).
- Container: max 1280 px (`--max-width`), 16 px gutters on mobile, 32 px from 768 px.
- Easing `cubic-bezier(0.22, 1, 0.36, 1)`; reveal on scroll via CSS scroll-driven animation; hero Ken Burns 24 s; all motion off with `prefers-reduced-motion`.

## Admin (Booqable-like)

| Token | Hex |
| --- | --- |
| `admin-bg` | #EDF0F5 |
| `admin-line` | #DDE2EA |
| `admin-text` | #1C2430 |
| `admin-muted` | #687385 |
| `admin-blue` | #136EF6 |
| `admin-green` | #4FCB72 (Paid / Returned badges) |
