# Open Neo RTS client

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users and purpose

Players command a Force in a real-time strategy game: manage a base and economy,
produce units, navigate terrain, fight and win a skirmish. The current normal
match is an Eastern Collective mirror on Training Grounds against a basic bot.

## Capabilities and constraints

The client consumes permitted worker observations and emits validated commands;
presentation never changes simulation state. Existing selection, construction,
production, orders, minimap, saves and match-result behavior must survive UI work.
Skirmish setup retains the existing validator, saved setup format and normal
match path. Its native fields and semantic form share values; the map preview
uses authored Training Grounds terrain, resources and selected spawn coordinates.
Online play and the complete three-faction game remain later roadmap phases.
See `../../docs/project/roadmap.md` and `../../docs/design/screens/match-hud.md`.

## Brand commitments

Keep the owner's original factions, names, content and brick models. The owner
rejected the current oversized form-like HUD and requested a UI comparable to
established RTS games. Use familiar RTS interface conventions and make the
battlefield the primary surface. Reference games studied for this pass are
StarCraft II, Age of Empires IV and Command & Conquer; their artwork is not an asset
source.

## Product principles

- The battlefield remains visible while the player commands units.
- Show the selected actors' actual state and context-appropriate controls.
- Preserve accessible names, keyboard controls and narrow-screen operation.
- The owner prefers native Babylon GUI for game presentation. Home, Skirmish
  setup, device Settings and the pause menu's actions, Objectives, Current controls
  and named-save panes use it. Standalone and in-match Load galleries and match
  results also use native Babylon GUI. Loading feedback, debug and match HUD
  retain HTML/CSS presentation during the staged conversion.
- Native Home and setup preserve semantic HTML controls and usable graphics
  fallbacks. Setup keeps validation feedback and actions visible while content
  scrolls; focused fields and the checkbox scroll into view. Leaving setup
  cancels graphics initialization and restores the canvas attributes.
- Native pointer text editing shows a caret and selection. Semantic setup text
  editing currently shows the native focus frame without mirrored caret or
  selection; the remaining polish is recorded in `../../docs/project/tasks.md`.
- Settings use the same preferences, validation and storage from Home and in a
  match. Changes preview immediately; Apply persists them, while Back or cancel
  restores the saved preferences. Graphics failure leaves semantic HTML usable.
- The HTML dialog owns modal focus and Escape in a match. Its separate native
  panel canvas keeps the world renderer and save-thumbnail source intact, with
  the paused battlefield dimly visible behind it. Menu state and actions still
  come from the existing worker/controller; Current controls keeps the complete
  existing help text. Compact panels size and scroll from their actual content.
- Semantic text entry in setup and named saves retains the deferred native
  caret/selection-mirroring polish; focus frames remain synchronized. This does
  not claim screen-reader or physical-device qualification.
- Load shows original match thumbnails, selected-slot metadata and actions;
  desktop columns stack and scroll on narrow screens. Search keeps its native
  editor while rows change. Existing import validation, compatibility checks,
  changed-slot protection and restore handlers remain authoritative.
- Results keep native tabs, metric selection, original history plots and every
  final and sampled table row. Tables support pointer and keyboard scrolling;
  replay export, Rematch and Home invoke their existing handlers. HTML retains
  semantics, modal ownership and the usable graphics fallback for both surfaces.
- Native pointer text entry includes a caret. Semantic text entry in Load shares
  the deferred caret/selection-mirroring polish; synchronized focus remains visible.
  Browser review does not qualify physical touch, assistive technology or hardware FPS.
- The owner delegates routine choices; implement coherent defaults and review
  the running result instead of interrupting for repeated design approvals.
