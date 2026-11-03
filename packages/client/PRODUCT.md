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
  results also use native Babylon GUI. The match HUD now uses Babylon GUI on
  the world scene, with HTML retaining semantics, command controllers and a usable
  graphics fallback. Match loading and loading failures also use the shared native
  panel; debug retains HTML/CSS presentation.
- Native Home and setup preserve semantic HTML controls and usable graphics
  fallbacks. Setup keeps validation feedback and actions visible while content
  scrolls; focused fields and the checkbox scroll into view. Leaving setup
  cancels graphics initialization and restores the canvas attributes.
- Native setup text fields mirror semantic keyboard caret and selection alongside
  their focus frame. HTML retains keyboard and clipboard ownership; pointer text
  editing continues through the native controls.
- Settings use the same preferences, validation and storage from Home and in a
  match. Changes preview immediately; Apply persists them, while Back or cancel
  restores the saved preferences. Graphics failure leaves semantic HTML usable.
- The HTML dialog owns modal focus and Escape in a match. Its separate native
  panel canvas keeps the world renderer and save-thumbnail source intact, with
  the paused battlefield dimly visible behind it. Menu state and actions still
  come from the existing worker/controller; Current controls keeps the complete
  existing help text. Compact panels size and scroll from their actual content.
- Named saves and Load search in standalone and in-match galleries mirror semantic
  keyboard caret and selection with the same native text-field treatment as setup.
- Load shows original match thumbnails, selected-slot metadata and actions;
  desktop columns stack and scroll on narrow screens. Search keeps its native
  editor while rows change. Existing import validation, compatibility checks,
  changed-slot protection and restore handlers remain authoritative.
- Results keep native tabs, metric selection, original history plots and every
  final and sampled table row. Tables support pointer and keyboard scrolling;
  replay export, Rematch and Home invoke their existing handlers. HTML retains
  semantics, modal ownership and the usable graphics fallback for both surfaces.
- Loading presents the existing five initialization stages and actual progress,
  with Cancel using the same dismissal as Escape. A separate dialog and canvas
  keep feedback intact while the world initializes or redraws its root. Failure
  exposes the actual alert with Retry and Back; native graphics failure leaves
  semantic HTML usable. Focus returns only after the loading modal clears and
  only while the same navigation generation remains current. Loading a save from
  a match preserves the old world on failure or cancellation and restores focus
  to the initiating Load control.
- Browser review does not qualify physical touch, physical IME, screen readers,
  Firefox or hardware FPS.
- The match follows the owner's Age of Empires IV regional reference: actual
  objective at top left, clock and speed above, compact global icons at top right,
  populated groups on the left and notices above the right circular minimap.
  Economy stacks beside the bottom selection station; narrow layouts place it
  above the station. No selection means no station or invisible dock hit area.
- Selection shows the actual Force name and color chip, actor name/count, health
  and scrollable original-model type buttons with counts. Type buttons retain
  their existing selection callbacks. Mixed Forces retain readable names and a
  neutral accent chip. Original command pictograms keep persistent copy sparse.
  Hover and keyboard focus expose complete action descriptions, prices,
  requirements and unavailable reasons. Details exposes actor state and secondary
  controls; narrow layouts place it above the map and economy to preserve controls.
- World hover outlines use visible unit, structure or resource geometry, with the
  selected Supply Truck's current ore target remaining highlighted after hover
  clears. Fog, hidden markers and modal menus revoke feedback; cargo and target
  coordinates retain their existing economic permissions.
- Supply Truck mining and unloading use original collector/drum and cargo-bed
  motion. Work follows projected state, including pause and suspended dock work,
  and returning to idle restores the authored rest pose.
- Commands retain their existing hotkeys and stable QWER/ASDF/ZXCV slots. B switches
  the contextual build/train view, I toggles Details, and Escape closes auxiliary
  views. Populated groups appear directly; Groups reveals every group. Idle
  builder/producer helpers and existing group assign/add/recall controls remain.
- Icon mode controls switch Commands and Build / train; recipes use at most six
  columns and queue entries retain actual progress. Only short shortcut badges
  appear on compact buttons; full Home/Space labels remain in tooltips.
- The whole rotated square map fits within the circular minimap, including all
  corner cells. Existing navigation, orders, pings, zoom and keyboard controls
  keep their command handlers. Pause keeps Resume fixed in the header while the
  remaining actions scroll.
- The owner delegates routine choices; implement coherent defaults and review
  the running result instead of interrupting for repeated design approvals.
