# SIM59: twenty complete seeded bot mirrors

On 2026-11-04 the existing `ai-vs-ai` runner completed seeds 1–20 twice each,
without a crash, cap or divergence. The process exited 0. This meets task 2-40b's
seeded completion/reproducibility criterion; it does not complete phase 2.

## Source and reproduction

- Frozen revision: `601c9596a2d59432ee5c1b87e4a122f1b637082f`, tree
  `24c5491854790925dc5bfb29a6d30cd51e52717b`, SIM59.
- Environment: Bun 1.3.9, Darwin 27.0.0 arm64. Headless simulation, no browser or
  renderer involved.
- Command from the frozen checkout:
  `bun neo ai-vs-ai --out /tmp/neo-sim59-qualification-20261104 --ticks 60000`.
  Reproduction requires a new output directory; existing evidence is refused.
- Preserved input scenarios, first results and summary:
  `/tmp/neo-sim59-qualification-20261104`; companion log:
  `/tmp/neo-sim59-qualification-20261104.log`. The process is finished; do not poll
  or restart its old handle.
- Summary SHA-256:
  `3f71dffe4673c57c8400a21262b034c15d333242e34132c798172c60247f6cbd`.

The runner uses real core content and Training Grounds terrain/resources, normal
starting kits/rules and two hosted Eastern Collective bots. It supplies no extra
banks, actor spawns or controller commands. Its empty map-object list matches
the current browser setup adapter. Team 0 starts north-west; team 1 south-east.
Compared with browser skirmish it adds the first bot and its grant list omits
`unit.abilities`; this qualifies the existing runner preset, not every capability.
For each seed it compares serialized final tick/hash, checkpoints, victory,
command log and bot state across both runs. This is the runner's result record,
not a byte comparison of the entire final kernel serialization. Successful repeats
are compared in memory; only a divergent repeat would be written separately, so
the retained artifacts do not permit an independent second-result comparison.

The artifact audit matches every summary row to its saved scenario seed/version,
first result, victory winner and final checkpoint. There are twenty scenarios and
twenty first results, with no failure/divergent-repeat files. Compared with main
`29e1253c30fd7cef808520c63a32d26685591a75`, the frozen revision has identical
simulation, AI, deterministic and authored content files. The later content-loader
change only renames/exports the same model-requirement function. This preserves
the qualified gameplay scope without rerunning forty long trials for UI work.

## Outcomes

All rows completed naturally and reproduced. The declared 60,000-tick cap is
50 simulated minutes at 20 ticks/second; no match reached it.

| Seed | Final tick | Winning team | Final hash         |
| ---- | ---------- | ------------ | ------------------ |
| 1    | 43704      | 1            | `f4abbf2c7b975a54` |
| 2    | 28175      | 1            | `59d6b243f278bbd7` |
| 3    | 33480      | 1            | `c4ac7f7ae0b1b7b8` |
| 4    | 23460      | 1            | `96e9baacbd4d5b71` |
| 5    | 55717      | 1            | `73386325d4603a56` |
| 6    | 55643      | 1            | `6f93e0c6140554cb` |
| 7    | 42040      | 1            | `28eff87c81d5c645` |
| 8    | 47633      | 1            | `2ad7aef2af5b1a14` |
| 9    | 30068      | 1            | `808415a9a8678800` |
| 10   | 27453      | 1            | `30d013d947ebc101` |
| 11   | 43044      | 0            | `f931d48eb68c2de3` |
| 12   | 56772      | 0            | `6ed1e3ed34b06a4c` |
| 13   | 42516      | 1            | `104ea3ba7aa488f8` |
| 14   | 42101      | 0            | `cadf38a524a173e9` |
| 15   | 44895      | 1            | `b3ab2740127904e1` |
| 16   | 47103      | 0            | `193612eaa7bbc0ff` |
| 17   | 35932      | 1            | `e380059238105215` |
| 18   | 31293      | 1            | `a91fd5ff21c00f79` |
| 19   | 33711      | 0            | `fe9d5c9ad23d7b5b` |
| 20   | 47021      | 1            | `94fd669a0049a85a` |

Duration ranges from 19.55 to 47.31 simulated minutes. Only three mirrors finish
within 25 minutes; the mean is 33.82 and median 35.26 minutes. Team 0 wins five
and team 1 fifteen. These fixed-side mirrors do not establish balance, a
side-swapped comparison or the separate 10–25-minute real human-versus-bot exit.
They also do not prove every tier-1 actor was used, browser replay verification,
cross-engine determinism, hardware performance or hosted CI qualification.

Earlier capped SIM32/38/39/46/48/58 evidence remains historical and must not be
overwritten or reported as successful current-version matches. Changing the
tick cap prevents treating completion percentages as a controlled repair effect.
