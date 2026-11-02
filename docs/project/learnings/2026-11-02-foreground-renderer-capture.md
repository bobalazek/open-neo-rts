# 2026-11-02 — Unlocked desktop capture and the first foreground frame budget

The owner confirmed the desktop was unlocked and ready for a foreground capture.
The original macOS preflight still refused it: `ioreg` omits
`CGSSessionScreenIsLocked` when unlocked, and `system_profiler` omits
`spdisplays_asleep` when awake. Missing fields alone cannot distinguish the
expected omission from an unknown session or failed probe.

The corrected parser requires exactly one explicitly on-console, completed login
before interpreting an omitted lock flag as unlocked. Explicit locks still reject;
malformed, incomplete or ambiguous sessions stay unknown. This omitted-lock rule
is observed macOS behavior, calibrated against the owner's confirmation, not a
documented cross-platform lock API. The display probe instead calls Apple's public
[CGDisplayIsActive](https://developer.apple.com/documentation/coregraphics/cgdisplayisactive(_:))
and [CGDisplayIsAsleep](https://developer.apple.com/documentation/coregraphics/cgdisplayisasleep(_:))
through Bun's built-in FFI and releases the library handle. No new dependency.

## Qualified measurement; failed performance target

Frozen source `565614f2735ac867c211d5990ebdc5ccd075248d` contains only the
capture preflight fix above merged SIM9 runtime `302fc5b`. Production/minified
app and worker, Apple M1 Max / 32 GB, Chrome 156.0.8078.74, Apple Metal hardware
adapters (`fallback: false`), Medium shadows/render settings, 1280×720 DPR 1.
The original 200 Dragon Tanks, Training Grounds, seed 1 and all 400 authored
commands remain unchanged. Explicit benchmark camera: radius 380, beta 0.7,
alpha π/2, target (128, 0, 128). Ten-second warmup, then 29.9764 measured seconds.

| Observation                  | Result                                                                                 |
| ---------------------------- | -------------------------------------------------------------------------------------- |
| Completed frame intervals    | 1,510                                                                                  |
| Mean / p95 / max interval    | 19.8519 / 21.9 / 27.7 ms                                                               |
| Observed rate                | **50.373 fps; below the required 60**                                                  |
| Worker                       | 600 observations, 20.0157 Hz; step mean 1.2287 ms                                      |
| Motion / sampled containment | All 200 displaced; all 200 contained in all 30 samples                                 |
| Qualification                | Awake/unlocked endpoints, foreground focus, unchanged Medium signature; no page errors |

Independent review reproduced arithmetic directly from raw timestamps, verified
the canonical commands, source/worker/asset hashes and both screenshots, and
accepted measurement eligibility while rejecting the 60 fps exit. The full local
receipt is `/tmp/neo-awake-capture/test-results/renderer-capture/1793602975753/`;
review logs are under `/tmp/neo-art-completion/evidence/foreground-sim9/`.
These paths are local artifacts, not public uploads.

Endpoint OS probes do not establish continuous OS state. Frustum containment is
sampled, not continuous or unoccluded visibility. CPU frame intervals are not GPU
or presentation timestamps. The benchmark camera is not ordinary camera framing
or native-resolution timing. Native-key and the other phase-1b clauses remain
separate gates. [Issue #167](https://github.com/bobalazek/open-neo-rts/issues/167)
requires profiling before a narrow optimization and a matched foreground rerun;
the scene, quality and 60 fps target must not be reduced to claim completion.
