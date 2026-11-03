# 2026-11-03 — Count combat-ready troops in the bot reinforcement quota

**Observed failure.** Frozen SIM46 seed 12 reproduces its 60,000-tick cap at
`db0d49c446004166` on `20623ea65ed64838b8afcd3ad970324cefb774d2`.
The exact forensic replay is preserved in `/tmp/neo-ai-stall-sim46-seed12`;
its original inputs/results are in `/tmp/neo-ai-qualification-sim46-60000-20261103`.
Force 1 has 26 combat survivors, 25 marked retreating, empty producer queues and
11,600 credits. The old 24-unit quota counts wounded reserves that cannot heal
under their current rules. One healthy tank is still damaging the enemy HQ;
the cap alone does not prove an infinite match or a navigation fault.

**Provisional correction.** Apply the existing limit of 24 to combat-ready
troops plus combat units already in all permitted production queues. Use the
same observed-health retreat decision and hysteresis as army orders. Wounded
reserves remain alive and retreating; recovered units count again. Without a
completed base, survivors continue counting because they no longer retreat.
Keep normal prices, resource reservations, population/exit checks, grants and
all authored content unchanged. No free replacements or forced ending.

**Research.** [OpenRA's UnitBuilderBotModule documentation](https://docs.openra.net/en/release/traits/#unitbuilderbotmodule)
distinguishes production limits and squad readiness, warning that incompatible
limits can prevent squad formation. That supports checking the interaction;
the particular quota and correction here come from our existing policy and
reproduced state, not copied OpenRA mechanics or numbers.

**Scope.** This repairs reinforcement starvation, not full bot balance or
complete-match acceptance. Large wounded reserves can still consume the normal
population cap; later repair/reintegration policy is separate tuning. SIM48
identifies the changed bot outcomes. Preserve the older frozen batch unchanged.
