# 2026-11-01 — Weapon, projectile, warheads

**Context.** A single damage number with a damage type and a global damage table couldn't express splash falloff, grenade fuses, homing missiles, delayed detonations, burn, EMP, or a flamethrower that's deadly to infantry and useless against tanks. Established engines split attacks into layers: OpenRA (weapon, projectile, warheads with per-armour `Versus`), StarCraft II (launch-missile effect with a mover, then a damage effect with attribute bonuses), Spring (weapon definitions with area of effect and edge falloff inside the unit file).

**Decision.** A weapon is defined inline in its unit or structure and has three layers: the launcher (range, reload, burst, accuracy, targets, socket), one projectile (`instant`, `bullet`, `arc`, `grenade`, `missile`, `beam`, `dropped`) and one or more warheads (`damage`, `burn`, `disable`, `slow`, `reveal`, `spawn`). Damage warheads carry `versus` percentages per armour class, with a `default`. Units and structures can add tag-based `resist`. Modifiers from research, abilities, powers and veterancy stack by source with caps, in a fixed order.

**Consequences.** Every attack's behaviour is readable in one place. The balance report must compute effective damage from all layers. Clients animate projectiles from spawn events; the server decides hits.
