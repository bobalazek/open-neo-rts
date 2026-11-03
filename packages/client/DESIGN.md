---

name: Open Neo RTS Home, Skirmish setup and match HUD
description: Native Home and Skirmish setup with battlefield-first command stations in graphite steel and warm metal.
colors: { panel: "#182126", surface: "#10171b", ink: "#eff1e9", muted: "#b5c0bf", accent: "#ddc382", hud-line: "#475354", home-shade: "#10191e", home-control: "#18262e", home-primary: "#3c392d", home-hover: "#35434a", home-pressed: "#4a4535", home-focus: "#fff6db", setup-input-focus: "#25343b", force-you: "#81d4ed", force-opponent: "#efa394" }
typography: { body: { fontFamily: '"Segoe UI", Tahoma, sans-serif', fontSize: "0.75rem", lineHeight: 1.35 }, title: { fontFamily: '"Segoe UI", Tahoma, sans-serif', fontSize: "0.8rem", fontWeight: 600 }, label: { fontFamily: '"Segoe UI", Tahoma, sans-serif', fontSize: "0.7rem", fontWeight: 600, lineHeight: 1.25 }, home-body: { fontFamily: "Arial, sans-serif", fontSize: "17px" }, home-action: { fontFamily: "Arial, sans-serif", fontSize: "16px" }, home-support: { fontFamily: "Arial, sans-serif", fontSize: "13px" }, setup-heading: { fontFamily: "Arial, sans-serif", fontSize: "20px" }, setup-body: { fontFamily: "Arial, sans-serif", fontSize: "14px" }, setup-field: { fontFamily: "Arial, sans-serif", fontSize: "16px" }, setup-action: { fontFamily: "Arial, sans-serif", fontSize: "15px" } }
rounded: { control: "2px", home-control: "0px" }
spacing: { tight: "0.25rem", dock: "0.5rem", home-action-gap: "8px", home-action-inset: "18px" }
components: { command-button: { textColor: "#e5d7b1", rounded: "{rounded.control}", padding: "0", height: "2.4rem" }, command-button-hover: { backgroundColor: "#394147", textColor: "#fff0ba" }, dock-panel: { backgroundColor: "#182126f5", rounded: "{rounded.control}", padding: "0.55rem" }, recipe-detail: { backgroundColor: "#172127", textColor: "{colors.ink}", padding: "0.75rem" }, home-button: { backgroundColor: "{colors.home-control}", textColor: "{colors.accent}", rounded: "{rounded.home-control}", typography: "{typography.home-action}" }, home-button-primary: { backgroundColor: "{colors.home-primary}", textColor: "{colors.accent}", rounded: "{rounded.home-control}", typography: "{typography.home-action}" }, home-button-hover: { backgroundColor: "{colors.home-hover}" }, home-button-active: { backgroundColor: "{colors.home-pressed}" }, setup-input: { backgroundColor: "{colors.home-control}", textColor: "{colors.ink}", rounded: "{rounded.home-control}", typography: "{typography.setup-field}", height: "44px" }, setup-action: { backgroundColor: "{colors.home-control}", textColor: "{colors.accent}", rounded: "{rounded.home-control}", typography: "{typography.setup-action}", height: "44px" }, setup-action-primary: { backgroundColor: "{colors.home-primary}", textColor: "{colors.accent}", rounded: "{rounded.home-control}", typography: "{typography.setup-action}", height: "44px" } }
---

# Design System: Open Neo RTS Home, Skirmish setup and match HUD

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

Skirmish setup extends the native graphite field with compact Force rows, framed
inputs and a top-down preview of authored Training Grounds. Content scrolls
within a fixed header and action area; validation feedback stays above the actions.

This records the built Home, Skirmish setup and normal match HUD. Settings, load,
results and debug retain their existing presentation outside this system's current
scope. Home and setup use native GUI; the recorded HUD retains its HTML/CSS
presentation. The direction
comes from the first body comment in `../../apps/web/index.html`; implementation
evidence is `../render/src/scene/menu.ts`, `src/features/main-menu/index.ts`,
`../render/src/scene/skirmish.ts`, `src/features/skirmish/index.ts`,
`src/app/shell.css` and `src/features/match/`.

**Key Characteristics:**

- Battlefield first, with a slim resource strip and bottom command docks.
- Graphite surfaces, restrained brass highlights and tabular counters.
- Original brick models and original line pictograms.
- Narrow screens expose one dock through explicit panel tabs.
- Native Home actions, original vector lettering and an authored model display.
- Native setup fields, compact Force rows and an authored terrain preview.

## Colors

Warm metal identifies controls against cool graphite; off-white carries primary
information and muted grey carries supporting state.

### Primary

- **Warm metal** (`accent`): active borders, selected panel tabs and resource icons.
  Home and setup use it for action frames and labels; Home also uses it for the
  main vector lettering.
- **Warm primary well** (`home-primary`): the current primary Home action and setup Start.

### Secondary

- **Your Force / opposing Force** (`force-you`, `force-opponent`): distinguish
  Force labels and their selected spawn markers without replacing readable names.

### Neutral

- **Graphite panel** (`panel`): dock surfaces, with near-opaque variants over terrain.
- **Deep steel** (`surface`): resource strip and recessed control backgrounds.
- **Ivory ink** (`ink`): names and primary readouts.
- **Cool grey** (`muted`): selection details and secondary feedback.
- **Steel seam** (`hud-line`): panel frames and separators.
- **Home shade** (`home-shade`): the translucent Home navigation field and opaque setup background.
- **Home control** (`home-control`): ordinary native actions, setup fields and scroll track.
- **Home hover / pressed** (`home-hover`, `home-pressed`): native action pointer feedback.
- **Home focus** (`home-focus`): lightened action text on synchronized keyboard focus.
- **Setup input focus** (`setup-input-focus`): the native text editor's focused fill.

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

Setup uses the same Arial family. Section headings, rule-field text, action labels
and supporting notes form a compact ramp. Field captions use the Home support
size. The page title is larger and bold (32px base); Force faction labels use the
Home body size on wide screens and reduce to the setup action size on narrow ones.
Setup scales the page title, field captions and text, faction labels, action
labels and notes with its bounded UI scale. Section headings, Force names, map
name and checkbox label retain their base font sizes.

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

Setup switches to two columns at a width of 900px times its effective UI scale:
Force rows and Rules occupy the left 55%, with Map to the right across a 32px
scaled gap. Narrower views stack Forces, Map and Rules. Rules keep a two-column
field grid. The inset is 24px below 700px width, otherwise at least 36px or 5%
of the viewport. The effective scale is the smaller of the device setting and
the greater of 0.85 or viewport width divided by 390.

The scroll region sits below a 100px scaled header and above a reserved footer
(126px scaled when wide; 180px otherwise). Back remains in the header; feedback
and four actions remain outside the scroll region. Actions occupy one row when
wide and a two-by-two grid otherwise, with 44px scaled heights. Focused fields,
spawn options and the veterancy checkbox scroll into view. The square map preview
is bounded by its column width and 340px times scale.

## Elevation & Depth

Thin borders, a lighter top seam, subtle vertical control gradients and shallow
black shadows separate the stations from terrain. Recipe explanations and ping
options rise above the dock with stronger shadows. The exact shadows are in the
sidecar; there is no decorative lift or ornamental motion in the match.

Home depth comes from the actual lit model, ground, fog and octagonal display
plinth, with flat GUI rectangles over it. Controls do not use drop shadows or
hover lift. A warm seam traces the plinth edge.
Setup is flat: framed controls and the terrain image sit directly on the opaque
graphite field, with no decorative shadows or motion.

## Shapes

Small squared corners and single-pixel frames define the HUD. Portraits are
contained within dark rectangular wells; the minimap stays square and pixelated.
Original SVG pictograms use consistent rounded line caps and joins.
Home controls have square corners and thin warm frames; secondary actions omit
the frame at rest. Angular vector lettering and the eight-sided plinth carry
the Home silhouette.
Setup shares square native controls. Small circular spawn markers use an ivory
frame around the matching Force color; the terrain preview stays square.

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
- **Setup Force rows:** each row places the actual Force name and full faction
  name beside a labeled spawn-choice button. Native options open below the button
  in 44px rows and update the shared form value and map marker.
- **Setup rule inputs:** native InputText controls show and edit the existing
  seed and numeric rules; a native Checkbox and its clickable label toggle
  veterancy. Native pointer editing has a caret and selection, a focused fill
  and warm border. Semantic focus uses a thicker native field frame (2px),
  checkbox frame (3px) or action frame (2px). Semantic text edits do not yet mirror
  their caret or selection; this limitation is tracked in `../../docs/project/tasks.md`.
- **Setup actions and feedback:** framed native buttons center their labels;
  Start uses the warm primary well. Hover and press reuse Home fills. The existing
  controller owns validation, save/load/defaults and match start. Invalid values
  disable Start and dim it to 0.4 alpha. Errors take priority over status and use
  a light coral treatment; feedback remains above the fixed actions.
- **Setup map preview:** the actual authored terrain grid supplies biome, water,
  surface and height shading; resource positions and selected spawn coordinates
  overlay it. Preview failure leaves an explicit unavailable message, without a
  fabricated map. Match loading remains responsible for validating terrain.
- **Setup semantic form:** labeled HTML inputs, spawn selects, checkbox, buttons,
  live status and alert remain synchronized with native controls. They are clipped
  only after the GUI draws; graphics initialization failure leaves the form
  visible. The canvas is excluded from assistive focus and its previous attributes
  return on disposal. Leaving setup cancels engine initialization and disposes its
  scene. These mechanisms preserve access without claiming screen-reader or
  physical-device qualification.
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
- **Do** keep native Home and setup controls synchronized with semantic HTML and preserve the graphics fallback.
- **Do** honor reduced motion in the Home model display.
- **Do** use authored terrain, resource positions and selected spawns for the setup preview.

### Don't:

- **Don't** promote legacy settings, load, results or debug styling into Home, setup or the match HUD.
- **Don't** substitute borrowed artwork or text glyphs for original model and SVG assets.
- **Don't** add ornamental animation that competes with battlefield activity.

Evidence: the five captures in `/tmp/neo-rts-hud-captures/` cover desktop, wide
desktop, mobile and desktop/mobile unavailable explanations. The scoped visual
review passed after recipe clipping and explanation legibility were resolved;
this is not a broad accessibility certification.
Earlier Home evidence included the review desktop/mobile captures and the final
`/tmp/neo-menu-landscape.png`; those review paths now contain setup captures. The one
mechanical detector pass (`/tmp/neo-menu-detector.json`) reported 39 incumbent
shell palette advisories; those legacy colors are not Home palette tokens.
Setup evidence is the repository-root `.impeccable/review/desktop.png`
(1440 × 1000), `.impeccable/review/mobile.png` (390 × 844),
`/tmp/neo-setup-mobile-rules.png` and `/tmp/neo-setup-landscape.png`.
Its one mechanical detector pass reported 37 incumbent shell palette advisories;
these are not new setup tokens. The visual finish review identified the stale
product/design records corrected here; the known semantic caret/selection gap
remains tracked as input polish.
