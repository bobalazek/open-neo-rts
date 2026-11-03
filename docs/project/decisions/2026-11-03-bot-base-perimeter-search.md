# Search the observed enemy base before returning to general scouting

The fresh SIM54 seed-20 baseline on `e84d183` reaches 60,000 ticks without
victory, hash `4371dd4b95325685`. Its source/scenario, timeline and terminal
artifacts are preserved under `/tmp/neo-ai-scout-baseline-sim54-seed20`.
The bot sees and destroys the opposing headquarters around ticks 33,000–34,000,
then leaves unseen nearby structures while repeatedly choosing distant general
scouting goals. At the cap an enemy Barracks Complex and two builders survive.
This reproduces a current problem, distinct from the older SIM48 Supply Depot cap.

Provisional correction under the owner's implementation autonomy:

- Remember only the centre and size-derived search radius of a hostile completed
  headquarters actually present in the permitted observation. Use the same
  rotated-footprint convention as legal targeting. No spawn coordinates, hidden
  structures, map ownership or private navigation queries enter the policy.
- After visible enemies and permitted remembered structures are unavailable,
  check eight compass points around that observed base before general roaming.
  Radius is half the largest observed footprint dimension plus the existing
  six-cell building radius. This is a small local search, not a claim to cover
  every chained or remote structure.
- Skip currently visible points and clamp targets to map bounds. Each evaluated
  point consumes counted work and its cursor survives budget exhaustion. Existing
  travel deadlines bound failed/unreachable goals. Exhausted searches fall back
  to the previous general scouting behavior; only a genuinely different observed
  headquarters resets the local search.
- Keep ordinary commands, grants, prices, production, retreat and victory rules.
  New remembered coordinates and cursor are canonical bot memory, with strict
  restore bounds. SIM55 versions the changed outcomes.

[OpenRA's squad manager](https://github.com/OpenRA/OpenRA/blob/release-20250330/OpenRA.Mods.Common/Traits/BotModules/SquadManagerBotModule.cs)
separates proximity-based target selection from squad orders. That supports
checking nearby objectives before global movement; these eight-point search
rules and their observation limits are this game's provisional correction,
not copied OpenRA mechanics or an adoption of its information model.

The SIM55 seed-20 pilot now completes naturally twice at tick 34,753, winner 1,
hash `ba952f2fe1083db4`. The unchanged runner compares complete results, commands,
bot state and checkpoints; its summary records reproducibility. Preserve input,
first result and summary under `/tmp/neo-ai-perimeter-pilot-sim55-seed20`, with
the exact runtime patch `/tmp/neo-bot-perimeter-pilot-sim55.patch`. Baseline and
candidate scenarios match apart from simulation version; authored setup, map,
content and rules are identical.

Repository checks and independent policy/restore/budget/bounds probes pass.
This one improved seed cannot establish twenty-game qualification or balance.
Its simulated duration is about 29 minutes, so it does not establish the human
10–25-minute gate or full phase-2 acceptance. Run the full current-version batch
at the remaining gameplay integration boundary, rather than repeatedly replacing
it after each unrelated simulation-version change.
