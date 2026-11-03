# Save before replacing an active local match

The [in-game menu spec](../../design/screens/in-game-menu.md) requires the choice
to save before leaving single player. Reuse the existing native panel and verified
browser save pipeline for Leave, Restart, loading another save and browser Back.
This completes that part of 2-31b without coupling it to the unbuilt audio engine
or keybinding editor. No canonical simulation state or version changes.

The decision pauses the actual worker before offering Save and continue,
continue without saving, or Cancel. It owns a separate modal canvas so the world,
original save-thumbnail source, parent Load gallery and Settings preview survive.
A committed manual save uses a fresh slot. Pending writes disable all competing
actions; a failed write retains the old session and editable name for retry.
Cancel restores the original running/paused state and initiating focus. Session
generation checks prevent late acceptance from navigating a replacement match.

Provisional default: ask on every active in-app replacement, including a paused
match just saved, for a predictable explicit decision. Finished results bypass
the prompt. Native page reload/close uses the browser warning when running or
when the paused tick differs from the last successful save; an asynchronous save
cannot be offered during page teardown. Saving through the menu remains the
recoverable path.

Independent actual-worker Chromium review reproduced and verified repairs for
an ending snapshot arriving before pause completes, and a delayed storage
completion mutating a replacement session's notice. The former now leaves only
the result dialog; the latter never updates disposed session UI. Neither allows
late navigation. Audio, full input rebinding, multiplayer exit policies and the
full phase-2 acceptance remain separate tasks.
