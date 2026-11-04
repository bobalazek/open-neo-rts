# 2026-11-04 — Recover rubble-blocked material nodes through ordinary commands

**Observed failure.** The frozen SIM58 seed-2 qualification reaches 30,000 ticks
without victory, reproducibly at hash `feb2054e72d01e31`. A separate diagnostic
reproduces that hash: both discovered material-node anchors contain destroyed
extractor rubble, repeated extractor builds fail placement, and neither Force
has produced a Dragon Tank. Preserve the original batch under
`/tmp/neo-sim58-qualification-20261104` and diagnostic under
`/tmp/neo-seed2-diagnosis-sim58.json`. These are local artifacts, not portable
acceptance evidence. The diagnostic has privileged world access; the bot does not.

**Provisional correction.** When the build order needs a material extractor,
use the discovered immutable node position and ordinary builder orders:

- Scout an unseen footprint from its nearest exterior cell before attempting a
  build. No remembered remains handle or private terrain/path query is used.
- Clear overlapping, currently observed rubble with `economy.salvage`, through
  the existing permission checks, approach work and finite reward. An active
  salvager is left alone; an idle builder can assist if earlier workers are
  blocked. Other economy actions do not steal active salvagers.
- Scouting and clearance need no construction funds. Rebuilding still requires
  the authored cost, prerequisites and normal placement validation.
- Reuse the builder's existing canonical order memory and travel deadline.
  Keep the placement candidate while travelling. An expired approach is skipped
  without resetting its deadline for the same builder/node. A different node can
  become the next goal; this is bounded candidate work, not a complete reachability
  planner or permanent blacklist of every previously attempted node.

SIM59 versions the changed bot outcomes. No content prices, material rates,
victory rules or observation privileges change. Bot-free scenario goldens remain
subject to their existing checks. The isolated recovery fixture supplies completed
original base buildings, destroys a remote extractor and verifies scouting,
clearance, paid rebuilding, material income and identical restored continuation.
The separate opening regression covers ordinary paid base and tank production;
the recovery fixture does not establish a complete match or production mix.

The batch also exposed stale compilation fixtures after the audio additions:
their placeholder presentation maps omitted referenced sounds. Both now include
those references alongside models/icons. Root `content/**` participates in Turbo's
global inputs, because CLI and simulation checks read authored files outside their
workspace directories; cached successes must change when those files change.

**Research and limits.** OpenRA's
[base builder](https://github.com/OpenRA/OpenRA/blob/release-20250330/OpenRA.Mods.Common/Traits/BotModules/BaseBuilderBotModule.cs)
uses bounded placement searches and retry delays. That supports bounded attempts;
the actual clearance sequence here follows this game's existing
[player salvage command](2026-11-03-builder-salvage.md), rather than a copied
OpenRA mechanic.

The fresh SIM59 seed-2 pilot finishes naturally twice at tick 28,175, winner 1,
hash `59d6b243f278bbd7`, with identical commands, checkpoints and bot state. The
scenario matches the SIM58 baseline apart from simulation version. The declared
60,000-tick cap was not reached; the result also precedes the old 30,000-tick cap.
The trace includes accepted salvage at tick 11,877, extractor rebuilding at
16,156, and six accepted paid Dragon Tank queue entries. Preserve input, first
result and summary under `/tmp/neo-bot-recovery-sim59-seed2` and the startup patch
under `/tmp/neo-bot-recovery-sim59-pilot.patch`.

This is about 23½ simulated minutes for one AI mirror, not human playtesting.
Neither this repair nor one pilot establishes twenty complete matches, the human
10–25-minute target, or the phase-2 exit. Local repository/content checks and
independent refutation pass. Chromium/WebKit deterministic goldens pass; Firefox
could not launch its local profile. Hosted CI cannot start because of the recorded
account payment/spending-limit block.
