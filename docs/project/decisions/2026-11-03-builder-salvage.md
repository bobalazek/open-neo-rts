# 2026-11-03 — Ordinary builder clearance and bounded salvage

**Provisional contract.** Under the owner's implementation autonomy, any faction's
living builder unit can clear currently visible wrecks or rubble through
`economy.salvage`. Selected builders must share one Force and the issuing seat
needs `economy.build` on that Force. Former wreck ownership grants neither control
nor sight. No range-free clearance, hidden targeting, resurrection or specialist
faction bonuses are introduced.

**Value and work.** At death, store ordinary-builder materials as
`floor((authored materials + floor(authored credits / 100)) / 4)`. Unfinished sites
and absent prices give zero; these remains can still be cleared. Ignore other
resource costs and grant no credits or salvage points. One builder needs 100 ticks
(five seconds); assistance follows existing construction's 100/75/50/25-percent
contributions. Work persists on the remains when an order stops. These numbers are
an initial playable rule, not balance acceptance.

**Contention and payment.** Among adjacent, physically present and currently
permitted workers, the smallest canonical builder ID chooses the working Force
each tick. Same-Force builders assist; opponents wait. If that Force leaves, another
may finish the existing work and receive the finite reward. Only completion pays,
once, through the atomic bank gain operation. Overflow retains the remains and
completed work until storage allows payment. Zero-value rows still clear. Cap
eviction never pays. This deterministic priority is provisional, with no permanent
reservation or hidden ownership transfer.

**Orders and presentation.** Builders reuse construction's finite rotated exterior
approach policy and blocked status. Accepted move, stop, attack, build, repair,
harvest and boarding orders replace salvage. Rejected commands preserve the job.
Lost sight or invalid/dead targets stop it; grant expiry pauses it. The normal HUD
provides Clear / salvage and right-click targeting. Work uses the original builder
tool animation; remains stay outside army selection. Private order states require
economic permission and the target must occur in the current public remains rows.

**Research.** Spring's [builder command implementation](https://github.com/spring/spring/blob/develop/rts/Sim/Units/CommandAI/BuilderCAI.cpp)
uses reclaim commands to approach features and gives context orders for reclaimable
features. This supports the command/approach pattern; this project's original
integer implementation, value and contention rules follow its own existing systems.
Specialist salvage and Phoenix Initiative bonuses remain faction work.

**Compatibility.** SIM50 adds canonical materials/work fields and SalvageOrder.
Normal-match schema hashes change; all three scenario headers advance. Authored
definitions, recipes, GLBs and catalog identities are unchanged.
