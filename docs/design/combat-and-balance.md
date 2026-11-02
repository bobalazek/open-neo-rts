# Weapons, projectiles, damage and balance

How shooting works, from the trigger to the damage number. All of it is data in each unit's or structure's definition, resolved by deterministic integer math in the sim ([numerics.md](../engineering/numerics.md)).

## The model: weapon → projectile → warheads

Established RTS engines split an attack into three layers, and so do we:

- [OpenRA](https://docs.openra.net/en/release/weapons/) defines each weapon with a projectile and a list of warheads, with damage modifiers per armour type on the warhead.
- [StarCraft II](https://wiki.hiveworkshop.com/index.php/Weapon) launches a missile effect with its own mover, which triggers a damage effect on impact with bonuses against target attributes.
- [Spring and Beyond All Reason](https://springrts.com/wiki/Gamedev:WeaponDefs) put area of effect and edge falloff on the weapon, inside the unit file.

```text
WEAPON          the launcher, on the unit or structure: range, reload, burst, accuracy, targets, muzzle
  └ PROJECTILE  how the shot travels: instant, bullet, arc, grenade, missile, beam, dropped
      └ WARHEADS what happens on impact: damage vs each armour class, splash, delay, burn, EMP…
```

Weapons are defined **inline** in the unit or structure that carries them. A weapon has exactly one projectile and one or more warheads.

The owner [confirmed that `ground` targets include structures](../project/decisions/2026-11-02-ground-targets-structures.md).
Use the existing `versus.structure` multiplier for structure armour; an explicit
`structure` target is also valid.

## Weapon (the launcher)

| Field        | Meaning                                                                                                             |
| ------------ | ------------------------------------------------------------------------------------------------------------------- |
| `id`         | Local name within the unit (`cannon`, `aa-missiles`)                                                                |
| `targets`    | What it may shoot: `ground`, `air`, `naval`, `structure`, `projectile` (point defence)                              |
| `range`      | Minimum and maximum range in cells (artillery has a minimum)                                                        |
| `reload`     | Seconds between shots or bursts                                                                                     |
| `burst`      | Shots per burst and the delay between them (a three-round burst, a missile salvo)                                   |
| `accuracy`   | Scatter radius in cells at maximum range, scaling down linearly when closer. 0 is perfect                           |
| `aim`        | `turret` (independent aim, needs a turret part), `forward` (the unit must face the target, within `arc`), or `omni` |
| `arc`        | For `forward` aim: how many degrees the unit may be off-facing and still fire                                       |
| `socket`     | Muzzle socket on the model it fires from (default `socket_muzzle`); alternating sockets for twin guns               |
| `projectile` | How the shot travels (below)                                                                                        |
| `warheads`   | What happens on impact (below)                                                                                      |

## Projectile (how the shot travels)

| Kind      | Flight                                                                                                  | Can miss?                                                | Examples                                    |
| --------- | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------- |
| `instant` | Resolves in the firing tick along a line; the tracer is visual only                                     | Only by accuracy scatter                                 | Rifles, machine guns, lasers, railguns      |
| `bullet`  | Straight line at a speed; hits the first thing in its path                                              | Yes: the target moves away, or something blocks the path | Tank shells, autocannons                    |
| `arc`     | Ballistic arc to a ground point, with gravity; lands where it was aimed                                 | Yes: the target moves before it lands                    | Artillery, mortars                          |
| `grenade` | Short arc, then bounces or rests until its **fuse** expires, then detonates                             | Yes                                                      | Grenade launchers, thrown grenades          |
| `missile` | Accelerates and steers towards its target with a turn rate, for a limited flight time; can be shot down | Yes: out-turned, out-lasted, or intercepted              | Rockets, anti-air missiles, cruise missiles |
| `beam`    | Continuous while held on target; damage per tick                                                        | No                                                       | Flamethrowers, tesla arcs, nanite beams     |
| `dropped` | Falls from an aircraft onto the point below                                                             | Yes                                                      | Bombs, airstrikes                           |

| Field                    | Meaning                                                                                                                       |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| `speed`                  | Cells per second (not for `instant` and `beam`)                                                                               |
| `gravity`                | For `arc` and `grenade`: how high the arc goes                                                                                |
| `turnRate`, `flightTime` | For `missile`: steering in degrees per second, and seconds before it self-destructs                                           |
| `fuse`                   | For `grenade` (and optional for others): seconds between impact and detonation                                                |
| `blockedBy`              | `terrain` (cliffs, high ground), `structures`, `units`; `arc`, `grenade` and `dropped` projectiles ignore blockers on the way |
| `interceptable`          | Whether point defence can shoot it down (missiles and shells usually)                                                         |

Projectiles are sim entities with integer position and velocity, integrated every tick; `instant` and `beam` shots are not entities. Hits use deterministic line traces in `sim/src/physics`.

## Warheads (what happens on impact)

A weapon has one or more warheads, applied in order when the projectile detonates.

| Warhead   | Does                                                                   | Key fields                                                       |
| --------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `damage`  | Deals damage                                                           | `amount`, `versus`, `radius`, `falloff`, `delay`, `friendlyFire` |
| `burn`    | Damage over time to whatever it hit, and optionally to the ground area | `amountPerSecond`, `duration`, `radius`                          |
| `disable` | EMP: switches off vehicles and structures                              | `duration`, `radius`                                             |
| `slow`    | Reduces movement speed                                                 | `percent`, `duration`, `radius`                                  |
| `reveal`  | Reveals the area (flares, sensor rounds)                               | `radius`, `duration`                                             |
| `spawn`   | Leaves something behind (a mine field, a nanite cloud)                 | `unit`, `count`                                                  |

Any warhead can carry `tags` (`explosive`, `fire`, `emp`, `energy`, `nanite`), which targets can resist ([below](#per-definition-resistances)).

### Single target or area

- **No `radius`** (or 0): the warhead hits **only what the projectile hit**. That's a rifle bullet, a sniper round, a railgun slug, a tank shell striking its target.
- **With `radius`**: everything inside takes damage, scaled by `falloff` from the centre outward. `[100, 50, 25]` means full damage in the inner third, half in the middle third, a quarter in the outer third. Each target is hit once per warhead.
- A weapon can have both: a tank shell can carry a direct-hit warhead (no radius, high damage) and a small splash warhead (radius 0.5, low damage) for nearby infantry.
- **Direct hit** for area warheads means the projectile struck a unit; a shell landing on the ground still splashes.

### Damage against armour

Every unit and structure has one **armour class**: `infantry`, `light`, `medium`, `heavy`, `aircraft`, `naval` or `structure`.

A `damage` warhead's **`versus`** map sets the percentage of `amount` it deals to each class. A `default` entry covers every class not listed; without `default`, unlisted classes take 100%.

| Weapon            | `versus`                                                                         |
| ----------------- | -------------------------------------------------------------------------------- |
| Assault rifle     | `{ "default": 100, "medium": 30, "heavy": 10, "aircraft": 50, "structure": 10 }` |
| Anti-tank rocket  | `{ "default": 100, "infantry": 25, "structure": 60 }`                            |
| Flamethrower      | `{ "default": 20, "infantry": 160, "light": 60, "structure": 80 }`               |
| Anti-air missile  | `{ "default": 0, "aircraft": 150 }` (can't hurt ground targets at all)           |
| Superweapon blast | `{ "default": 100 }` (hurts everything)                                          |

Because `versus` sits on each warhead, every weapon's behaviour against every target is written next to the weapon, not in a global table.

### Per-definition resistances

Armour classes are broad. A unit or structure can also declare **`resist`**: the percentage it takes from warheads carrying a tag (`explosive`, `fire`, `emp`, `energy`, `nanite`). Example: the Collective's Fortress Wall takes 50% from `fire` and 150% from `explosive`; a bunker shrugs off small arms through its `structure` class but still fears demolition charges. `resist` multiplies on top of `versus`.

### Damage scale

So that numbers stay comparable across factions, damage amounts follow these reference bands (per hit, before `versus`):

| Kind of hit                   | Damage per hit | Radius                          |
| ----------------------------- | -------------- | ------------------------------- |
| Rifle, machine gun, drone gun | 6–15           | none                            |
| Sniper, heavy rifle           | 25–80          | none                            |
| Rocket, anti-tank missile     | 40–70          | none or ≤ 0.5                   |
| Tank cannon, railgun          | 60–120         | none, or a small splash warhead |
| Grenade, mortar               | 30–60          | 1–1.5                           |
| Artillery shell, naval gun    | 70–120         | 1.5–2                           |
| Aircraft bombs                | 150–300        | 2–3                             |
| Commander power strike        | 600–1,500      | 4–6                             |
| Superweapon                   | 1,500–3,000    | 6–10                            |

Health bands match: infantry 80–260, light vehicles 200–500, tanks 600–1,800, aircraft 220–900, structures 700–4,500. The balance report flags any value outside its band.

### Modifiers: research, abilities, powers, veterancy

The definition holds **base values** (damage, health, speed, reload, range). Everything else is a **modifier** applied on top:

| Source                       | Example                                                        | Scope                        |
| ---------------------------- | -------------------------------------------------------------- | ---------------------------- |
| Research                     | Smart Munitions: +10% damage for infantry and vehicles         | The Force, filtered by tags  |
| Unit and structure abilities | Rally Broadcast: +15% damage and speed within 8 cells for 20 s | An area, a duration          |
| Auras                        | Command APC: +10% damage within 5 cells                        | An area, while active        |
| Commander powers             | A team-wide +20% damage for 30 s                               | The Force, or the whole team |
| Veterancy                    | +10% damage and health per rank                                | That unit                    |
| Adjacency                    | +10% power output per adjacent reactor                         | That structure               |
| Situation                    | Armour facing (side 125%, rear 150%), cover, high ground       | That hit                     |

**Stacking rules** (deterministic, integer per-mille):

1. Modifiers of the **same stat from the same source** don't stack: the strongest applies (two Rally Broadcasts don't double up).
2. Modifiers from **different sources** add up into one percentage: +10% research, +15% ability and +20% power make +45%.
3. Each stat has a **cap**: damage and health at most +100%, speed at most +50%, reload at most −50%.
4. The total multiplies the base; **situational** multipliers (facing, cover) and `versus` and `resist` multiply after that.
5. Order is fixed, so every client computes the same number.

### Resolving a hit

```text
damage = floor( amount
              × versus[target armour]        (or versus.default)
              × resist[warhead tags]          (target's own resistances)
              × (100% + summed modifiers)     (capped)
              × situational multipliers       (facing, cover)
              × falloff at that distance )
```

- Rounded down **once** at the end, in integer per-mille. A `versus` of 0 means immune: no damage, including splash. Otherwise at least 1.
- **High ground:** shooting up a level gives a miss chance, rolled on the `combat` PRNG stream before damage.

### Pre-calculated, everywhere

- The loader converts every number to integer sim units once, and pre-computes each weapon's **damage per second against every armour class** (with burst, reload, splash and warheads).
- **Tooltips and the Field Manual** show base values, the current modified values, and a breakdown on hover (base 60, research +10%, Rally Broadcast +15%, = 75).
- The **balance report** lists the same pre-computed tables for every unit, plus time-to-kill against every other unit.

**Friendly fire.** Off for direct hits. Splash follows the match setting ([match-rules.md](match-rules.md)), unless the warhead sets `friendlyFire`, which overrides it.

## Example

The Eastern Collective's Rocket Trooper, inline in its `unit.json`:

```json
"weapons": [
  {
    "id": "rocket",
    "targets": ["ground", "air"],
    "range": [0, 6],
    "reload": 3,
    "accuracy": 0.3,
    "aim": "forward",
    "projectile": { "kind": "missile", "speed": 14, "turnRate": 120, "flightTime": 2, "interceptable": true },
    "warheads": [
      { "type": "damage", "amount": 50, "versus": { "infantry": 25, "light": 100, "heavy": 100, "aircraft": 60, "structure": 50 }, "radius": 0.5, "falloff": [100, 50] }
    ]
  }
]
```

A grenadier's launcher would use `"kind": "grenade"` with a `fuse` of 1.5 seconds and a `falloff` splash. A flame tank uses a `beam` with a `damage` warhead strong against infantry plus a `burn` warhead.

## Targeting

- A weapon fires at a target only if the target's domain is in its `targets`, the target is visible (stealth needs detection), and it's in range, with line of fire for blockable projectiles.
- **Auto-targeting**, in priority order:
  1. the player's explicit target;
  2. enemies that can hit back;
  3. other enemy units;
  4. structures.

  Within a tier, a unit prefers targets its warheads are strong against (highest `versus`), then the closest. Remaining ties go to the lowest entity ID, so targeting is deterministic.
- **Stances:** aggressive (chases), defensive (returns to position), hold fire, hold position ([units-and-orders.md](units-and-orders.md#stances)).
- **Leading:** `bullet` and `missile` projectiles aim at where the target will be, using its current velocity; `arc` projectiles aim at where it is.

## Projectiles, networking and fog

- **The server decides every hit.** Clients never report hits or damage.
- **Clients receive a spawn event per projectile** (origin, target point or target, kind, speed, a seed for visual scatter), not its position every tick. They animate the flight locally; the server's impact event is what counts. That keeps bandwidth low even with heavy fire.
- **Missiles** that steer get occasional position corrections in the snapshot, so long flights stay in sync visually.
- **Fog:** a projectile appears for a player only once it's inside their vision. A shot from a hidden attacker shows from the edge of vision, never from the hidden position. Firing reveals the shooter briefly, for players who can see the shooter's position.

## Death and wrecks

At zero health a unit emits a death event and breaks into bricks. Vehicles leave a **wreck** (a brick pile), which can be salvaged, repaired or cleared. Wrecks don't block movement, and decay after a set time or when the wreck cap is reached ([match-rules.md](match-rules.md)). Infantry leave nothing.

## Balancing

**Principles:**
- Every unit has a clear job and a clear counter.
- Factions are asymmetric but have equal overall power.
- Cost reflects effectiveness.
- No unit is mandatory, and none is useless.

**Tools:**

1. **Balance report** (`bun neo balance-report`, planned). Computed from content data: every unit's damage per second against each armour class (with burst, reload, warheads and splash), effective health, cost efficiency, time to kill against every other unit, and build time. PRs that change numbers include the report diff.
2. **Duel arena.** Headless fights between equal-cost groups of every unit pair, across seeds. They show whether counters actually work.
3. **AI-vs-AI matches.** Many seeds per faction matchup, on several maps. The target is faction win rates between 45% and 55%, without systematically short or long games.
4. **Playtests.** Numbers suggest; humans decide.

**Process:** change the data, run the report and duel arena, open a PR with the diffs and a reason, playtest, then write patch notes. All tunables live in content data; engine code contains no balance numbers.
