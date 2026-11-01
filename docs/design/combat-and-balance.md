# Combat and balance

All combat numbers are content data, and all combat resolution is deterministic integer math in the sim.

## Weapons

A unit or structure carries weapon slots. A weapon defines:

| Field             | Meaning                                                                                         |
| ----------------- | ----------------------------------------------------------------------------------------------- |
| `damage`          | Base damage per hit                                                                             |
| `damageType`      | `smallArms`, `armorPiercing`, `explosive`, `fire`, `antiAir`, `emp` (packs may add more)        |
| `targets`         | Which domains it can hit: `ground`, `air`, `naval`, `structure`, plus required or excluded tags |
| `range`           | Min and max range in cells; artillery has a minimum range                                       |
| `reload`, `burst` | Ticks between shots, and shots per burst                                                        |
| `projectile`      | Projectile definition (below)                                                                   |
| `accuracy`        | Scatter radius at max range                                                                     |
| `splash`          | Radius and falloff (percent at the edge); friendly fire follows the ruleset                     |
| `arc`             | Turret (independent aim), fixed forward (unit must face the target), or omni                    |

## Armor and damage types

Every unit has one **armor class**: `infantry`, `light`, `medium`, `heavy`, `aircraft`, `naval` or `structure`. Drones are `aircraft` flying low, so both anti-air and small arms can hit them. Submarines are `naval` and can only be targeted while detected. Damage dealt is `damage × multiplier[damageType][armorClass] / 100` with all modifiers applied, **rounded down once at the end**. A multiplier of 0 means immune: no damage, including splash. Otherwise the minimum is 1. All values are integers; see [numerics.md](../engineering/numerics.md).

Default matrix in `core/rules/damage.json` (percent):

| Damage type ↓ / armor → | infantry | light         | medium        | heavy         | aircraft       | naval         | structure       |
| ----------------------- | -------- | ------------- | ------------- | ------------- | -------------- | ------------- | --------------- |
| smallArms               | 100      | 60            | 25            | 10            | 50             | 25            | 10              |
| armorPiercing           | 25       | 100           | 100           | 100           | 50             | 75            | 50              |
| explosive               | 125      | 80            | 60            | 40            | 0              | 75            | 100             |
| fire                    | 150      | 60            | 30            | 15            | 0              | 25            | 75              |
| antiAir                 | 25       | 25            | 10            | 10            | 150            | 0             | 0               |
| emp                     | 0        | 50 (+disable) | 50 (+disable) | 50 (+disable) | 100 (+disable) | 50 (+disable) | 25 (+power off) |

The matrix is part of the game profile, so other eras use their own (e.g. pierce, slash, crush for an ancient profile).

**Modifiers**, applied in a fixed order:

1. veterancy;
2. upgrades;
3. **armor facing** for vehicles (front 100%, side 125%, rear 150%), used where the ruleset enables it;
4. cover (infantry in buildings or forests);
5. **high ground** (shooting up a level gives a miss chance, rolled on the `combat` PRNG stream).

## Who can target whom

- A weapon can fire at a target only if the target's domain is in the weapon's `targets`, the target is **visible** (stealth needs detection), and it's in range with line of fire.
- Typical rules: tanks hit ground only; anti-air hits air (and maybe light ground at reduced effect); aircraft hit ground and sometimes air; artillery hits ground outside its minimum range; infantry rifles hit infantry well, vehicles poorly, and aircraft badly.
- **Auto-targeting**, in priority order:
  1. the player's explicit target;
  2. enemies that can hit back;
  3. other enemy units;
  4. structures.

  Within a tier, the unit prefers targets its damage type is effective against, then the closest. Remaining ties go to the lowest entity ID, which keeps targeting deterministic.
- **Stances:** aggressive (chases), defensive (returns to position), hold fire, hold position.

## Projectiles

| Kind          | Flight                                                                  | Examples                       |
| ------------- | ----------------------------------------------------------------------- | ------------------------------ |
| **Hitscan**   | Resolves in the firing tick along a line segment; tracer is visual only | Rifles, machine guns, lasers   |
| **Direct**    | Fast straight flight over a few ticks; hits whatever is in the way      | Tank shells, rockets           |
| **Ballistic** | Integer-integrated arc to a ground point; splash on landing             | Artillery, mortars, grenades   |
| **Homing**    | Follows its target with a limited turn rate and a fuel time             | Missiles, anti-air             |
| **Beam**      | Continuous damage while held on target                                  | Flamethrowers, special weapons |
| **Delivered** | Dropped by aircraft or support powers at a point                        | Bombs, airstrikes              |

- Projectiles are sim entities with fixed-point position and velocity, integrated every tick. Hits use deterministic line traces in `sim/src/physics`.
- If a direct projectile's target moved out of the hit radius, it flies on and may hit something else (friendly fire per ruleset), or the ground.
- Terrain and tall structures block direct fire. Ballistic projectiles arc over them.
- The renderer interpolates projectile positions between ticks and adds the visuals (trails, muzzle flashes, impacts).
- **Point defence** weapons target the `projectile` domain and can shoot down homing and delivered projectiles (AFN Interceptor Battery).

## Death and wrecks

At zero health, a unit emits a death event and breaks into bricks. Vehicles leave a **wreck** entity (a brick pile) that can be salvaged, repaired or cleared. Infantry leave nothing.

## Balancing

**Principles:**
- Every unit has a clear job and a clear counter.
- Factions are asymmetric but have equal overall power.
- Cost reflects effectiveness.
- No unit is mandatory, and none is useless.

**Tools:**

1. **Balance report** (`bun run balance-report`, planned). Computed straight from content data, it lists every unit's DPS against each armor class, effective health, cost efficiency (damage per second per 1,000 credits), time to kill against every other unit, and build time. PRs that change numbers include the report diff.
2. **Duel arena.** Headless fights between equal-cost groups of every unit pair, across seeds. They produce win rates and remaining value, which show whether counters work.
3. **AI-vs-AI matches.** Many seeds per faction matchup, on several maps. The target is faction win rates between 45% and 55%, without systematically short or long games.
4. **Playtests.** Numbers suggest; humans decide.

**Process:** change the data → run the report and duel arena → open a PR with the diffs and a reason → playtest → patch notes. All tunables live in content data; engine code contains no balance numbers.
