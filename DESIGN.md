---
name: "Habil SuperApp"
description: "A premium operational interface for transparent, evidence-led business decisions."
colors:
  primary: "#6366f1"
  primary-hover: "#4f46e5"
  primary-pressed: "#4338ca"
  primary-soft: "color-mix(in srgb, #6366f1 12%, transparent)"
  primary-soft-dark: "color-mix(in srgb, #6366f1 16%, transparent)"
  accent: "#f59e0b"
  success: "#10b981"
  success-dark: "#34d399"
  warning: "#f59e0b"
  warning-dark: "#fbbf24"
  danger: "#ef4444"
  danger-dark: "#f87171"
  background: "#fafaf9"
  background-subtle: "#f5f5f4"
  surface: "#ffffff"
  surface-elevated: "#fffdfa"
  surface-raised: "#fdfcfb"
  border: "#e7e5e4"
  border-strong: "#d6d3d1"
  text: "#0c0a09"
  text-muted: "#57534e"
  text-subtle: "#78716c"
  background-dark: "#0a0a0a"
  background-subtle-dark: "#141414"
  surface-dark: "#18181b"
  surface-elevated-dark: "#27272a"
  surface-raised-dark: "#3f3f46"
  border-dark: "#2f2f35"
  border-strong-dark: "#474752"
  text-dark: "#fafaf9"
  text-muted-dark: "#d4d4d8"
  text-subtle-dark: "#a1a1aa"
  focus: "color-mix(in srgb, #6366f1 38%, white)"
  focus-dark: "color-mix(in srgb, #6366f1 46%, white)"
  assistant-primary-text: "#3730a3"
  assistant-primary-text-dark: "#c4b5fd"
  assistant-success-text: "#166534"
  assistant-success-text-dark: "#86efac"
  assistant-danger-text: "#b91c1c"
  assistant-danger-text-dark: "#fca5a5"
  assistant-warning-text: "#92400e"
  assistant-warning-text-dark: "#fcd34d"
typography:
  display:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "2.25rem"
    fontWeight: 800
    letterSpacing: "-0.03em"
  headline:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 800
    letterSpacing: "-0.03em"
  title:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 800
    lineHeight: 1.25
  body:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
  input:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
  control:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 800
    lineHeight: 1
  label:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 700
    lineHeight: 1.35
  caption:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 700
    lineHeight: 1.35
  mono:
    fontFamily: "JetBrains Mono, ui-monospace, SFMono-Regular, Consolas, Liberation Mono, monospace"
    fontSize: "0.75rem"
    fontWeight: 500
rounded:
  r8: "8px"
  r9: "9px"
  r10: "10px"
  r11: "11px"
  r12: "12px"
  r14: "14px"
  r16: "16px"
  r20: "20px"
  nav: "0.9rem"
  full: "9999px"
spacing:
  s0: "0px"
  s1: "4px"
  s2: "8px"
  s3: "12px"
  s4: "16px"
  s5: "24px"
  s6: "32px"
  s7: "48px"
  s8: "64px"
  s9: "96px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface}"
    typography: "{typography.input}"
    rounded: "{rounded.r8}"
    padding: "8px 16px"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
    textColor: "{colors.surface}"
    rounded: "{rounded.r8}"
  search-field:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    typography: "{typography.body}"
    rounded: "{rounded.r9}"
    padding: "8px 38px 8px 34px"
    height: "38px"
  nav-item-active:
    backgroundColor: "{colors.primary-soft}"
    textColor: "{colors.primary-hover}"
    typography: "{typography.body}"
    rounded: "{rounded.nav}"
    padding: "0.78rem 0.95rem"
    height: "44px"
  assistant-scope:
    backgroundColor: "transparent"
    textColor: "{colors.text-muted}"
    typography: "{typography.control}"
    rounded: "{rounded.r12}"
    padding: "10px 12px"
    height: "46px"
  assistant-scope-selected:
    backgroundColor: "{colors.primary-soft}"
    textColor: "{colors.assistant-primary-text}"
    typography: "{typography.control}"
    rounded: "{rounded.r12}"
    padding: "10px 12px"
    height: "46px"
  assistant-result:
    backgroundColor: "{colors.background-subtle}"
    textColor: "{colors.text}"
    rounded: "{rounded.r14}"
    padding: "20px"
  assistant-composer:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.r14}"
    padding: "7px 8px 7px 16px"
    height: "56px"
  assistant-send:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface}"
    typography: "{typography.control}"
    rounded: "{rounded.r11}"
    padding: "0 14px"
    height: "44px"
  status-chip-success:
    backgroundColor: "color-mix(in srgb, #10b981 12%, transparent)"
    textColor: "{colors.assistant-success-text}"
    typography: "{typography.caption}"
    rounded: "{rounded.full}"
    padding: "4px 10px"
---

# Design System: Habil SuperApp

## Overview

**Creative North Star: "The Transparent Operations Desk"**

The system feels like a calm, premium operations desk: warm neutral surfaces, compact evidence, and a restrained indigo signal that helps operators find the next action without turning the dashboard into a spectacle. Habil Smart-Assistant is its clearest expression—assistant-shaped, but visibly deterministic, read-only, and accountable to business evidence.

Apple-HIG influence appears through precise hierarchy, generous touch targets, softened geometry, quiet elevation, and responsive reflow. Density is intentional on desktop and simplified on mobile; decoration never competes with the reason, evidence, status, or destination behind an operational recommendation.

**Key Characteristics:**

- Warm neutral surfaces with a single restrained indigo action voice.
- Structured evidence before decoration: summary, reason, figures, then action.
- Compact desktop density with opaque, touch-safe mobile reflow.
- Light and dark themes preserve semantic hierarchy and readable status contrast.
- Lucide line icons support labels; they do not replace operational language.

## Colors

The palette combines warm stone neutrals with indigo emphasis and explicit semantic status colors; light and dark values are paired rather than mechanically inverted.

### Primary

- **Operational Indigo** (`primary`, `primary-hover`, `primary-pressed`): primary actions, selected scopes, focus emphasis, and the Smart-Assistant mark.
- **Indigo Wash** (`primary-soft`, `primary-soft-dark`): selected controls, query surfaces, quiet badges, and low-attention emphasis.

### Secondary

- **Verified Green** (`success`, `success-dark`, `assistant-success-text`, `assistant-success-text-dark`): read-only verification, successful checks, and safe empty states.
- **Operational Amber** (`warning`, `warning-dark`, `assistant-warning-text`, `assistant-warning-text-dark`): conditions that need review but are not destructive.
- **Critical Red** (`danger`, `danger-dark`, `assistant-danger-text`, `assistant-danger-text-dark`): failed checks, critical recommendations, and destructive actions.

### Tertiary

- **Warm Accent** (`accent`): a limited supporting note in gradients; it is not a second action color.

### Neutral

- **Warm Canvas** (`background`, `background-subtle`): page field and nested operational regions in light mode.
- **Paper Surfaces** (`surface`, `surface-elevated`, `surface-raised`): cards, fields, dialogs, and elevated containers in light mode.
- **Stone Structure** (`border`, `border-strong`): separators and control boundaries.
- **Ink Hierarchy** (`text`, `text-muted`, `text-subtle`): primary copy, explanatory copy, and metadata.
- **Night Canvas and Surfaces** (`background-dark`, `background-subtle-dark`, `surface-dark`, `surface-elevated-dark`, `surface-raised-dark`): dark-mode layers with preserved separation.
- **Night Structure and Ink** (`border-dark`, `border-strong-dark`, `text-dark`, `text-muted-dark`, `text-subtle-dark`): dark-mode boundaries and text hierarchy.

**The One Action Voice Rule.** Indigo owns selection, focus, and forward action; semantic colors communicate state and must not become competing calls to action.

**The Evidence Before Accent Rule.** Color may prioritize evidence, but severity must also remain legible through labels, icons, borders, or structure.

## Typography

**Display Font:** Inter (with Apple and Segoe UI fallbacks)

**Body Font:** Inter (with Apple and Segoe UI fallbacks)

**Label/Mono Font:** JetBrains Mono (with system monospace fallbacks)

**Character:** Inter keeps dense operational copy neutral, crisp, and familiar across platforms. JetBrains Mono is reserved for code-like or fixed-width data contexts; financial and evidence values use tabular numerals even when set in Inter.

### Hierarchy

- **Display** (`display`, Inter, weight 800): desktop page titles and highest-level route identity.
- **Headline** (`headline`, Inter, weight 800): mobile page titles and compact high-emphasis headings.
- **Title** (`title`, Inter, weight 800): card, dialog, and result titles.
- **Body** (`body`, Inter, regular): explanations, recommendation summaries, and reason text; long introductory copy stays near 68 characters per line.
- **Input** (`input`, Inter, regular): editable text, kept at the mobile-safe size.
- **Control** (`control`, Inter, weight 800): compact scope and action labels with strong weight.
- **Label** (`label`, Inter, weight 700): metadata and supporting labels.
- **Caption** (`caption`, Inter, weight 700): tertiary metadata only; never the sole carrier of a critical state.
- **Mono** (`mono`, JetBrains Mono, weight 500): code-like values and fixed-width technical data when needed.

**The Operational Hierarchy Rule.** Use weight and spacing before increasing size; large display type is reserved for route identity, not every card.

**The Numeric Trust Rule.** Operational figures use tabular numerals so evidence aligns and can be compared without visual jitter.

## Layout

Desktop is the primary operating mode. The application shell reserves 284px for an expanded sidebar or 108px when collapsed; the content region remains fluid and clips accidental horizontal overflow. Smart-Assistant centers within a 1480px maximum canvas and uses a 280px scope rail beside a flexible evidence thread.

At 1023px and below, the assistant shell stacks the scope rail above the thread. At 767px and below, shared page padding contracts and form controls enforce 16px input text. At 639px and below, recommendation rows become vertical, controls keep at least 44px touch targets, and an opaque blurred app-bar safety layer protects mobile navigation legibility.

Spacing follows the normative `s0`–`s9` scale. Dense controls favor `s2` and `s3`; cards and section boundaries favor `s4` and `s5`; full-page breathing room uses `s6` and above.

**The Evidence Lane Rule.** Recommendations keep title, severity, summary, reason, numeric evidence, and destination action in one scannable lane before secondary context is introduced.

## Elevation & Depth

Depth is a hybrid of tonal layering, hairline borders, and diffuse ambient shadows. Surfaces remain solid; floating depth is reserved for the sidebar, dialogs, tooltips, and the Smart-Assistant shell. Dark mode reduces broad ambient lift and uses subtle border and inset highlights to keep adjacent layers distinct.

### Shadow Vocabulary

- **Flat** (`box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04)`): primary buttons and minimal separation.
- **Card** (`box-shadow: 0 10px 28px rgba(15, 23, 42, 0.06)`): standard cards and toolbars.
- **Hover** (`box-shadow: 0 18px 34px rgba(15, 23, 42, 0.08)`): intentional lifted states.
- **Floating** (`box-shadow: 0 28px 64px rgba(15, 23, 42, 0.18)`): shells, dialogs, and overlays.
- **Dark Flat** (`box-shadow: 0 1px 2px rgba(0, 0, 0, 0.28)`): minimal dark-mode separation.
- **Dark Card** (`box-shadow: 0 10px 28px rgba(0, 0, 0, 0.24)`): standard dark-mode cards.
- **Dark Hover** (`box-shadow: 0 18px 38px rgba(0, 0, 0, 0.3)`): intentional dark-mode lifted states.
- **Dark Floating** (`box-shadow: 0 34px 72px rgba(0, 0, 0, 0.42)`): dark-mode shells, dialogs, and overlays.

**The Solid Surface Rule.** Glass and blur are not card materials; blur is limited to the mobile app-bar safety layer and transient overlay contexts.

**The Ambient Elevation Rule.** Shadows communicate containment or temporary lift, never ornament or hard-edged decoration.

## Shapes

The form language is softly geometric. Compact controls use the lower `r8`–`r12` steps, evidence and composer surfaces use `r14`, major cards and shells use `r16` or `r20`, and badges use `full`. Borders are one-pixel structural lines; clipping is used when a shell contains distinct rail and thread regions.

**The Nested Radius Rule.** Inner controls use a smaller radius than the surface containing them, preserving visible hierarchy instead of rounding every layer equally.

## Components

### Buttons

- **Shape:** compact primary buttons use `r8`; assistant actions use `r11` or `r12` and maintain a 44px minimum touch height.
- **Primary:** solid Operational Indigo with white text; hover moves to `primary-hover`, press scales subtly, and disabled states lose emphasis without disappearing.
- **Focus:** the shared focus treatment is clearly visible; Smart-Assistant strengthens it to a three-pixel indigo outline with offset.
- **Secondary / Ghost:** solid neutral or transparent surfaces keep a structural border and inherit the same focus and press behavior.

### Chips

- **Style:** full-pill labels use semantic soft backgrounds and dedicated high-contrast text colors.
- **State:** chips explain verification or severity; color never replaces the written status.

### Cards / Containers

- **Corner Style:** standard cards use `r12`–`r16`; major application shells may use `r20`.
- **Background:** solid surface tokens or `background-subtle` for nested evidence regions.
- **Shadow Strategy:** standard cards use Card elevation; the Smart-Assistant shell uses Floating elevation.
- **Border:** one-pixel neutral borders define ordinary cards; the assistant shell uses clipping and tonal contrast between its rail and thread.
- **Internal Padding:** `s4` or `s5` for cards, with `s3` allowed on compact mobile states.

### Inputs / Fields

- **Style:** solid surface, one-pixel neutral border, and `r9`–`r14` corners depending on context.
- **Focus:** border shifts to Operational Indigo with a visible focus ring; the assistant composer applies focus to the containing field group.
- **Error / Disabled:** errors use Critical Red plus a soft field treatment; disabled controls use muted surfaces, muted text, and an explicit non-interactive cursor.

### Navigation

- **Style:** sidebar items are 44px minimum-height controls with icon-plus-label structure. The active item uses Indigo Wash, stronger text, and `aria-current`; the mobile variant becomes an opaque focus-trapped drawer.

### Scope Selector

- **Style:** scope choices are `r12` radio buttons with Lucide icons, compact labels, and a selected Indigo Wash state.
- **Behavior:** use semantic radiogroup markup, roving tabindex, and Arrow/Home/End navigation. Selection immediately runs the bounded rule set and must remain keyboard-equivalent to pointer use.

### Recommendation Evidence

- **Style:** each result presents summary, severity, explanation, numeric evidence, and destination action in that order inside a quiet nested surface.
- **Behavior:** loading, success, empty, and error states preserve the same location and announce changes through live regions; reduced-motion mode removes loader and progress animation.

## Do's and Don'ts

### Do:

- **Do** keep assistant capability copy explicit: rule-based, non-generative, read-only, and advisory.
- **Do** pair every recommendation with a reason, numerical evidence, severity label, and owning-module action.
- **Do** preserve 44px touch targets, visible keyboard focus, 16px mobile inputs, and reduced-motion behavior.
- **Do** use solid surfaces and restrained Indigo Wash to maintain trust in light and dark modes.
- **Do** keep dense information scannable through tabular numerals, short labels, and consistent evidence order.

### Don't:

- **Don't** use generative-AI imagery, chat theatrics, or copy that implies unsupported intelligence.
- **Don't** use semantic colors as decorative accents or rely on color alone to communicate severity.
- **Don't** add glass cards, decorative gradients, or strong shadows inside the evidence lane.
- **Don't** introduce content-bearing text below the `caption` role; the shipped 10px evidence and severity labels are implementation debt, not a system token.
- **Don't** canonize unavailable font weights; the shipped 850/900 declarations are implementation debt, so use the loaded Inter weights from the normative type roles.
