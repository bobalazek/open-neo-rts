# Eras, resources, territories and factions

**Status:** data-model proposal; examples are illustrative, not executable content.

## 1. Vocabulary and hierarchy

**Engine:** Deterministic reusable systems for commands, transforms, combat, economy, nav, diplomacy, territory, AI and state serialization.

**Rules:** engine code for victory modes, production, territory, supply and attrition, diplomacy, era advancement and the optional city, trade and wonder systems. Match settings (`packages/content/src/rules/settings.ts`) choose among them per match, and packs may override setting defaults and ranges. "Ruleset" in these docs means the rules a match runs with.

**Content pack:** namespaced data and assets: factions, units and structures (with their weapons, abilities and research inline), neutral structures, props, maps, era definitions, translations, models and sounds. Resources, armour classes, roles and match settings are engine code, not pack content ([content-model decision](../project/decisions/2026-11-01-content-model.md)).

**Match setup:** `core` plus the enabled packs, the map and the lobby settings. Hosts can keep a combination as a saved setup ([match-rules.md](match-rules.md)). A match pins the pack versions and hashes, map, settings and seed. There are no presets or game profiles.

**Force:** Runtime owner of units, structures, economy, tech and most territory. Players/AI control Forces via permissions. Teams and treaties exist separately. **Nation/civilization/faction** are content archetypes, not authoritative ownership entities.

## 2. Resources

Resources are engine code (`packages/content/src/rules/resources.ts`); content uses their IDs as cost keys. Each has a kind: `stock` (accumulates and is spent) or `capacity` (used out of a maximum, never spent).

| Resource              | Kind     | Used by                                                               |
| --------------------- | -------- | --------------------------------------------------------------------- |
| `credits`             | stock    | Every faction                                                         |
| `materials`           | stock    | Every faction (raw materials)                                         |
| `power`               | capacity | Every faction                                                         |
| `quantum-processing`  | capacity | Alliance of Free Nations: gates research                              |
| `industrial-capacity` | stock    | Eastern Collective: earned by producing, spent on surges              |
| `salvage-points`      | stock    | Phoenix Initiative: earned from wrecks, spent at the Black Market Hub |

Faction-unique resources show only for their faction. The resource bar shows the resources in play, not fixed slots.

**Other eras** would bring their own resources (food, wood, stone, gold, oil, knowledge…), added to the engine's list and gated by era. Early eras need not show later resources. Historical authenticity is a theme choice, not a universal engine rule.

**Territorial economies:** Cities and forts expand influence. Resource sites inside owned or allied territory can produce bonuses, and trade between linked settlements can generate wealth. These are selectable ruleset features, not a compulsory mechanic in modern skirmishes.

Important economy policies: per-force vs per-team bank, shared economy grant scopes, whether harvesters physically carry goods, finite vs renewable resource nodes, farming versus depletion, build queue reservation/refunds, supply limits, local-to-global delivery, market exchange fees, upkeep and population growth. All rules must be deterministic. Avoid double charging on replay/retry.

## 3. Cities, territorial borders, attrition and trade (Rise of Nations inspiration)

**Territory/influence:** Implement `InfluenceSource` components on cities, command centers, forts or special buildings. Every Force has a deterministic territorial ownership field on a coarse grid or region graph. Influence can depend on building level, technology, treaties and distance. Tie-breaking on overlapping claims must be stable. Map editor can preview full territory coverage. Influence and building radius are distinct concepts.

**Construction rules:** Modes choose `anyBuildableLand`, `ownedTerritoryOnly`, `ownedOrAllyWithPermission`, or scenario restrictions. Territory may determine building bonuses, defense, resource collection or victory scoring. A destroyed city recalculates borders on a fixed tick; navigation and fog update as needed.

**Supply:** Paths through connected friendly/neutral trade-permitted territory and supply depots create zones or graph reachability. Units outside supply may suffer slower healing/reload, increased ammo use or attrition damage depending on ruleset. Attrition must have visible warning and a counter (`SupplyWagon`, supply truck, airlift, tech). No hidden unpredictable punishment. Bridges/roads/maritime links can be added later.

**City model:** A city is a specialized structure with ownership, settlement level, influence radius, connected trade slots, optional citizens/garrisons, production modifiers, capture state and health. City capture can change territory, economy and scenario control; avoid creating a second authority model outside Forces.

**Trade routes:** City/market pairs produce flows based on distance, connectivity, technology, relation state and interruption by enemy raids. Early implementation uses explicit waypoint graph; visual caravans are presentation until gameplay convoy risk is supported. Routes are deterministic objects with owner and treaty permissions.

**Wonders:** Structure definitions with unique placement/construction limits, strong bonuses and optional points towards a Wonder Victory. Wonder bonuses can be applied through typed effects, not bespoke engine conditionals. A lobby setting can disable them or cap point totals.

**Victory options:** the game modes and elimination rules in [objectives-and-victory.md](objectives-and-victory.md): Last Man Standing, Wonder Race, Territorial Control, Economic Dominance, Technical Superiority, Score, Survival and Mission. A team win policy must specify coalition interpretation under diplomacy.

**Conquer-the-World mode:** Later, implement an outer strategic world map with persistent regions, ownership, diplomacy and scenario modifiers. Each region battle launches the same RTS simulation. Strategic turns must be saved/versioned but need not be lockstep with tactical matches. This is **post-campaign-core**, not a first-release feature.

## 4. Eras and tech

An `EraGraph` contains stable era IDs and directed transitions. Each era defines prerequisites, costs, duration, era-local resources, unlocks, globally applied modifiers, replacement/morph choices and cosmetic changes. The engine should support fixed starting era, a limited age range, all-era progression and mixed-era custom matches. A lobby chooses the starting era and whether players must advance synchronously or individually. Replays pin exact era graph and definitions.

**Per-era variants.** The base game ships with a single era, but every definition is written era-aware from the start. A definition lists the `eras` it exists in and can carry `eraVariants`: per-era overrides of stats, weapons, model and icon. When a Force advances an era, its existing structures **upgrade in place** (with a brick-rebuild animation) to the new era's variant, and production switches to the new unit variants. Units already on the field stay as they are, unless the era transition defines a refit. With one era, a definition simply has one entry and no variants.

**Technology tree:** Graph nodes unlock units, buildings, resource modifiers, armor/weapon upgrades, abilities, and era transitions. Requirements can include `allOf`, `anyOf`, `not`, prior research, owner building, era, map objective or territory control. Validate cycles and unreachable branches. Research states are `locked, available, inProgress, completed`, with deterministic queue/transaction rules.

**Commander skill tree:** Separate graph for force-level commander points, gained by configured XP, objective or time system. Skill choices may grant faction abilities and support powers; by default shared among multiple humans controlling one Force. Per-human commander skill trees are a separate mode so a shared army doesn't accidentally multiply power when a third controller joins.

**Faction identity:** Template data contains passive bonuses, starting unit/building definitions, strategic abilities, tech overrides, UI colors, unit sounds and optional subfactions. Tech can be universal or faction-specific. Different Teams may choose the same Faction. A ruleset should not assume all factions have the same resource model or even the same kind of headquarters.

## 5. Unit families and composable prefabs

| Family           | Authoritative components                       | Notes                                      |
| ---------------- | ---------------------------------------------- | ------------------------------------------ |
| Infantry         | foot nav, hitbox, morale/cover/garrison        | Solo or squad entity policies              |
| Wheeled          | wheel mobility, path cost, optional transport  | Roads/rough terrain speed                  |
| Tracked          | tracked mobility, armor facings, turret        | Independent turret and hull                |
| Hover/amphibious | multiple terrain domains                       | Later terrain transitions                  |
| Rotorcraft       | hovering flight, height, turning, landing      | Strafe, hover, transport                   |
| Fixed-wing       | flight controller, minimum speed, runway/rearm | Attack runs rather than point stopping     |
| UAV/drone        | flight or hover + special AI/ability           | Recon/swarm/control                        |
| Artillery        | minimum range, `arc` projectile, deployment    | Spotting and splash                        |
| Naval            | water nav, draft, weapons, transport           | In the base game, after the vertical slice |
| Support          | builder, medic, repair, supply, salvage        | Builder and utility verbs                  |
| Superweapon      | windup, warning, cooldown, effects             | Telegraphed and configurable               |

Unit tags describe target domain, weapon compatibility, armor, terrain domain and special conditions. A specific unit may combine categories (e.g., amphibious transport). All game-relevant collision uses deterministic nav/geometry; visual physics is not authoritative by default.

## 6. Structures and construction

Every structure has exactly one engine `role`: `headquarters`, `power`, `dropoff`, `production`, `research`, `support`, `defense`, `wall`, `superweapon` or `wonder` ([structures.md](structures.md#roles)). Each is a definition with an oriented footprint, placement cell rules, construction, health and armour, repair, production queues, optional garrison, capture flags and upgrades. A rule module that needs a new kind of structure (a city, a fort) adds a role to the engine; a city would still have one role, with housing, territory and trade as parts of its definition.

Builders construct every structure on site ([structures.md](structures.md#construction-and-builders)); the other ways a structure appears are a unit deploying into one (the Eastern Collective's Mobile Factory Complex) and capture. Multiple builders, cancel and refund, blocked sites, brownouts and destruction during construction must be deterministic. Structures update path occupancy, clearance and placement checks at accepted construction ticks.

## 7. Match compatibility

Before a match loads:

1. Validate engine/protocol API ranges and required systems.
2. Resolve manifest dependency graph deterministically; detect missing/cyclic dependencies and duplicate IDs.
3. Check every referenced asset, map, unit, effect and technology.
4. Validate faction-era combinations and building and weapon requirements.
5. Compile map navigation and authoritative data; compute hashes.
6. Compute one checksum of the resolved packs, map and settings; exchange it in the handshake.
7. Reject mismatches for online multiplayer; allow explicit local modded play.

Do not attempt to make a medieval archer fight a fighter jet fairly without an explicitly balanced mixed-era pack. **Cross-era play is sandbox-first** and may require compatibility mappings between armour classes, warhead tags, resources and victory objectives.

## 8. Planned base-game content

The three factions, their rosters and their powers are in [factions/](factions/README.md); the story and campaigns are in [story.md](story.md).

The first playable is an Eastern Collective mirror match with its tier-1 roster, so balance tests stay symmetric while the other factions are finished. The vertical slice then completes the Eastern Collective ([roadmap.md](../project/roadmap.md)).
