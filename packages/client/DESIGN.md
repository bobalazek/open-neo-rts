---

name: Open Neo RTS native menus and match HUD
description: Native Home, setup, game panels, Load and results with a battlefield-first native Babylon HUD in graphite steel and warm metal.
colors: { panel: "#182126", ink: "#eff1e9", muted: "#b5c0bf", accent: "#ddc382", hud-line: "#475354", home-shade: "#10191e", home-control: "#18262e", home-primary: "#3c392d", home-hover: "#35434a", home-pressed: "#4a4535", home-focus: "#fff6db", setup-input-focus: "#25343b", force-you: "#81d4ed", force-opponent: "#efa394", panel-error: "#ffb7a8", modal-shade: "#071018" }
typography: { body: { fontFamily: "Arial, sans-serif", fontSize: "13px" }, title: { fontFamily: "Arial, sans-serif", fontSize: "14px", fontWeight: 700 }, label: { fontFamily: "Arial, sans-serif", fontSize: "12px" }, hotkey: { fontFamily: "Arial, sans-serif", fontSize: "10px" }, count: { fontFamily: "Arial, sans-serif", fontSize: "11px" }, home-body: { fontFamily: "Arial, sans-serif", fontSize: "17px" }, home-action: { fontFamily: "Arial, sans-serif", fontSize: "16px" }, home-support: { fontFamily: "Arial, sans-serif", fontSize: "13px" }, setup-heading: { fontFamily: "Arial, sans-serif", fontSize: "20px" }, setup-body: { fontFamily: "Arial, sans-serif", fontSize: "14px" }, setup-field: { fontFamily: "Arial, sans-serif", fontSize: "16px" }, setup-action: { fontFamily: "Arial, sans-serif", fontSize: "15px" }, panel-title: { fontSize: "27px", fontWeight: 700 }, panel-body: { fontFamily: "Arial, sans-serif", fontSize: "15px" }, panel-field: { fontSize: "16px" }, panel-help: { fontFamily: "Arial, sans-serif", fontSize: "13px" } }
rounded: { control: "0px", home-control: "0px" }
spacing: { command-gap: "5px", station-inset: "12px", home-action-gap: "8px", home-action-inset: "18px" }
components: { command-button: { backgroundColor: "{colors.home-control}", textColor: "{colors.ink}", rounded: "{rounded.control}", padding: "0", height: "36px", width: "36px" }, command-button-active: { backgroundColor: "{colors.home-primary}" }, dock-panel: { backgroundColor: "{colors.panel}", rounded: "{rounded.control}" }, recipe-detail: { backgroundColor: "{colors.panel}", textColor: "{colors.ink}", padding: "12px", typography: "{typography.body}" }, home-button: { backgroundColor: "{colors.home-control}", textColor: "{colors.accent}", rounded: "{rounded.home-control}", typography: "{typography.home-action}" }, home-button-primary: { backgroundColor: "{colors.home-primary}", textColor: "{colors.accent}", rounded: "{rounded.home-control}", typography: "{typography.home-action}" }, home-button-hover: { backgroundColor: "{colors.home-hover}" }, home-button-active: { backgroundColor: "{colors.home-pressed}" }, setup-input: { backgroundColor: "{colors.home-control}", textColor: "{colors.ink}", rounded: "{rounded.home-control}", typography: "{typography.setup-field}", height: "44px" }, setup-action: { backgroundColor: "{colors.home-control}", textColor: "{colors.accent}", rounded: "{rounded.home-control}", typography: "{typography.setup-action}", height: "44px" }, setup-action-primary: { backgroundColor: "{colors.home-primary}", textColor: "{colors.accent}", rounded: "{rounded.home-control}", typography: "{typography.setup-action}", height: "44px" }, panel-input: { backgroundColor: "{colors.home-shade}", textColor: "{colors.ink}", rounded: "{rounded.home-control}", typography: "{typography.panel-field}", height: "44px" }, panel-action: { backgroundColor: "{colors.home-control}", textColor: "{colors.accent}", rounded: "{rounded.home-control}", height: "44px" }, panel-action-primary: { backgroundColor: "{colors.home-primary}", textColor: "{colors.accent}", rounded: "{rounded.home-control}", height: "44px" } }
---

# Design System: Open Neo RTS native menus and match HUD

## Overview

**Creative North Star: "Graphite Command Stations"**

The normal match uses thin steel frames, warm metal command pictograms and
original model portraits around a dominant battlefield. The native bottom-left
station integrates selection, contextual icon commands,
build/train recipes and queue progress beside a circular right minimap. Quiet
controls support reading resources, inspecting real actor state and issuing orders.
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

Load and results extend that shared native panel with original match thumbnails,
selected-slot details, framed tabs, history plots and complete scrollable tables.
Their existing controllers and semantic HTML remain authoritative; the canvas
copies display values and invokes the same actions.

This records the built Home, Skirmish setup, shared native panels, Load, results
and native normal match HUD. Loading feedback and debug retain HTML/CSS
presentation; the match retains synchronized semantic controls and its HTML
graphics fallback. The direction
comes from the first body comment in `../../apps/web/index.html`; implementation
evidence is `../render/src/scene/menu.ts`, `src/features/main-menu/index.ts`,
`../render/src/scene/skirmish.ts`, `src/features/skirmish/index.ts`,
`../render/src/scene/panel.ts`, `../render/src/scene/panel-content.ts`,
`src/shared/native-panel.ts`, `src/shared/panel-content.ts`,
`src/features/settings/`, `src/features/in-game-menu/`,
`../render/src/scene/battlefield-hud.ts`, `../render/src/scene/battlefield-map.ts`,
`src/features/match/native-hud.ts`
and `src/features/match/`, `src/features/load-game/`, `src/features/post-match/`.

**Key Characteristics:**

- Battlefield first, with a slim resource strip, integrated station and right circular map.
- Graphite surfaces, restrained brass highlights and compact numeric counters.
- Original brick models and original line pictograms.
- Narrow screens switch commands/build within the station; the map remains visible.
- Complete action descriptions on hover/focus and content-sized actor Details.
- Native Home actions, original vector lettering and an authored model display.
- Native setup fields, compact Force rows and an authored terrain preview.
- Native content-sized Settings and pause panes over an intact match renderer.
- Native save galleries with original match thumbnails and selected-slot details.
- Native results with original plots and complete scrollable match records.

## Colors

Warm metal identifies controls against cool graphite; off-white carries primary
information and muted grey carries supporting state.

### Primary

- **Warm metal** (`accent`): active borders, selected panel tabs and resource icons.
  Home and setup use it for action frames and labels; Home also uses it for the
  main vector lettering.
- **Warm primary well** (`home-primary`): the current primary Home action, setup Start,
  Settings Apply, pause Resume, selected save rows and selected results tabs.

### Secondary

- **Your Force / opposing Force** (`force-you`, `force-opponent`): distinguish
  Force labels and their selected spawn markers without replacing readable names.
- **Panel error** (`panel-error`): shared-panel alert text.

### Neutral

- **Graphite panel** (`panel`): opaque resource strip, station, tooltip and Details frames.
- **Ivory ink** (`ink`): names, primary readouts and focused rich save-row/table frames.
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

The native match HUD explicitly uses Arial, matching the native menus. There is
no display-type role in the HUD. Actor names are bold and scale from the title
role; tooltip, Details, feedback and command-mode text use the body role. Resource
readouts, health and text-only action labels use the label role. Corner hotkeys
and count badges use the smaller hotkey and count roles; these dense annotations
do not establish a minimum readable size for future explanatory text. Hover/focus
descriptions measure wrapping at 1.4 times body size per line. Station dimensions
and actor-name type use the effective match scale; most compact readout and
annotation sizes remain fixed. The match scale is
`min(device UI scale, max(0.85, viewport width / 900))`.

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

Shared Settings, pause, Load and results panels render in Arial. Paragraphs, captions and help
explicitly set Arial; titles, notices, buttons and InputText inherit Babylon's
current default rather than declaring a separate family. Their base ramp is a bold title
(27px), text fields (16px), body/captions/actions (15px) and help/status/error
(13px). The renderer multiplies these by
`min(device UI scale, max(0.85, viewport width / 390))`; device choices are
0.75, 1, 1.25 and 1.5, so a selected 0.75 remains 0.75. This is the built scale,
not a minimum readable-size recommendation. Wrapped paragraphs, captions, help
and notices use canvas text measurement at the matching Arial size, reserving
1.4 times font size per measured line, including explicit line breaks.

Rich content uses the same scaled Arial family: section headings (20px base),
paragraphs (14px), save names (15px), save dates (12px), table titles (16px) and
table cells/image captions (13px). Table headers use bold warm metal; body cells
use ivory. These dense record roles do not establish a new display face or a
minimum size for future surfaces.

## Layout

The native match uses a full-width resource strip, a bottom-left selection and
command station, and a circular minimap at the right. The station combines the
portrait, actual actor name/count, bounded health bar, commands, contextual
build/train icons and queue progress. Commands keep four stable keyboard columns
(QWER / ASDF / ZXCV); recipes fill the available width. Desktop shows commands
and available recipes together, rather than splitting them across independent docks.

Below 940px viewport width, the station spans the width minus two edge insets;
Commands and Build / train switch its contextual grid. The minimap moves above
the station at the right and shrinks from a 216px to 144px base diameter. Below
650px, resources wrap into at most three columns and reserve another row for top
actions. Main station and map dimensions follow the effective match scale.

Details fits its actual text and secondary actions, scrolls at its height cap,
and stays between the resource strip and station. Hover/focus descriptions are
content-sized and constrained to viewport edges. Idle helpers and populated
control groups sit above the station; Groups reveals every group. Temporary
feedback sits below resources, and a bounded notice list sits above the station.
Pointer-blocking regions use CSS pixels even when graphics resolution changes.

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

Shared panels center a frame capped at 1240px times scale for Load/results,
920px times scale for Settings or 720px times scale for other panes.
Viewport edge insets are 12px below 600px width and
24px otherwise; inner padding is 16px or 28px at the same threshold. Content
uses two columns when its inner width reaches 650px times scale, otherwise one,
with a 24px scaled column gap. Inputs and actions are 44px scaled tall;
checkboxes are 26px scaled beside a caption at least 44px scaled tall.

Rows use the taller actual label/control/help stack and a 24px scaled gap.
Empty help has no reserved block. The body and ordinary actions scroll together;
Back, Resume, title, status and errors remain outside that region. Pause Resume occupies a
fixed primary action at the header right. Frame height fits measured
content until it reaches viewport height minus both edge insets. The header
reserves 82px scaled plus an 8px scaled gap and measured status only when present;
the footer reserves 20px scaled plus a 16px scaled gap and measured error only
when present. Action rows use a 52px scaled pitch. Focus reveals its control and
help when the combined span fits the scroll region.

Load and results fill the available height within those edge insets. The Load
gallery uses equal list/detail columns with a 32px scaled gap when its inner
width reaches 760px times scale. Otherwise the selected detail follows the list.
Detail actions follow the selected record in its column. Native search and filter
fields retain their identity when rows rebuild, preserving the search editor.

Results tabs wrap into as many columns as fit a 130px scaled base width, with
44px scaled buttons and 52px scaled row pitch. Rich blocks have 16px scaled gaps.
Images preserve their source aspect ratio. Each table has its own horizontal and
vertical scroll region, capped at 340px times scale; wrapped rows keep every cell
and sampled row. The outer body also scrolls, revealing a focused row or region.

## Elevation & Depth

The native match HUD is flat: opaque graphite frames and thin steel seams
separate information from terrain. Warm borders identify hover, ivory thicker
frames identify synchronized focus, and warm wells identify armed or selected
actions. Tooltips and Details sit above the scene without gradients or shadows.
There is no ornamental motion in the match.

Home depth comes from the actual lit model, ground, fog and octagonal display
plinth, with flat GUI rectangles over it. Controls do not use drop shadows or
hover lift. A warm seam traces the plinth edge.
Setup is flat: framed controls and the terrain image sit directly on the opaque
graphite field, with no decorative shadows or motion.
Shared panels are likewise flat, using an opaque graphite frame and steel seam.
Modal depth comes from the transparent separate canvas and its dark shade
(0.6 alpha) over the world, without a decorative shadow or hover lift.

## Shapes

Square corners and single-pixel frames define the native HUD. Portraits keep
their original proportions; the minimap uses a circular brass frame. Its full
pixelated square terrain is rotated by 45 degrees and inscribed within the circle,
so every corner remains visible and reachable. Focus thickens the map frame in ivory.
Original SVG pictograms use consistent rounded line caps and joins.
Home controls have square corners and thin warm frames; secondary actions omit
the frame at rest. Angular vector lettering and the eight-sided plinth carry
the Home silhouette.
Setup shares square native controls. Small circular spawn markers use an ivory
frame around the matching Force color; the terrain preview stays square.
Settings, pause, Load and results panels retain square rectangles, thin steel
outer frames and warm control frames. Text fields use the opaque Home shade at rest.
Shared native choice fields include an original SVG line chevron at the right;
the text leaves space for that disclosure mark.

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
- **Command buttons:** centered original line pictograms or model thumbnails, a
  corner hotkey and optional count/progress. Hover warms the frame; armed commands
  use the primary well. Synchronized focus thickens the ivory frame to 2px.
  Unavailable actions dim to 0.45 alpha and retain explanations; activation keeps
  validation in the existing controller. B switches build/train; I toggles Details.
  Those local shortcuts are visible from initial widget creation.
- **Shared native panel:** Settings from Home and the match, pause actions,
  Objectives, Current controls, named saves, Load and results reuse one native renderer.
  Framed actions use Home's ordinary/primary/hover/pressed fills; disabled actions
  dim to 0.4 alpha. Inputs, selects and checkboxes share semantic values and
  existing handlers. Keyboard focus thickens the corresponding frame to 2px.
  Native selects show an original SVG disclosure chevron and open framed 44px
  option rows; Escape closes the list first.
  Current controls preserves the complete existing help copy, with height derived
  from actual wrapping rather than an estimated character count.
- **Settings preview and feedback:** quality, UI scale, camera speed, edge scroll
  and reduced motion keep existing validation and storage. Preview applies live;
  Apply saves, Defaults previews defaults and Back/cancel restores saved values.
  Status is warm metal, errors light coral; empty notices reserve no extra block.
- **Pause dialog and named saves:** the HTML dialog owns modal focus, Escape and
  the existing pause/resume workflow. Its canvas is separate from the match canvas,
  preserving world rendering and save thumbnails. Resume uses the primary fill
  and remains fixed at the header right while the other actions scroll; menu
  actions retain current availability and pending states. The named-save
  field preserves required/max-length validation and existing save handlers.
  Opening Load keeps native panel presentation and uses the same separate canvas.
- **Load gallery:** original match thumbnails accompany saved names and dates;
  selected rows use the warm primary fill and thicker frame. Rich row focus uses
  an ivory 3px frame. Selected detail shows the original thumbnail, metadata,
  compatibility feedback and actual Load/export/delete actions. Empty and filtered
  lists retain explicit feedback. Search edits preserve the native editor as the
  list changes. Import, validation, changed-slot checks and restore stay with the
  existing controller.
- **Results:** native framed tabs and a metric choice expose the actual completed
  match record. Original SVG history plots retain their legends and accessible
  descriptions through semantic HTML. Final tables and expandable sampled-value
  tables copy every row. Ivory 2px borders identify focused table regions; pointer
  scrolling and arrows, Page Up/Down, Home/End preserve access to the full record.
  Replay export, Rematch and Home invoke existing handlers; pending replay feedback
  and errors remain visible.
- **Panel semantics and fallback:** semantic labels, controls, status and alerts
  remain authoritative, clipped only after a native frame has drawn. The canvas
  stays outside assistive focus; disposal restores its prior attributes and
  cancels initialization. Graphics failure leaves HTML visible. Native pointer
  text editing shows a caret/selection, while semantic text editing mirrors focus
  but not yet its caret or selection; this remains deferred input polish.
- **Selection station:** original model portrait, actual name/count and bounded
  health bar integrated with commands, contextual recipes and the production queue.
  Details opens above it with the actual actor statistics, selection-type controls,
  orders, construction/request controls and secondary group controls. It fits
  measured content up to its height cap and then scrolls. Escape closes Details
  and the expanded group view before handing control back to the battlefield.
- **Recipes and action descriptions:** original thumbnails keep the station terse.
  Hover or synchronized keyboard focus shows complete authored names, resource
  prices, build time, requirements and actual unavailable reasons. Disabled recipe
  activation leaves the explanation readable; player-facing reasons avoid internal
  content-authoring vocabulary. Focusing a hidden recipe switches its station view.
- **Context navigation:** Commands and Build / train use square framed controls
  and the primary well for the selected view. Desktop can show both grids; compact
  views show the selected grid while retaining selection, queue and map.
- **Minimap:** the circular frame contains the complete rotated square map and a
  north indicator. Permitted minimap pixels come from the existing controller.
  Navigation, drag, orders, pings and zoom retain their existing handlers; point
  mapping reverses rotation and rejects the circle's non-map corners. Map actions
  sit immediately below the circle.
- **Groups and helpers:** only populated groups appear by default. Groups reveals
  all numbered groups; badges show population. Hover/focus explains recall, Ctrl
  assign and Ctrl+Shift add. Idle builder and producer helpers retain their period
  and comma shortcuts. Secondary assign/add controls remain in Details.
- **Match semantics and fallback:** the world scene owns visible Babylon controls;
  semantic HTML keeps accessible names, keyboard command handling and live state.
  Controls are visually clipped only after the native HUD draws. Native activation
  invokes existing controller actions; keyboard focus opens the matching native
  view and description. Disposal restores the HTML presentation.

**The Complete Recipe Rule.** Keep complete prices, build times, requirements
and unavailable reasons reachable through action hover/focus descriptions.

## Do's and Don'ts

### Do:

- **Do** preserve the owner's original model assets and authored names.
- **Do** use real match state for portraits, counters, availability and feedback.
- **Do** preserve full recipe values and readable unavailable explanations.
- **Do** retain accessible action names, visible focus and contextual command switching.
- **Do** keep native Home, setup, panel and match controls synchronized with semantic HTML and preserve the graphics fallback.
- **Do** honor reduced motion in the Home model display.
- **Do** use authored terrain, resource positions and selected spawns for the setup preview.
- **Do** size shared panels from measured content and keep modal rendering separate from the match canvas.
- **Do** preserve original save thumbnails, plot descriptions and every result-table row through responsive scrolling.

### Don't:

- **Don't** promote fallback HTML shell or debug styling into the recorded native surfaces or match HUD.
- **Don't** substitute borrowed artwork or text glyphs for original model and SVG assets.
- **Don't** add ornamental animation that competes with battlefield activity.

This records implementation evidence rather than test qualification; it does not
qualify physical touch, assistive technology or hardware FPS. Incumbent palette advisories and one-off
review previews are not design tokens. Semantic text-entry caret/selection
mirroring remains deferred input polish rather than a rule for future controls.
