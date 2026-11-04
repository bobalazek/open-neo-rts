# 2026-11-04 — Visible public construction effects

Task 2-36 extends the existing original Field Technician work effects to visible
enemy construction. This is a presentation signal, not a new construction rule,
sound asset or source of economic permissions.

An actively working builder exposes `buildTarget` only when its live site is
also visible. Both belong to the same Force. The worker must be alive, enabled,
at its working position and free of a movement intent; the site must be alive
and receiving work. Approaching, blocked, idle, disabled and hidden work expose
no such association. Exact work ticks, worker counts and construction orders
retain their existing economy grants. Structure ghosts never retain the signal.

The renderer uses this public association for the existing tool animation.
Audio uses the builder's authored `build` clip at the visible site, deduplicated
across builders. Owners retain their actual quarter-tick progress cadence;
without that private progress, the provisional public cadence is one click per
12 match ticks while the active association persists. Skipped snapshots never
produce catch-up bursts. No clip is invented for builders without authored
references.

A finishing effect needs a previously visible builder/site association and the
same visible structure changing from an unfinished site to a complete building.
An intervening missing/hidden association, cancellation, disappearance, ownership
or definition change does not imply completion. Existing pause, rewind, vision
change and scope-disposal rules revoke pending/active work sounds. This is a
positional effect, not an owner announcer notification.

The signal reads authoritative state without mutating it. SIM59, rules, original
assets and balance remain unchanged. Hosted bots hash their projection handle
mappings, so public associations reuse already allocated handles after the
normal entity pass. Allocating a target early would change canonical hashes;
the paired hosted-bot regression preserves the previous allocation/hash.
Unit voices, movement loops, other-roster
clips, announcer speech/subtitles/queue, music and full-mix qualification remain
task 2-36. The frozen twenty-seed qualification artifacts remain historical
evidence; this presentation extension does not requalify full matches.
