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
The first playable local replay viewer supports that Eastern Collective mirror
on Training Grounds. Portable serialized keyframes, recorded camera tracks,
timeline event markers, analytics overlays and live network spectating remain
deferred; this does not complete the replay/spectator phase.
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
- Keyboard controls in Settings and the pause menu use the same native panel to
  edit a versioned device-local profile for 64 currently implemented normal-match
  actions. Category, action and primary/alternate choices expose up to two
  physical key-code chords per action, including an unbound state. Capture,
  clearing, per-action defaults and Grid/WASD presets stay staged until Apply;
  conflicts name the actions and block Apply. Escape or window blur cancels
  capture. Bounded JSON import stages validated values; export downloads the
  staged profile. Failed persistence preserves the previous active profile.
  Successful Apply refreshes the running match's controls and captions without
  a restart. Quicksave/load shortcuts are optional and unbound by default.
  The provisional WASD preset keeps F1 unassigned; see
  `../../docs/project/decisions/2026-11-03-match-input-bindings.md`.
  Debug/replay controls, mouse/audio options and unimplemented actions retain
  their own scope. Physical-key and OS accelerator capture remain unqualified.
- The HTML dialog owns modal focus and Escape in a match. Its separate native
  panel canvas keeps the world renderer and save-thumbnail source intact, with
  the paused battlefield dimly visible behind it. Menu state and actions still
  come from the existing worker/controller; Current controls keeps the complete
  existing help text. Compact panels size and scroll from their actual content.
- Leave, Restart, replacing a match by Load and browser Back ask whether to save
  before continuing. The separate native modal first pauses the worker and keeps
  the parent pane, world and thumbnail source intact. Players can edit the save
  name, choose primary Save and continue, explicitly continue without saving, or
  use fixed-header Cancel. A manual save must finish before replacement; pending
  work disables competing choices. Failure retains the match and edited name
  with an actual alert and retry through Save. Cancel or Escape restores the
  previous pause state and focus. Match ending or disposal removes the prompt
  and prevents late asynchronous work from continuing navigation. Reload or
  close uses the browser's unsaved-progress warning.
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
- Home's Single player menu opens the native Replay library; finished-match Watch
  replay stores the terminal record and opens the viewer. Search, selected-record
  details, Rename, Export, Delete and Import share the existing native gallery
  treatment. Desktop list/detail columns stack and scroll on narrow screens.
  Thumbnails reuse the original installed Training Grounds preview, not imported
  images. HTML owns semantics, keyboard/clipboard editing and the library's usable
  graphics fallback.
- Replay playback has its own read-only worker. Visible Babylon transport,
  timeline, vision and right circular minimap consume verified copied snapshots;
  permitted credits, materials, unit counts and original active-production
  thumbnails reflect the current view. All vision and recorded-seat vision keep
  their respective permissions. The map pans/zooms; it cannot issue orders or pings.
  Semantic button, speed/vision select and timeline focus is mirrored natively.
  Tab moves through speed, vision and timeline; the timeline explicitly participates
  in sequential focus.
  Space toggles playback, J/L jump ten seconds, brackets cycle speed, V cycles
  vision and Escape returns to the library; fields retain ordinary keyboard use.
- Replays use separate IndexedDB storage from saves. Import accepts the local
  envelope or legacy terminal record, validates installed simulation/content and
  reproduces the terminal result before storing a new ID. Incompatible Watch is
  disabled; damaged rows remain visible and removable when their key is valid.
  Rename/delete reject stale revisions. Actual verification progress, Cancel and
  failure alerts retain recovery to the library without deleting its record;
  navigation cancels the candidate worker and ignores late replies. Details:
  `../../docs/project/decisions/2026-11-03-native-replay-viewer.md`.
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
- Commands retain stable four-column slots independently of their live key
  captions. Grid defaults are QWER/ASDF/ZXCV, with B switching the contextual
  build/train view and I toggling Details; the device profile can remap them.
  Escape closes auxiliary views. Populated groups appear directly; Groups
  reveals every group. Idle builder/producer helpers and group assign/add/recall
  controls use the active profile while preserving their existing actions.
- Icon mode controls switch Commands and Build / train; recipes use at most six
  columns and queue entries retain actual progress. Only short shortcut badges
  appear on compact buttons; full Home/Space labels remain in tooltips.
- The whole rotated square map fits within the circular minimap, including all
  corner cells. Existing navigation, orders, pings, zoom and keyboard controls
  keep their command handlers. Pause keeps Resume fixed in the header while the
  remaining actions scroll.
- The owner delegates routine choices; implement coherent defaults and review
  the running result instead of interrupting for repeated design approvals.
