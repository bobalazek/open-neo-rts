---

name: Open Neo RTS native menus and match HUD
description: Native Home, setup and game panels with a battlefield-first HTML HUD in graphite steel and warm metal.
colors: { panel: "#182126", surface: "#10171b", ink: "#eff1e9", muted: "#b5c0bf", accent: "#ddc382", hud-line: "#475354", home-shade: "#10191e", home-control: "#18262e", home-primary: "#3c392d", home-hover: "#35434a", home-pressed: "#4a4535", home-focus: "#fff6db", setup-input-focus: "#25343b", force-you: "#81d4ed", force-opponent: "#efa394", panel-error: "#ffb7a8", modal-shade: "#071018" }
typography: { body: { fontFamily: '"Segoe UI", Tahoma, sans-serif', fontSize: "0.75rem", lineHeight: 1.35 }, title: { fontFamily: '"Segoe UI", Tahoma, sans-serif', fontSize: "0.8rem", fontWeight: 600 }, label: { fontFamily: '"Segoe UI", Tahoma, sans-serif', fontSize: "0.7rem", fontWeight: 600, lineHeight: 1.25 }, home-body: { fontFamily: "Arial, sans-serif", fontSize: "17px" }, home-action: { fontFamily: "Arial, sans-serif", fontSize: "16px" }, home-support: { fontFamily: "Arial, sans-serif", fontSize: "13px" }, setup-heading: { fontFamily: "Arial, sans-serif", fontSize: "20px" }, setup-body: { fontFamily: "Arial, sans-serif", fontSize: "14px" }, setup-field: { fontFamily: "Arial, sans-serif", fontSize: "16px" }, setup-action: { fontFamily: "Arial, sans-serif", fontSize: "15px" }, panel-title: { fontSize: "27px", fontWeight: 700 }, panel-body: { fontFamily: "Arial, sans-serif", fontSize: "15px" }, panel-field: { fontSize: "16px" }, panel-help: { fontFamily: "Arial, sans-serif", fontSize: "13px" } }
rounded: { control: "2px", home-control: "0px" }
spacing: { tight: "0.25rem", dock: "0.5rem", home-action-gap: "8px", home-action-inset: "18px" }
components: { command-button: { textColor: "#e5d7b1", rounded: "{rounded.control}", padding: "0", height: "2.4rem" }, command-button-hover: { backgroundColor: "#394147", textColor: "#fff0ba" }, dock-panel: { backgroundColor: "#182126f5", rounded: "{rounded.control}", padding: "0.55rem" }, recipe-detail: { backgroundColor: "#172127", textColor: "{colors.ink}", padding: "0.75rem" }, home-button: { backgroundColor: "{colors.home-control}", textColor: "{colors.accent}", rounded: "{rounded.home-control}", typography: "{typography.home-action}" }, home-button-primary: { backgroundColor: "{colors.home-primary}", textColor: "{colors.accent}", rounded: "{rounded.home-control}", typography: "{typography.home-action}" }, home-button-hover: { backgroundColor: "{colors.home-hover}" }, home-button-active: { backgroundColor: "{colors.home-pressed}" }, setup-input: { backgroundColor: "{colors.home-control}", textColor: "{colors.ink}", rounded: "{rounded.home-control}", typography: "{typography.setup-field}", height: "44px" }, setup-action: { backgroundColor: "{colors.home-control}", textColor: "{colors.accent}", rounded: "{rounded.home-control}", typography: "{typography.setup-action}", height: "44px" }, setup-action-primary: { backgroundColor: "{colors.home-primary}", textColor: "{colors.accent}", rounded: "{rounded.home-control}", typography: "{typography.setup-action}", height: "44px" }, panel-input: { backgroundColor: "{colors.home-shade}", textColor: "{colors.ink}", rounded: "{rounded.home-control}", typography: "{typography.panel-field}", height: "44px" }, panel-action: { backgroundColor: "{colors.home-control}", textColor: "{colors.accent}", rounded: "{rounded.home-control}", height: "44px" }, panel-action-primary: { backgroundColor: "{colors.home-primary}", textColor: "{colors.accent}", rounded: "{rounded.home-control}", height: "44px" } }
---

# Design System: Open Neo RTS native menus and match HUD

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

Settings, pause actions, Objectives, Current controls and named saves extend
the same native graphite vocabulary through a shared content-sized panel.
In a match it floats above the dimmed battlefield; the HTML dialog owns modal
focus and Escape while its separate canvas leaves the world renderer intact.

This records the built Home, Skirmish setup, shared native panels and normal
match HUD. The Load gallery, results and debug retain their HTML presentation
outside this system's current scope. The recorded HUD also retains its HTML/CSS
presentation. The direction
comes from the first body comment in `../../apps/web/index.html`; implementation
evidence is `../render/src/scene/menu.ts`, `src/features/main-menu/index.ts`,
`../render/src/scene/skirmish.ts`, `src/features/skirmish/index.ts`,
`../render/src/scene/panel.ts`, `src/shared/native-panel.ts`,
`src/features/settings/`, `src/features/in-game-menu/`, `src/app/shell.css`
and `src/features/match/`.

**Key Characteristics:**

- Battlefield first, with a slim resource strip and bottom command docks.
- Graphite surfaces, restrained brass highlights and tabular counters.
- Original brick models and original line pictograms.
- Narrow screens expose one dock through explicit panel tabs.
- Native Home actions, original vector lettering and an authored model display.
- Native setup fields, compact Force rows and an authored terrain preview.
- Native content-sized Settings and pause panes over an intact match renderer.

## Colors

Warm metal identifies controls against cool graphite; off-white carries primary
information and muted grey carries supporting state.

### Primary

- **Warm metal** (`accent`): active borders, selected panel tabs and resource icons.
  Home and setup use it for action frames and labels; Home also uses it for the
  main vector lettering.
- **Warm primary well** (`home-primary`): the current primary Home action, setup Start,
  Settings Apply and pause Resume.

### Secondary

- **Your Force / opposing Force** (`force-you`, `force-opponent`): distinguish
  Force labels and their selected spawn markers without replacing readable names.
- **Panel error** (`panel-error`): shared-panel alert text.

### Neutral

- **Graphite panel** (`panel`): dock surfaces, with near-opaque variants over terrain.
- **Deep steel** (`surface`): resource strip and recessed control backgrounds.
- **Ivory ink** (`ink`): names and primary readouts.
- **Cool grey** (`muted`): selection details and secondary feedback.
- **Steel seam** (`hud-line`): panel frames and separators.
- **Home shade** (`home-shade`): the translucent Home navigation field and opaque setup background.
- **Home control** (`home-control`): ordinary native actions, setup fields and setup scroll track.
- **Home hover / pressed** (`home-hover`, `home-pressed`): native action pointer feedback.
- **Home focus** (`home-focus`): lightened action text on synchronized keyboard focus.
- **Setup input focus** (`setup-input-focus`): the focused fill of native text editors,
  including the named-save field.
- **Modal shade** (`modal-shade`): the native pause canvas's dimming layer.

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

Shared Settings and pause panels render in Arial. Paragraphs, captions and help
explicitly set Arial; titles, notices, buttons and InputText inherit Babylon's
current default rather than declaring a separate family. Their base ramp is a bold title
(27px), text fields (16px), body/captions/actions (15px) and help/status/error
(13px). The renderer multiplies these by
`min(device UI scale, max(0.85, viewport width / 390))`; device choices are
0.75, 1, 1.25 and 1.5, so a selected 0.75 remains 0.75. This is the built scale,
not a minimum readable-size recommendation. Wrapped paragraphs, captions, help
and notices use canvas text measurement at the matching Arial size, reserving
1.4 times font size per measured line, including explicit line breaks.

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

Shared panels center a frame capped at 920px times scale for Settings or 720px
times scale for other panes. Viewport edge insets are 12px below 600px width and
24px otherwise; inner padding is 16px or 28px at the same threshold. Content
uses two columns when its inner width reaches 650px times scale, otherwise one,
with a 24px scaled column gap. Inputs and actions are 44px scaled tall;
checkboxes are 26px scaled beside a caption at least 44px scaled tall.

Rows use the taller actual label/control/help stack and a 24px scaled gap.
Empty help has no reserved block. The body and actions scroll together; Back,
title, status and errors remain outside that region. Frame height fits measured
content until it reaches viewport height minus both edge insets. The header
reserves 82px scaled plus an 8px scaled gap and measured status only when present;
the footer reserves 20px scaled plus a 16px scaled gap and measured error only
when present. Action rows use a 52px scaled pitch. Focus reveals its control and
help when the combined span fits the scroll region.

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
Shared panels are likewise flat, using an opaque graphite frame and steel seam.
Modal depth comes from the transparent separate canvas and its dark shade
(0.6 alpha) over the world, without a decorative shadow or hover lift.

## Shapes

Small squared corners and single-pixel frames define the HUD. Portraits are
contained within dark rectangular wells; the minimap stays square and pixelated.
Original SVG pictograms use consistent rounded line caps and joins.
Home controls have square corners and thin warm frames; secondary actions omit
the frame at rest. Angular vector lettering and the eight-sided plinth carry
the Home silhouette.
Setup shares square native controls. Small circular spawn markers use an ivory
frame around the matching Force color; the terrain preview stays square.
Settings and pause panels retain square rectangles, thin steel outer frames
and warm control frames. Text fields use the opaque Home shade at rest.

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
- **Shared native panel:** Settings from Home and the match, pause actions,
  Objectives, Current controls and named saves reuse one native renderer.
  Framed actions use Home's ordinary/primary/hover/pressed fills; disabled actions
  dim to 0.4 alpha. Inputs, selects and checkboxes share semantic values and
  existing handlers. Keyboard focus thickens the corresponding frame to 2px.
  Native selects open framed 44px option rows; Escape closes the list first.
  Current controls preserves the complete existing help copy, with height derived
  from actual wrapping rather than an estimated character count.
- **Settings preview and feedback:** quality, UI scale, camera speed, edge scroll
  and reduced motion keep existing validation and storage. Preview applies live;
  Apply saves, Defaults previews defaults and Back/cancel restores saved values.
  Status is warm metal, errors light coral; empty notices reserve no extra block.
- **Pause dialog and named saves:** the HTML dialog owns modal focus, Escape and
  the existing pause/resume workflow. Its canvas is separate from the match canvas,
  preserving world rendering and save thumbnails. Resume uses the primary fill;
  menu actions retain current availability and pending states. The named-save
  field preserves required/max-length validation and existing save handlers.
  The Load gallery stays HTML and removes native panel presentation while open.
- **Panel semantics and fallback:** semantic labels, controls, status and alerts
  remain authoritative, clipped only after a native frame has drawn. The canvas
  stays outside assistive focus; disposal restores its prior attributes and
  cancels initialization. Graphics failure leaves HTML visible. Native pointer
  text editing shows a caret/selection, while semantic text editing mirrors focus
  but not yet its caret or selection; this remains deferred input polish.
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
- **Do** keep native Home, setup and panel controls synchronized with semantic HTML and preserve the graphics fallback.
- **Do** honor reduced motion in the Home model display.
- **Do** use authored terrain, resource positions and selected spawns for the setup preview.
- **Do** size shared panels from measured content and keep modal rendering separate from the match canvas.

### Don't:

- **Don't** promote legacy Load gallery, results or debug styling into the recorded native surfaces or match HUD.
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
Earlier setup evidence used the repository-root `.impeccable/review/` captures,
`/tmp/neo-setup-mobile-rules.png` and `/tmp/neo-setup-landscape.png`; the review
paths are reused by later passes. Final shared-panel evidence is
`/tmp/neo-settings-desktop.png`, `/tmp/neo-settings-mobile.png`,
`/tmp/neo-menu-overlay-desktop.png` and `/tmp/neo-settings-overlay-mobile.png`.
The panel pass's one mechanical detector run reported 37 incumbent CSS palette
advisories; these are not new panel tokens. Visual review identified excess
compact reservations and stale product/design records; measured rows and
content-sized notices/frame plus this documentation address those findings.
The known semantic caret/selection gap remains tracked as input polish.
