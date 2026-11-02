# 2026-11-02 — Ground-targeting weapons can hit structures

**Context.** Existing weapons contain structure damage multipliers, but many
list only `ground` in their allowed targets. The design left their eligibility
against structures unresolved.

**Decision.** The owner confirmed that `ground` includes structures. An explicit
`structure` target remains valid; structure armour uses the existing
`versus.structure` damage value.

**Consequences.** Combat must apply this rule in shared target eligibility for
manual attacks and automatic targeting. This does not change authored damage
values or permit air-only weapons to hit ground targets.
