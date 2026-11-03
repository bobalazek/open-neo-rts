---

name: Open Neo RTS Home and match HUD
description: Native Home and battlefield-first command stations in graphite steel and warm metal.
colors: { panel: "#182126", surface: "#10171b", ink: "#eff1e9", muted: "#b5c0bf", accent: "#ddc382", hud-line: "#475354", home-shade: "#10191e", home-control: "#18262e", home-primary: "#3c392d", home-hover: "#35434a", home-pressed: "#4a4535", home-focus: "#fff6db" }
typography: { body: { fontFamily: '"Segoe UI", Tahoma, sans-serif', fontSize: "0.75rem", lineHeight: 1.35 }, title: { fontFamily: '"Segoe UI", Tahoma, sans-serif', fontSize: "0.8rem", fontWeight: 600 }, label: { fontFamily: '"Segoe UI", Tahoma, sans-serif', fontSize: "0.7rem", fontWeight: 600, lineHeight: 1.25 }, home-body: { fontFamily: "Arial, sans-serif", fontSize: "17px" }, home-action: { fontFamily: "Arial, sans-serif", fontSize: "16px" }, home-support: { fontFamily: "Arial, sans-serif", fontSize: "13px" } }
rounded: { control: "2px", home-control: "0px" }
spacing: { tight: "0.25rem", dock: "0.5rem", home-action-gap: "8px", home-action-inset: "18px" }
components: { command-button: { textColor: "#e5d7b1", rounded: "{rounded.control}", padding: "0", height: "2.4rem" }, command-button-hover: { backgroundColor: "#394147", textColor: "#fff0ba" }, dock-panel: { backgroundColor: "#182126f5", rounded: "{rounded.control}", padding: "0.55rem" }, recipe-detail: { backgroundColor: "#172127", textColor: "{colors.ink}", padding: "0.75rem" }, home-button: { backgroundColor: "{colors.home-control}", textColor: "{colors.accent}", rounded: "{rounded.home-control}", typography: "{typography.home-action}" }, home-button-primary: { backgroundColor: "{colors.home-primary}", textColor: "{colors.accent}", rounded: "{rounded.home-control}", typography: "{typography.home-action}" }, home-button-hover: { backgroundColor: "{colors.home-hover}" }, home-button-active: { backgroundColor: "{colors.home-pressed}" } }
---

# Design System: Open Neo RTS Home and match HUD

## Overview

**Creative North Star: "Graphite Command Stations"**

The normal match uses thin steel frames, warm metal command pictograms and
original model portraits around a dominant battlefield. Dense, quiet controls
support reading resources, inspecting real actor state and issuing orders.
There is no decorative animation; minimap activity communicates game events.

Home shares graphite steel, warm metal and original assets through native Babylon
GUI. An original angular vector wordmark introduces an authored Dragon Tank on
an octagonal plinth. Plain, framed actions sit beside the model on desktop and
below it in portrait. Slow display rotation stops when reduced motion is requested.

This records the built Home and normal match. Other screens, including setup,
settings, load, results and debug, retain older styling and are outside this
system's current scope. The direction
comes from the first body comment in `../../apps/web/index.html`; implementation
evidence is `../render/src/scene/menu.ts`, `src/features/main-menu/index.ts`,
`src/app/shell.css` and `src/features/match/`.

**Key Characteristics:**

- Battlefield first, with a slim resource strip and bottom command docks.
- Graphite surfaces, restrained brass highlights and tabular counters.
- Original brick models and original line pictograms.
- Narrow screens expose one dock through explicit panel tabs.
- Native Home actions, original vector lettering and an authored model display.

## Colors

Warm metal identifies controls against cool graphite; off-white carries primary
information and muted grey carries supporting state.

### Primary

- **Warm metal** (`accent`): active borders, selected panel tabs and resource icons.
  Home uses it for action frames, labels and the main vector lettering.
- **Warm primary well** (`home-primary`): the current primary Home action.

### Neutral

- **Graphite panel** (`panel`): dock surfaces, with near-opaque variants over terrain.
- **Deep steel** (`surface`): resource strip and recessed control backgrounds.
- **Ivory ink** (`ink`): names and primary readouts.
- **Cool grey** (`muted`): selection details and secondary feedback.
- **Steel seam** (`hud-line`): panel frames and separators.
- **Home shade** (`home-shade`): the translucent navigation field over the scene.
- **Home control** (`home-control`): ordinary and secondary native action surfaces.
- **Home hover / pressed** (`home-hover`, `home-pressed`): pointer feedback.
- **Home focus** (`home-focus`): lightened action text on synchronized keyboard focus.

Health, warnings and map markers use existing state-specific colors; they do not
replace the command accent.
Sidecar tonal ramps are synthesized preview aids, not additional runtime colors.

## Typography

The match uses the established Segoe UI/Tahoma sans-serif stack. There is no
display-type role in this HUD. Compact body copy, slightly stronger actor names
and small panel labels provide hierarchy; counters use tabular numerals.
Recipe explanations use a larger body treatment with generous line spacing.
Tiny hotkey legends and existing recipe-name text are incidental constraints,
not a recommended minimum size for new information.

Home uses Arial/sans-serif for readable supporting type and native actions. The
frontmatter records base sizes; the renderer multiplies them by its bounded UI
scale. Version and secondary actions use a smaller treatment (12px base). The
wordmark is original SVG path lettering, not a display-font token.

## Layout

On desktop, the bottom grid holds minimap, flexible selection, command card and
construction catalog. Selection absorbs spare width rather than enlarging the
commands. Command and construction grids use four columns. Control groups sit
immediately above the docks; notices and contextual feedback float above them.

At the existing medium breakpoint the docks tighten. At the narrow breakpoint,
four panel buttons switch the visible dock, the resource strip wraps and group
controls scroll horizontally. Commands use eight columns, reducing to six on
the smallest layout; construction retains four. Dock content can scroll while
the battlefield remains visible. Breakpoint values live in the sidecar.

Home uses a full-viewport scene with a near-opaque left navigation field on desktop
and a lighter full-width field below its narrow breakpoint (alpha 0.96 and 0.18,
respectively). The desktop inset
is at least 44px, and action width is bounded by 360px times UI scale and 37% of
viewport width. Portrait uses 24px side insets and stacks actions below the model.
Short landscape (width greater than height, height below 600px) puts the wordmark
and supporting text in the left column and actions in the right column, including
568px-wide viewports. Main action rows retain a minimum height of 44px,
with the documented gap between them. Secondary debug actions and version sit
near the bottom; the model caption is hidden in the narrow layout.

**The Battlefield Rule.** Keep persistent controls at the viewport edges and
leave the central canvas available for play.

## Elevation & Depth

Thin borders, a lighter top seam, subtle vertical control gradients and shallow
black shadows separate the stations from terrain. Recipe explanations and ping
options rise above the dock with stronger shadows. The exact shadows are in the
sidecar; there is no decorative lift or ornamental motion in the match.

Home depth comes from the actual lit model, ground, fog and octagonal display
plinth, with flat GUI rectangles over it. Controls do not use drop shadows or
hover lift. A warm seam traces the plinth edge.

## Shapes

Small squared corners and single-pixel frames define the HUD. Portraits are
contained within dark rectangular wells; the minimap stays square and pixelated.
Original SVG pictograms use consistent rounded line caps and joins.
Home controls have square corners and thin warm frames; secondary actions omit
the frame at rest. Angular vector lettering and the eight-sided plinth carry
the Home silhouette.

## Components

- **Native Home actions:** left-aligned labels with the documented inner inset.
  Primary and ordinary actions have distinct dark fills; hover lightens the
  surface and press warms it. Synchronized HTML focus lightens text and thickens
  the frame from 1px to 2px. Continue, when available, becomes the primary action.
  The Single player action expands to Skirmish, Load and Back; Escape returns.
- **Home semantic navigation:** real HTML buttons retain accessible names,
  keyboard activation and expansion state while the visible interface is Babylon
  GUI. They are visually clipped only after the GUI has rendered its actions;
  the ready marker is published after that render. Home removes the canvas from
  the tab order and accessibility tree, clears its stale match label, and restores
  the previous attributes on disposal. Graphics failure leaves the HTML controls
  visible and displays a status message. A model load failure hides its caption
  while the navigation remains usable.
- **Home model display:** the owner's Eastern Collective Dragon Tank uses its
  original brick model. Rotation is slow and frame-time bounded; either the device
  setting or operating-system reduced-motion preference stops it.
- **Command buttons:** centered line pictograms, a corner hotkey and an accessible
  action name. Hover and armed states use the warm border and lighter surface;
  unavailable commands dim. Preserve the inherited visible focus outline.
- **Selection station:** original model portrait, actual name/count, health bar
  and permitted actor details. Health bars remain bounded rather than stretching
  across the entire flexible panel.
- **Construction cards:** original model thumbnail, authored name, resource costs
  and time. Costs wrap as complete units and time occupies its own row. Cards
  remain inspectable when unavailable; explanations appear on hover, focus or
  activation and include the actual reason. Escape dismisses the explanation.
- **Narrow panel navigation:** equal-width text buttons; the active panel has a
  warm border and text. Retain explicit names for selection, commands,
  construction/production and minimap.
- **Minimap and groups:** square terrain view, compact icon controls, a framed
  ping popover and dense text/select controls. Feedback appears above the dock.

**The Complete Recipe Rule.** Keep every displayed resource amount and build
time visible, and make unavailable reasons readable on desktop and mobile.

## Do's and Don'ts

### Do:

- **Do** preserve the owner's original model assets and authored names.
- **Do** use real match state for portraits, counters, availability and feedback.
- **Do** preserve full recipe values and readable unavailable explanations.
- **Do** retain accessible action names, visible focus and narrow panel switching.
- **Do** keep native Home controls synchronized with semantic HTML and preserve the graphics fallback.
- **Do** honor reduced motion in the Home model display.

### Don't:

- **Don't** promote legacy setup, results or debug styling into Home or the match HUD.
- **Don't** substitute borrowed artwork or text glyphs for original model and SVG assets.
- **Don't** add ornamental animation that competes with battlefield activity.

Evidence: the five captures in `/tmp/neo-rts-hud-captures/` cover desktop, wide
desktop, mobile and desktop/mobile unavailable explanations. The scoped visual
review passed after recipe clipping and explanation legibility were resolved;
this is not a broad accessibility certification.
Home evidence is `.impeccable/review/desktop.png`, `.impeccable/review/mobile.png`
at the repository root and the final `/tmp/neo-menu-landscape.png`. The one
mechanical detector pass (`/tmp/neo-menu-detector.json`) reported 39 incumbent
shell palette advisories; those legacy colors are not Home palette tokens.
