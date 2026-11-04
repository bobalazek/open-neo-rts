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
  Mouse camera sensitivity offers 50%, 75%, 100%, 150% and 200% for wheel zoom,
  right-drag panning and middle-drag rotation; keyboard/edge pan speed and
  programmatic zoom remain separate. Invert drag rotation reverses only horizontal
  middle-drag rotation. The version-two device payload reads version-one profiles
  with 100% sensitivity and inversion off while preserving their existing choices.
  Failed Apply restores the saved preview and retains the edited fields for retry.
- Settings → Audio opens the same native pane from Home and a match. One
  application-owned Babylon Audio V2 mixer activates lazily through a user
  gesture and survives navigation, with Master plus Music, Effects, Unit voices,
  Announcer, Interface and Ambience channels. Integer percentages preview live;
  Test sound uses the selected channel (Master tests Interface). Mute all and
  mute when unfocused preserve channel levels. Defaults previews the provisional
  defaults; Apply saves a separate versioned device profile. Back/cancel restores
  saved levels; a failed write keeps both the saved profile and editable preview.
  Only Audio uses title-derived contextual native hover/focus tooltips with hidden
  semantic `aria-describedby` text; status and errors stay visible, and permanent
  help elsewhere stays in place. Shared native choice popups fit the viewport,
  reveal the selected value initially and scroll by wheel or scrollbar drag;
  pointer selection reaches all 101 percentages and long Controls action lists.
  The original procedural PCM interface/test cue and data-resolved normal-match
  fire/death seam establish the initial path. No authored gameplay clips exist
  yet; effects/music/speech assets, announcements/subtitles/priority queue,
  playlist/ducking, loudness validation and replay audio remain open. This does
  not complete first-playable audio. Hardware hearing and OS media keys remain
  unqualified. See `../../docs/project/decisions/2026-11-03-device-audio-mixer.md`.
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
- Contextual guidance uses a versioned local-browser profile. Settings stages
  All, Important (the provisional default) or Off and Show hints again until
  Apply; Back discards the draft and failed persistence keeps editable recovery.
  Four once-only hints use permitted observations: low power, an owned actor
  under attack, a visible enemy weapon's authored damage bonus against an owned
  actor's armour, and an idle builder. The weapon hint indicates a multiplier
  above 100%, not a universal counter or final damage. Important
  omits the idle-builder hint; hints are spaced by at least 20 simulation seconds.
  One brief native hint offers More and Dismiss; a failed history write reports
  session-only retention. Optional HUD help labels active regions while existing
  individual hover/focus tooltips retain complete action descriptions and live
  shortcuts. Empty selection still leaves no selection station.
- Hint More and selection Details reference links open the actual installed
  Field Manual entry through the paused match menu. They preserve the same worker
  and world, update the selection target while paused, and focus/reveal the entry
  at the top of the reading viewport, including narrow unfiltered galleries.
- Field Manual is available at `/manual`, from Home and in the paused match
  menu. Its shared native gallery contains 15 actor entries (the 14-entry Eastern
  Collective roster and neutral Resource Extractor) plus four guide entries for
  economy, fog, combat and current keyboard bindings. All entries, Units,
  Structures and Concepts and controls filters accompany search, which includes
  guide titles and text. Original icons accompany installed compiled statistics,
  costs, requirements, weapon facts and expandable armour multipliers. Target
  restrictions still apply; multipliers do not promise final damage. Produces
  and Builds relationships show only the current roster.
  Desktop gives more space to the selected details; narrow layouts stack.
  Selecting an entry reveals and focuses its heading; Back to search focuses
  search. Inspect model opens the actual installed GLB in an isolated orbit/zoom
  scene with native controls, loading status and fetch-failure Retry. Escape
  returns focus to its initiating control; closing cancels/disposes pending work.
  Idle animation honors both device and operating-system reduced motion. The
  preview uses the current blue color without a color control. Embedded browsing
  and inspection preserve the paused world. HTML retains semantics and the
  gallery's usable graphics fallback. Training, owner playtesting and tuning
  recommendations remain separate work; this does not complete all
  first-playable guidance.
- Loading presents the existing five initialization stages and actual progress,
  with Cancel using the same dismissal as Escape. A separate dialog and canvas
  keep feedback intact while the world initializes or redraws its root. Failure
  exposes the actual alert with Retry and Back; native graphics failure leaves
  semantic HTML usable. Focus returns only after the loading modal clears and
  only while the same navigation generation remains current. Loading a save from
  a match preserves the old world on failure or cancellation and restores focus
  to the initiating Load control.
- Content tools at `/tools/content` and Home's developer footer provide the
  model-inspection portion of 2-38a. Search covers the 137 installed model
  definitions by name or ID; `?model=` accepts only an installed qualified ID or
  exact registered model URL. Open local GLB and model-canvas drop accept
  self-contained files up to 16 MiB, without writes or uploads. Successful local
  loading clears the installed selection. Installed models retain their authored
  validation kind and requirements; local files use the chosen kind.
  Real team materials, authored animation clips, supported LOD branches and
  damage-state nodes respond to their controls; the initial pose rests until a
  clip is chosen. Project checks share `modelRequirements` and `validateModel`
  with the CLI. Diagnostics, materials, nodes and sockets use expandable native
  tables with keyboard scrolling, full counts and a disclosed 100-entry display
  cap. A failed candidate retains the last good model, controls and diagnostics
  with Retry. Native Open and Retry stay outside the scrolling body; Open and
  validation-kind help use contextual hover/focus descriptions, and the model
  canvas names orbit, zoom and drop interactions. Existing interface scale and
  semantic HTML/fallback remain in use. Grid/scale reference, gizmos, material
  mappings remain follow-up work. This does not complete the
  content editor; see `../../docs/project/decisions/2026-11-04-model-inspection-tools.md`.
- Fire, Destroy and Restore model provide the isolated firing/destruction slice
  of 2-38c2 in the same native pane, including while editing. Actions use the
  loaded snapshot; unsaved fields apply only after Preview model. Fire resolves
  authored assigned sockets (or standalone muzzle sockets), plays available
  `fire_recoil`/`attack` and shows a short flash plus fixed model-relative +Z
  tracer. It demonstrates socket direction without audio, gameplay range or
  combat simulation. Destroy plays the complete authored death clip or scatters
  at most 32 visible original geometry pieces before showing the paired wreck.
  Matching driven turret/barrel pivots carry aiming relative to rest, preserving
  authored wreck tilt and other geometry. Standalone art without a wreck
  disappears after its effect. Restore returns to rest with team, LOD and damage
  choices retained. The inspected model/wreck pair replaces the old view only
  together; failure or supersession retains the last good view and Retry.
  Replacement/disposal releases owned effects and paired containers; retained
  editor playtests pause the effect clock. No sources, saves, normal matches or
  simulation state change. Full 2-38b2 validation/formatter parity and 2-38d
  socket/part gizmos, GLB export and damage-socket smoke/fire previews stay open. See
  `../../docs/project/decisions/2026-11-04-model-action-previews.md`.
- The same model-first tool includes 2-38b1 editing of existing unit, structure
  and prop definitions from owner-selected pack folders. Opened packs supply
  dependencies. Schema-derived scalar, enum, boolean, nested object, record and
  array fields use applicable General/Combat/Visuals/Production/Upgrades/Eras
  tabs, contextual descriptions/units and one optional/collection-change menu;
  opaque values retain a JSON field. Compact status names the definition, pack
  and unsaved state; the picker exposes its full source path through contextual
  help. The original model remains left on desktop and above controls when narrow.
  File System Access writes only the selected existing file; the read-only
  folder-input fallback downloads a copy and keeps the source dirty. No file is
  uploaded, and the installed built-in catalog and simulation state stay intact.
  Save/download checks copied drafts through shared schemas, pack resolution,
  references/identity, gameplay compilation and model requirements. Writable
  folders are re-read; only the target JSON is replaced for validation. Loading,
  validation and saving lock competing controls. Invalid numeric/JSON text
  survives tab changes, and failed selection restores the actual picker identity.
  Back/replacement retain save-or-discard guards; unload retains the browser guard.
  Latest target text is compared before validation and before writing. A conflict
  replaces fields with changed-leaf comparisons and pinned Reload/Keep choices;
  failed writes retain the draft. The comparison discloses its 100-row/512-character
  display caps while preserving both versions. These optimistic checks cannot
  prevent another program writing after the final comparison. Provisional bounds
  are 2 MiB per JSON, 256 MiB combined runtime data, 10,000 directory entries and
  32 directory levels. Output currently uses two-space JSON and a final newline.
  Full runtime audio, source freshness and exact formatter parity remain
  2-38b2. The whole 2-38b task and asset editing (2-38d) remain open. See
  `../../docs/project/decisions/2026-11-04-browser-definition-authoring.md`.
- New from selected completes 2-38b3 sibling creation from a clean unit,
  structure or prop in an opened pack. Authors enter a new display name and
  sibling folder name; the original model and source identity stay visible
  beside/above the two native fields and pinned actions. The copied co-located
  folder preserves models, editable sources, asset metadata and credits. Kind
  and namespace stay intact; exact self-references are remapped. Shared checks
  gate creation. Writable folders are re-read, payloads are written and verified,
  and the updated manifest is published last; destination/manifest conflicts stop
  creation. Failed writes remove only unchanged files created by the operation,
  preserve changed or inaccessible files with recovery feedback and retain the
  entered names. Successful creation selects and previews the result. Read-only
  folders offer Download changes ZIP, also available for writable folders. It
  contains the new folder and updated manifest as a changes bundle to extract
  into a copy of the selected pack, not a standalone pack; downloading leaves the
  source intact. Cancel creation returns to the original definition. Controls
  lock while busy. Template copies including editable sources are bounded to
  256 MiB. Browser writes remain optimistic, without atomic multi-file isolation.
  This authors drafts without changing the built-in roster or simulation; it
  does not close 2-38b2 or asset editing. See
  `../../docs/project/decisions/2026-11-04-definition-creation.md`.
- Playtest draft beside Save opens the existing HTML debug worker with a validated
  copy of the selected existing definition, including unsaved edits. This 2-38c1
  slice checks movement, health and placement. Writable packs are refreshed and the draft
  is substituted only in copied validation inputs. Shared resolution, gameplay
  compilation, provenance and GLB checks gate launch. Checked model bytes become
  local Blob URLs for that session; neither source files nor normal matches change.
  The draft starts selected in the spawn palette. Node structures start on
  Sandbox: Resources; naval units and shore/water footprints use Sandbox: Water;
  other definitions use Sandbox: Flat. Existing map, palette and Force controls
  remain manual, with no opponent AI. Return to draft leads the bounded scrolling
  debug pane and remains available after worker failure. The editor retains its
  fields while model/panel rendering is suspended; returning disposes the worker,
  scene and temporary URLs, restores the native pane and resumes the model.
  Canonical command-log export includes the copied simulation definitions and
  commands. Copy initial setup link is disabled because URLs cannot carry this
  draft and its models; export reproduces simulation, not an asset pack. Native
  debug conversion and full 2-38b2 validation parity remain separate work. See
  `../../docs/project/decisions/2026-11-04-draft-debug-playtest.md`.
- Skirmish draft opens a native scenario modal before freezing the unsaved draft
  for the actual normal-session worker. Authors choose any of six installed
  authored maps, distinct spawn sides, an unsigned 32-bit integer seed and the
  basic skirmish bot, an idle Eastern Collective opening or a draft-unit mirror
  with an idle controller. The mirror adds one supported ground unit to each
  Force's normal starting kit, incrementing an existing starter where applicable;
  structures use the faction-opening presets. Dry maps omit starting harvesters,
  and harvester mirrors require ore. Normal construction, production, resources,
  combat and fog retain normal commands and permissions. Supported content is
  existing core first-playable definitions, compatible prerequisite-free priced units trained
  by their producers, and prerequisite-free priced Eastern Collective or neutral
  structures. Compatible cloned units join only the temporary roster. Other
  packs, factions, props and definitions outside this compatibility gate retain
  debug checks; a rejected normal draft keeps edits and explains the restriction.
  Named semantic fields, keyboard editing and mirrored native focus share the
  modal's validation; invalid seeds or duplicate spawns disable Start with an
  alert. Cancel, Escape or leaving tools retains edits without starting a worker.
  Shared checks gate copied inputs and freeze the selected scenario, metadata and
  checked model, wreck, icon and sound bytes for the preview and every restart.
  Later source edits do not
  replace that snapshot. Native loading Cancel or Return to draft restores the
  retained editor and initiating action focus; initialization/worker failure
  returns with an error. Each preview owns its worker, renderer and audio mixer;
  restarts reuse the mixer, while return/failure releases it, decoded buffers and
  temporary asset URLs and resumes editor rendering. It writes no sources,
  manifest, save slots, autosaves, replay storage or contextual guidance history.
  Save/Load and quicksave are unavailable. Installed Field Manual labels the
  installed baseline; actor stats, recipes and help use the draft catalog.
  Launch eligibility does not guarantee every edited recipe or movement domain
  can execute: normal engine validation still rejects incompatible commands.
  Focused Chrome and WebKit journeys cover this bounded flow; they do not close
  the whole editor task. Scenario presets complete the remaining 2-38c2 slice;
  full 2-38b2 parity and 2-38d asset gizmos remain open. Normal quick play and
  saved setup defaults retain the installed Training Grounds mirror. See
  `../../docs/project/decisions/2026-11-04-draft-normal-skirmish.md` and
  `../../docs/project/decisions/2026-11-04-draft-scenario-presets.md`.
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
- Selected controlled actors' published pending route markers can be edited on
  the battlefield (2-17c). Hover identifies a pending marker with a small diamond;
  dragging previews a move/attack-move cell centre or a grid-aligned build origin,
  and release invokes the same grant-checked HUD queue edit. Right-click removes
  the pending item; right-drag retains camera panning. Shared build-group rows
  follow the authoritative edit/removal without paying before execution.
  Escape, blur, lost marker/selection, pointer cancellation or an invalid/HUD drop
  cancels the preview. Current orders and selection remain intact; empty selection
  adds no station. Existing queue buttons retain keyboard editing/removal, with
  localized help carried by their titles into native Babylon hover/focus tooltips;
  the world canvas gains no browser HTML title. Only permitted copied markers
  participate, including target-based items only while their position is exposed.
  The real-worker browser journey passed Chromium and WebKit, with independent
  renderer/controller checks and a ship visual disposition across seven desktop
  and narrow captures. This does not qualify physical touch, Firefox or hardware
  FPS, or add patrol/factory-route gameplay. The emitted direction is the
  WAYPOINTS EXTENSION in `../../apps/web/index.html`.
- The whole rotated square map fits within the circular minimap, including all
  corner cells. Existing navigation, orders, pings, zoom and keyboard controls
  keep their command handlers. Pause keeps Resume fixed in the header while the
  remaining actions scroll.
- The owner delegates routine choices; implement coherent defaults and review
  the running result instead of interrupting for repeated design approvals.
