# 2026-11-02 — Provisional first-playable deploy modes

The owner delegated routine missing details for implementation and later tuning.
The existing Eastern Collective descriptions specify Dragon Tank Siege Mode
(+3 range, +25% damage, immobile) and Metamorphic APC Bunker Mode (+50% armour,
immobile). Their authored cooldown is three seconds; no cost is authored.

Keep mode state in the simulation, overlay immutable base values and revoke the
overlay when packing. [OpenRA's deploy-condition model](https://docs.openra.net/en/release/traits/#grantconditionondeploy)
is the reference pattern for activating and revoking a deployed state; our code
and balance remain our own. Inline `modifyStat` effects with explicit `mobile: 0`
identify a supported persistent self-deploy ability. There is one deploy mode per
unit in this phase. Structure relocation and arbitrary ability effects remain
separate features.

Use the owner's explicit +3 range description to correct the Dragon Tank's older
range-percent effect, and encode its missing damage/immobility effects inline.
Encode APC immobility alongside its existing armour effect. No base unit health,
cost, weapon, range or faction identity changes.

Provisional missing interpretations: toggles are immediate and cooldown applies
to both directions; packing is free and does not refund activation costs. A mixed
selection toggles each supported unit, with grants/cooldowns/affordability checked
before any actor changes. Activation pays an authored cost if present; absent
cost is zero. Entering a mode cancels its old movement/work/attack assignment.
Movement stays locked through every movement entry point until packing.

Damage bonus is sampled when a shot launches, so packing or shooter death cannot
change an existing round. Armour is sampled when damage lands: 150% armour means
incoming damage divided by 1.5, with one final integer floor and the existing
immunity/minimum rules. Damage/armour mode multipliers cap at 200%. Range uses an
integer flat bonus and optional multiplier; base definitions never mutate.

Visible enemies may see mode ID/state, while cooldown remains scoped to ability
control. The existing builder D command keeps its meaning in mixed builder
selections; the explicit Deploy/pack button remains available for capable units.
Without builders selected, D toggles the selected deployable units. APC cargo and
passenger fire follow in the transport task; authored transformation visuals and
disable-effect integration follow their actual lifecycle/effect systems.
