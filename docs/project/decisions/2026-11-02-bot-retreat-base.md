# 2026-11-02 — A retreat requires a completed base

The preserved SIM39 seed-6 double trial capped at 60,000 ticks with hash
`3b32deddbd70cb4c`. The exact forensic replay reproduced it before saving
`/tmp/neo-ai-stall-sim39-seed6/{terminal.json,world.bin,movement.json}`.

Force 0 had lost every structure, builder and harvester, retaining 11 wounded
combat units. All 11 were marked retreating; ten infantry sat at (0.5,127.5)
and a tank nearby. Force 1 still had a base and 20 healthy attackers. The losing
army was not recovering: `baseOf` fell back to its first moving unit, so each
new retreat point moved farther southwest until it reached the map border.

Prefer the completed headquarters, then another completed own structure, as
the base anchor. Without any completed structure, do not reserve or retreat
combat units to a mobile actor: all survivors continue normal permitted
scouting/attacks, including wounded units. Travel leases include them in that
situation. Preserve existing health thresholds and retreat hysteresis whenever
a completed base remains.

This corrects goal selection using copied own observations only. It adds no
healing, vision, economy, balance numbers, enemy-location knowledge or automatic
surrender. The old capped trial remains evidence, not a successful match. Actual
complete-match qualification remains open after the policy regression proof.
