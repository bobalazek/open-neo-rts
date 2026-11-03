---

name: Open Neo RTS match HUD
description: Battlefield-first command stations in graphite steel and warm metal.
colors: { panel: "#182126", surface: "#10171b", ink: "#eff1e9", muted: "#b5c0bf", accent: "#ddc382", hud-line: "#475354" }
typography: { body: { fontFamily: '"Segoe UI", Tahoma, sans-serif', fontSize: "0.75rem", lineHeight: 1.35 }, title: { fontFamily: '"Segoe UI", Tahoma, sans-serif', fontSize: "0.8rem", fontWeight: 600 }, label: { fontFamily: '"Segoe UI", Tahoma, sans-serif', fontSize: "0.7rem", fontWeight: 600, lineHeight: 1.25 } }
rounded: { control: "2px" }
spacing: { tight: "0.25rem", dock: "0.5rem" }
components: { command-button: { textColor: "#e5d7b1", rounded: "{rounded.control}", padding: "0", height: "2.4rem" }, command-button-hover: { backgroundColor: "#394147", textColor: "#fff0ba" }, dock-panel: { backgroundColor: "#182126f5", rounded: "{rounded.control}", padding: "0.55rem" }, recipe-detail: { backgroundColor: "#172127", textColor: "{colors.ink}", padding: "0.75rem" } }
---

# Design System: Open Neo RTS match HUD

## Overview

**Creative North Star: "Graphite Command Stations"**

The normal match uses thin steel frames, warm metal command pictograms and
original model portraits around a dominant battlefield. Dense, quiet controls
support reading resources, inspecting real actor state and issuing orders.
There is no decorative animation; minimap activity communicates game events.

This records the built normal match only. Home, setup, results and debug surfaces
retain older styling and are outside this pass. The direction comes from the
first body comment in `../../apps/web/index.html` (canonRTS, seed `2a30a1e2`);
implementation evidence is `src/app/shell.css` and `src/features/match/`.

**Key Characteristics:**

- Battlefield first, with a slim resource strip and bottom command docks.
- Graphite surfaces, restrained brass highlights and tabular counters.
- Original brick models and original line pictograms.
- Narrow screens expose one dock through explicit panel tabs.

## Colors

Warm metal identifies controls against cool graphite; off-white carries primary
information and muted grey carries supporting state.

### Primary

- **Warm metal** (`accent`): active borders, selected panel tabs and resource icons.

### Neutral

- **Graphite panel** (`panel`): dock surfaces, with near-opaque variants over terrain.
- **Deep steel** (`surface`): resource strip and recessed control backgrounds.
- **Ivory ink** (`ink`): names and primary readouts.
- **Cool grey** (`muted`): selection details and secondary feedback.
- **Steel seam** (`hud-line`): panel frames and separators.

Health, warnings and map markers use existing state-specific colors; they do not
replace the command accent.
Sidecar tonal ramps are synthesized preview aids, not additional runtime colors.

## Typography

The interface uses the established Segoe UI/Tahoma sans-serif stack. There is no
display-type role in this HUD. Compact body copy, slightly stronger actor names
and small panel labels provide hierarchy; counters use tabular numerals.
Recipe explanations use a larger body treatment with generous line spacing.
Tiny hotkey legends and existing recipe-name text are incidental constraints,
not a recommended minimum size for new information.

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

**The Battlefield Rule.** Keep persistent controls at the viewport edges and
leave the central canvas available for play.

## Elevation & Depth

Thin borders, a lighter top seam, subtle vertical control gradients and shallow
black shadows separate the stations from terrain. Recipe explanations and ping
options rise above the dock with stronger shadows. The exact shadows are in the
sidecar; there is no decorative lift or ornamental motion.

## Shapes

Small squared corners and single-pixel frames define the HUD. Portraits are
contained within dark rectangular wells; the minimap stays square and pixelated.
Original SVG pictograms use consistent rounded line caps and joins.

## Components

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

### Don't:

- **Don't** promote legacy Home, setup, results or debug styling into this HUD.
- **Don't** substitute borrowed artwork or text glyphs for original model and SVG assets.
- **Don't** add ornamental animation that competes with battlefield activity.

Evidence: the five captures in `/tmp/neo-rts-hud-captures/` cover desktop, wide
desktop, mobile and desktop/mobile unavailable explanations. The scoped visual
review passed after recipe clipping and explanation legibility were resolved;
this is not a broad accessibility certification.
