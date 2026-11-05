# Replay statistics overlay

Date: 2026-11-05. Phase: 2-35c, analytics slice.

## Decision

The native replay HUD gains an optional nonmodal statistics panel below its player
observations. Economy and Military plot the existing sampled resource/inventory
history; Production shows original queued-unit thumbnails and actual progress;
Orders shows the existing accepted-order APM and separate human/bot controllers.
The battlefield, transport and right circular map remain usable while it is open.

The panel reuses the canonical statistics producers and post-match income
calculation. Income is gathered-resource change per minute between samples,
excluding opening stock and refunds. Army excludes builders/harvesters and keeps
authored recruitment costs separate by resource. Selection/camera/refused inputs
never count as Order APM. Defeated Forces retain their existing frozen denominator.
There is no invented score or resource exchange rate.

## Host boundary

Only a verified, settled terminal-replay host can request current detailed
statistics. Existing economic inspection and public terminal-result rules select
the Forces. Ordinary live projection and worker replies keep their final-only
detail gate. Replay details travel in a separate validated ready-state field,
never by weakening the ordinary seat snapshot contract.

The replay copy appends an ephemeral current endpoint when needed, using the same
inventory/balance values as canonical sampling. It never allocates a World row,
changes sampling intervals or writes counters. Seeking rebuilds current data;
future orders/history cannot remain after rewinding. All canonical hashes and the
simulation version stay unchanged.

The overlay opts into worker updates. Detailed data is sent once per aligned
simulated-second bucket, or immediately after enabling, a seek or a vision reset. Closing
opts out. This is presentation cadence, not a new simulation clock. Legacy and
portable replay files need no migration; analysis is reproduced from their input
history.

## Interaction

The transport graph pictogram and G toggle the panel. Native tabs switch Economy,
Military, Production and Orders; native metric choices share semantic selects.
Graphs draw directly through Babylon GUI and keep complete sampled values in
semantic tables. Production names/states/progress stay contextual on original
thumbnails, with all queues available through scrolling. Orders puts APM before
secondary totals. Table/queue regions support arrows, Page Up/Down and Home/End;
tab focus and disabled states mirror into the native controls. Seek/vision changes
discard stale analysis while the worker supplies the new permitted position.

Recorded cameras and delayed live spectating remain 2-35c. This does not complete
phase 2 or its human-match and later roadmap acceptance.
