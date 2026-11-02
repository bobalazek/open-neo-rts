# 2026-11-02 — Let bot armies finish reachable goals

The owner delegated routine missing implementation choices. The SIM32 batch
finished 20 reproducible double trials, with one natural ending and 19 caps.
Seed 1 replays exactly to `e9cbaa12f14aa4b4`; forensic artifacts are in
`/tmp/neo-ai-stall-sim32-seed1` and its `-paths` companion.

The armies are moving, not blocked. In the saved continuation, Force 1's goal
expires at tick 30066; its infantry/tanks reverse direction before reaching it.
The same recorded positions reach the original goal through normal movement
when left to finish. Both headquarters were still at 4500 health at the cap.
The fixed 400-tick goal deadline is shorter than ordinary cross-map travel.

[OpenRA's movement activity](https://github.com/OpenRA/OpenRA/blob/bleed/OpenRA.Mods.Common/Activities/Move/Move.cs)
distinguishes reached, blocked and canceled completion. Use that outcome-oriented
pattern, without copying implementation or numbers. Navigation needs no change.

Keep the existing 400-tick no-progress margin and add twice the integer
straight-line travel time of the farthest healthy combat unit, using only its
copied position and public authored speed. This follows our existing builder
travel-watchdog formula. Unknown/zero-speed metadata adds no travel estimate.
Goals still expire, disappear when no longer remembered, and are dropped when
their cell becomes visible. No path/terrain/spawn oracle is added.

Visible assault targets also retain their last observed health. Actual observed
damage renews the no-progress margin, never shortening an existing travel lease;
a target making no progress can still time out. No hidden health is queried.
The existing eight counted scouting samples prefer unexplored shroud; if none
is found, the last sample may revisit explored fog. This preserves a bounded
fallback after the map has been explored, including under one-work-unit budgets.

No free income, injected orders, forced endings, new retreat rules or faction
balance changes. Validate actual complete games after these focused corrections;
the old capped batch is evidence of the failure, not successful qualification.
