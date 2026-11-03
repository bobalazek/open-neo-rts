# 2026-11-03 — First-playable local match snapshots

The owner delegated provisional implementation choices and prioritized working
gameplay over performance. Task 2-33a adds an explicit authoritative snapshot
export and initialization of a new local worker from a saved match. Browser save
slots, quicksave, autosave and load screens remain 2-34.

The format records the current simulation version, complete resolved setup and
accepted external input history, tick/hash, versioned ECS bytes, unsigned PRNG
words, navigation routes/search continuations and cached obstacle profiles,
exploration/ghost history and hosted bot decisions/projection mappings/pending
commands. Original definitions, grants, map and initialization must match the
installed setup. No new content, balance, dependency or simulation outcome changes.

Imports are plain bounded integer JSON. Reject unknown fields, incompatible
versions, damaged checksums, different installed setup, refused historical
commands and any state that does not reproduce its accepted history. Compare the
complete captured state, including navigation occupancy/profiles that are not in
the checkpoint hash. Checksums detect corruption; they are not signatures.
Provisional limits are two hours at 20 ticks/second, 100,000 external inputs,
eight million JSON values, 32 levels and 64 MiB of text. Loading runs in a new
paused worker; failure leaves the existing session available. Pending worker
inputs must finish before export, so saving cannot silently discard them.

**Known cost:** this first version reconstructs and verifies the saved history
before returning that verified host. It preserves all feature state and subsequent
hashes, but does not accelerate loading or replay seeking. Direct canonical-state
loading with complete feature validators remains 2-33b. Reusing the verified host
avoids maintaining a second, partially validated restoration implementation.
Long histories can take time; the main thread can dispose the worker to cancel.
Arbitrary injected state/custom controller callbacks are intentionally unsupported.

Full hidden state leaves only the explicit local-host save API, never an ordinary
seat publication. Future multiplayer saves remain server-side. Pack/version and
creation metadata, browser persistence and the interactive replay container/viewer
are separate layers; this snapshot is not a claim that all persistence work or
phase 2 is complete.
