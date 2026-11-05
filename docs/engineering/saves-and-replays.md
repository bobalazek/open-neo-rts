# Saves, replays and progress

Because the sim is deterministic, saving is simple: a match is fully described by its starting setup plus the commands applied, and a snapshot is a shortcut through that history.

## What gets stored

| Kind               | Contents                                                                                                                      | Used for                               |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| **Snapshot**       | Full canonical sim state at a tick: entities and components, feature tables, PRNG states, tick, pending commands, state hash  | Save games, reconnect, seeking replays |
| **Command log**    | Match setup (packs and their hashes, map and its hash, seed, seats, match settings) plus every accepted command with its tick | Replays, debugging, determinism tests  |
| **Replay file**    | Command log plus periodic snapshot keyframes (e.g. every 60 s)                                                                | Watching with fast seek                |
| **Profile save**   | Settings, campaign progress, unlocked missions, stats                                                                         | Player progress, not sim state         |
| **Campaign state** | World-map regions, ownership, diplomacy, persistent modifiers                                                                 | The Conquer the World layer            |

Every file carries a header: format version, sim version, pack IDs, versions and hashes, map hash, and creation time. (Wall-clock time is fine here; it's metadata, not sim state.)

## Single player

The first [local snapshot implementation](../project/decisions/2026-11-03-first-playable-match-snapshots.md)
exports a complete canonical capture plus accepted external history. A new worker
can resume it after checking installed setup, checksums and the reproduced full
state. [Canonical restoration](../project/decisions/2026-11-03-owned-keyframe-restoration.md)
now loads the verified state into a fresh host. Independent
[component validators](../project/decisions/2026-11-04-canonical-component-validation.md)
check feature invariants and relationships before loading its caches. External
imports still replay-verify history first; plausible state does not prove its
input history. Privately captured owned keyframes restore without stepping elapsed
ticks and support replay
seeking. [Browser save slots](../project/decisions/2026-11-03-browser-save-slots.md),
menu/load screens, quicksave and rotating autosaves are connected by 2-34. Normal seat updates never
include the full save. Failed loading leaves the old worker/session untouched.

- **Save, load, quicksave and autosave** (every few minutes and at mission start). A save is a snapshot plus the command log so far, so a loaded game still produces a full replay. If a save is migrated to a newer sim version on load, the replay starts a **new segment** from the migrated snapshot; the old segment stays playable only with the old version.
- Saving happens between ticks, in the Web Worker, without stalling rendering.
- Storage: IndexedDB in the browser, the app data folder in the Tauri app. Saves can be exported and imported as files.

## Multiplayer

- The server keeps periodic snapshots and the full command log for every match.
- **Reconnect** sends the rejoining seat a visibility-filtered snapshot, never the full state (see [fog-of-war.md](../design/fog-of-war.md)).
- **Save and resume:** the host can save a running custom match. The save is **held by the server** and never sent to any client, because a full snapshot contains every Force's hidden state and PRNG states. Players get a resume code. Resuming requires all seats to be filled again (or taken over by bots) before the match continues.
- Every match produces a replay, downloadable after it ends.

## Replays

- **Current first slice:** a normal match's result screen can download a versioned
  input record: `{ format: 1, scenario, tick, hash }`. The complete format-2 scenario
  carries the current simulation version, gameplay identity, compiled setup/map
  and accepted external commands. Hosted bots regenerate; their commands are not
  recorded a second time. `parseMatchRecord` rejects malformed/incompatible data
  and `verifyMatchRecord` requires the exact canonical terminal tick and hash.
  Export is refused while a normal match is running. This headless record is not
  a full save or the final replay file. The native library below now wraps these
  records with local metadata and plays/seeks them through owned frames.
- Playback re-runs the sim from the command log; keyframes allow seeking.
- **Host playback engine:** `createMatchPlayback` owns a bounded record, compares
  its full setup with the installed setup, then verifies the exact terminal result
  in caller-scheduled tick batches. It captures owned one-minute keyframes and
  seeks from them without replaying the prefix. Its host-only kernel is available
  only after successful verification and a completed seek; it is never a seat
  update. [Bounds and remaining viewer work](../project/decisions/2026-11-03-batched-replay-playback.md).
- **Local library and viewer:** `/replays` stores a format-1 envelope containing
  ID/name/creation time, local configuration, installed pack/cosmetic identities,
  verified winner and the terminal record. Both envelope and bare-record imports
  must verify in a separate worker before persistence. `/replay/:id` provides
  native playback/speed/seek/vision controls and a read-only map. All vision is an
  explicit terminal-replay host permission; live match workers cannot request it.
  Compatible library exports now upgrade to format 2, with explicit map hash and
  a format-2 record containing canonical frames at tick zero and every minute.
  Setup and command history appear once; each frame's checksum binds its exact
  command prefix. Imports reproduce and compare every complete frame before
  persistence. Seeking continues to restore only private owned captures.
  Legacy files remain usable; incompatible entries can be downloaded unchanged.
  `bun neo verify-replay <file>` verifies embedded record history/keyframes,
  explicitly excluding installed-content/header identity checks performed by the
  browser. [Format and limits](../project/decisions/2026-11-05-portable-replay-keyframes.md).
- Viewers can see everything or follow one player's vision.
- Playing a replay requires the same sim version and content hashes. Old replays stay playable by loading the matching game version, which is why releases keep versioned web builds hosted ([deployment-and-operations.md](deployment-and-operations.md)).
- Replays of matches with custom packs record each pack's ID, version and hash. The server keeps a copy of every pack used in a stored replay, so the replay outlives the mod's removal.

## Version compatibility

- Snapshots use **versioned component serialization**: a snapshot embeds each component's field layout, and a changed layout is rejected on load unless a migration exists. Changing a layout needs a simulation version bump. A snapshot from an older sim version is either migrated (when migrations exist for every step) or refused with a clear message, never loaded wrong.
- Campaign progress and profile saves use their own small schema with migrations, independent of the sim version, so a game update never wipes progress.

## Tests

- Save → load → continue produces the same state hash as an uninterrupted run.
- Replay of a recorded match reproduces the final hash.
- Migrated snapshots are covered by fixture files from previous versions.

See [testing.md](testing.md).
