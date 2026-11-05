# Portable replay keyframes

Date: 2026-11-05. Phase: 2-35c, portable-format slice.

## Decision

Compatible library exports use envelope format 2: the existing ID/name/time,
local configuration, pack identities and verified winner, plus an explicit map
hash and a format-2 match record. The record carries the scenario once and compact
canonical keyframes at tick zero and every 1,200 ticks through its terminal tick.
Each frame omits the repeated scenario; its existing snapshot checksum binds the
shared setup and sorted external command prefix strictly before that frame's tick.
Seed, seats, settings, gameplay identity and the complete map remain in the scenario.
The map hash uses the same canonical map identity as browser saves.

Imports still reproduce every accepted external command and hosted bot decision
against the complete installed setup. They compare the complete reproduced frame,
including caches, bots, streams and checksum, with each imported frame, then require
the terminal tick/hash. A rehashed plausible frame is not proof of its history.
Only private owned captures can restore a host; imported bytes never bypass replay.
Live workers gain no export or all-vision permission. Simulation outcomes and
version are unchanged.

Library export requests frames from a separate fully verified replay worker.
Cancellation, timeout, failure, concurrent row changes or a file above 64 MiB leave
storage untouched. Bounds remain two hours, 100,000 commands and at most 121 frames.
Legacy bare records/envelopes remain importable and watchable. Existing incompatible
library entries remain downloadable unchanged, without claiming new verification.
Result-screen bare record download retains format 1.

`bun neo verify-replay <file>` reproduces a bare record or the embedded record of
a library file. It explicitly does not check installed content or envelope identity;
the browser import path performs those additional checks.

## Remaining

Recorded cameras, event markers, analytics and delayed live spectating remain
2-35c. Imported frames are portable state evidence, not a shortcut around initial
history verification. This slice does not complete phase 2 or the online contract.
