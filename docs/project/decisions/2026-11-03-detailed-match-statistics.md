# 2026-11-03 — Detailed first-playable match statistics

Task 2-22c extends the existing canonical summary counters with actual production,
combat, controller and sampled-history producers. Owner-delegated provisional
implementation choices apply; no faction content, prices or balance changes.

**Orders.** Order APM means accepted gameplay commands per active Force minute,
floored to an integer. Selection/camera/device inputs and rejected/debug commands
are excluded. Each eligible acting Force is counted once per command, even for a
multi-unit selection. Shared controllers retain separate seat counts; bot seats
are labeled. Queued commands count at admission, never again when executed. Native
eligibility filters prevent ignored unarmed/deployed/structural selections from
crediting the wrong Force. Capture non-unit item/Force ownership before successful
commands can remove their source. Numerator and active-time denominator freeze
when that Force is defeated, including while other teams keep fighting; accepted
post-defeat cleanup cannot inflate them. This is not mouse/keyboard action APM.

**Types.** Completed structures and actual production outputs, including included
units, record their original definition. Initial kits do not count as built.
Clamped lethal damage records the lost type once and credits destruction only
against another team. Burn retains its actual damage attribution. Trapped cargo
records victim loss/damage without inventing an indirect attacker kill credit. Sales,
cancelled sites and surrender cleanup stay voluntary removals, not combat losses.
Remaining is the actual final living inventory, including boarded units.

**History.** Capture initialization, every 600 ticks (30 seconds) and each Force's
elimination/end. Store current stock, separately gathered amounts, living unit and
structure counts, and army recruitment cost in each resource. Income-rate views
derive average gathered amounts per minute between adjacent samples; starting
stock and refunds cannot become income. Army excludes
builders/harvesters and includes boarded/support troops. Use authored recruitment
costs without inventing resource exchange rates; unpriced units contribute to
counts only. Preserve at most 512 samples per Force by doubling the regular
interval and retaining alternating earlier samples when full. Initialization and
the final endpoint remain; there is no trailing-window truncation. Series clocks,
intervals, samples and counters are integer ECS state and survive canonical replay.

**Publication.** Live counters keep their existing economic inspection rule.
Controller/type/history detail is final-only, copied for every Force after match
end. Strict worker validation enforces bounds, ordering, complete metric sets and
terminal publication. Post-match Summary, Economy, Military, Structures and
Orders/APM views consume only these copies, with original content names, selectable
history metrics and accessible sampled tables. Territory and an invented score
formula are not supplied: the current elimination ruleset has no territory or
authored score producer. Those rules remain with their later systems.

The later [replay overlay](./2026-11-05-replay-analytics.md) adds an explicit verified
terminal-replay host channel for current permitted details. Ordinary live
projection keeps the final-only rule above. Its copied current endpoint and
analysis cadence do not alter these canonical samples or simulation outcomes.

**Reference.** OpenRA's [PlayerStatistics](https://github.com/OpenRA/OpenRA/blob/bleed/OpenRA.Mods.Common/Traits/Player/PlayerStatistics.cs)
separates non-debug order counts, per-type inventory and 30-second army/income
samples. Its [APM defeat issue](https://github.com/OpenRA/OpenRA/issues/22331)
illustrates why the active-time denominator must stop on defeat. This project
uses its own integer ECS implementation and accepted-command/Force boundaries.

**Compatibility.** SIM53 adds canonical component layouts and allocation order,
updates normal golden hashes and advances scenario headers. Existing SIM52 save
files/replays remain visible with a version explanation and require their matching
build; no migration is implemented or claimed. Content identities stay unchanged.
