# Game profiles, eras, resources, territories and factions

**Status:** data-model proposal; examples are illustrative, not executable content.

## 1. Vocabulary and hierarchy

**Engine:** Deterministic reusable systems for commands, transforms, combat, economy, nav, diplomacy, territory, AI and state serialization.

**Ruleset:** Versioned behavior semantics: victory conditions, production rules, whether ownership requires territory, supply and attrition, diplomacy, age advancement, optional city/trade/wonder systems, and enabled command types.

**Content pack:** Namespaced data and assets: faction descriptions, prefabs for units/buildings, weapons, abilities, upgrades, resources, era definitions, maps, localization and audiovisual material.

**Game profile:** Resolved `ruleset + content pack list + economy configuration + era model + lobby defaults + victory preset`. Examples `standard` (the world of 2035), `ancient-kingdoms`, `epoch-wars`, `cross-era-sandbox`. A match pins the profile, manifest hashes, map and seed.

**Force:** Runtime owner of units, structures, economy, tech and most territory. Players/AI control Forces via permissions. Teams and treaties exist separately. **Nation/civilization/faction** are content archetypes, not authoritative ownership entities.

## 2. Resource model (no hardcoded four-resource economy)

A `ResourceDefinition` has `id`, `label`, `icon`, `scope`, `kind`, `precision`, `cap`, `visibility`, `decay`, `transport`, `incomeSource`, `maxFlow`, `tradingRules`, `eraGates` and optional conversion rates. Types:

| Kind                | Intended meaning                                  | Examples                                              |
| ------------------- | ------------------------------------------------- | ----------------------------------------------------- |
| `stock`             | Accumulates, spends on orders                     | credits, food, wood, stone, gold, metal, oil, salvage |
| `capacity`          | Used/max, not spendable                           | housing, population, storage, supply                  |
| `flow`              | Generated and consumed continuously               | electrical power, industrial throughput               |
| `rate_capped_stock` | Stock whose gather/income rate is governed by cap | Rise of Nations-inspired commerce limits              |
| `territory_yield`   | Income from owned area/nodes                      | taxes, connected rare resources                       |
| `research`          | Technology currency or research throughput        | knowledge, quantum processing                         |

Alternative economies:

**`standard` (the world of 2035):** `credits` stock, `materials` stock, `power` capacity, and AFN-only `compute` capacity (gates research); EC industrial capacity is production throughput; PI salvage is recoverable stock. Don't add these three as mandatory resources to unrelated rulesets.

**`ancient-kingdoms`:** `food, wood, stone, gold` stocks; `population` cap; optional `faith` or `influence` only when used by a faction or mode.

**`epoch-wars`:** `food, wood, stone, metal, knowledge, oil`, with era-gated availability and transformations or later replacement. Early eras need not display oil/knowledge. Storage/income and era transition costs come from content data. Historical authenticity is a theme choice, not a universal engine rule.

**Territorial economies:** Cities and forts expand influence. Resource sites inside owned or allied territory can produce bonuses, and trade between linked settlements can generate wealth. These are selectable ruleset features, not a compulsory mechanic in modern skirmishes.

Important economy policies: per-force vs per-team bank, shared economy grant scopes, whether workers physically carry goods, finite vs renewable resource nodes, farming versus depletion, build queue reservation/refunds, supply limits, local-to-global delivery, market exchange fees, upkeep and population growth. All rules must be deterministic. Avoid double charging on replay/retry. Show resource UI based on active profile schema, not fixed slots.

## 3. Cities, territorial borders, attrition and trade (Rise of Nations inspiration)

**Territory/influence:** Implement `InfluenceSource` components on cities, command centers, forts or special buildings. Every Force has a deterministic territorial ownership field on a coarse grid or region graph. Influence can depend on building level, technology, treaties and distance. Tie-breaking on overlapping claims must be stable. Map editor can preview full territory coverage. Influence and building radius are distinct concepts.

**Construction rules:** Modes choose `anyBuildableLand`, `ownedTerritoryOnly`, `ownedOrAllyWithPermission`, or scenario restrictions. Territory may determine building bonuses, defense, resource collection or victory scoring. A destroyed city recalculates borders on a fixed tick; navigation and fog update as needed.

**Supply:** Paths through connected friendly/neutral trade-permitted territory and supply depots create zones or graph reachability. Units outside supply may suffer slower healing/reload, increased ammo use or attrition damage depending on ruleset. Attrition must have visible warning and a counter (`SupplyWagon`, supply truck, airlift, tech). No hidden unpredictable punishment. Bridges/roads/maritime links can be added later.

**City model:** A city is a specialized structure with ownership, settlement level, influence radius, connected trade slots, optional citizens/garrisons, production modifiers, capture state and health. City capture can change territory, economy and scenario control; avoid creating a second authority model outside Forces.

**Trade routes:** City/market pairs produce flows based on distance, connectivity, technology, relation state and interruption by enemy raids. Early implementation uses explicit waypoint graph; visual caravans are presentation until gameplay convoy risk is supported. Routes are deterministic objects with owner and treaty permissions.

**Wonders:** Content-prefab buildings with unique placement/construction limits, strong bonuses and optional points towards a Wonder Victory. Wonder bonuses can be applied through typed effects, not bespoke engine conditionals. Competitive profiles can disable them or cap point totals.

**Victory options:** conquest, HQ destruction, last surviving Force/Team, territory percent held for N ticks, victory points, economic dominance, wonder points/countdown, tech superweapon, objective/campaign and timed score. A team win policy must specify coalition interpretation under diplomacy.

**Conquer-the-World mode:** Later, implement an outer strategic world map with persistent regions, ownership, diplomacy and scenario modifiers. Each region battle launches the same RTS simulation. Strategic turns must be saved/versioned but need not be lockstep with tactical matches. This is **post-campaign-core**, not a first-release feature.

## 4. Eras and tech

An `EraGraph` contains stable era IDs and directed transitions. Each era defines prerequisites, costs, duration, era-local resources, unlocks, globally applied modifiers, replacement/morph choices and cosmetic changes. The engine should support fixed starting era, a limited age range, all-era progression and mixed-era custom matches. A lobby chooses the starting era and whether players must advance synchronously or individually. Replays pin exact era graph and definitions.

**Per-era variants.** The 2035 game ships with a single era, but every definition is written era-aware from the start. A definition lists the `eras` it exists in and can carry `eraVariants`: per-era overrides of stats, weapons, model and icon. When a Force advances an era, its existing structures **upgrade in place** (with a brick-rebuild animation) to the new era's variant, and production switches to the new unit variants. Units already on the field stay as they are, unless the era transition defines a refit. With one era, a definition simply has one entry and no variants.

**Technology tree:** Graph nodes unlock units, buildings, resource modifiers, armor/weapon upgrades, abilities, and era transitions. Requirements can include `allOf`, `anyOf`, `not`, prior research, owner building, era, map objective or territory control. Validate cycles and unreachable branches. Research states are `locked, available, inProgress, completed`, with deterministic queue/transaction rules.

**Commander skill tree:** Separate graph for force-level commander points, gained by configured XP, objective or time system. Skill choices may grant faction abilities and support powers; by default shared among multiple humans controlling one Force. Per-human commander skill trees are a separate mode so a shared army doesn't accidentally multiply power when a third controller joins.

**Faction identity:** Template data contains passive bonuses, starting unit/building definitions, strategic abilities, tech overrides, UI colors, unit sounds and optional subfactions. Tech can be universal or faction-specific. Different Teams may choose the same Faction. A ruleset should not assume all factions have the same resource model or even the same kind of headquarters.

## 5. Unit families and composable prefabs

| Family           | Authoritative components                        | Notes                                      |
| ---------------- | ----------------------------------------------- | ------------------------------------------ |
| Infantry         | foot nav, hitbox, morale/cover/garrison         | Solo or squad entity policies              |
| Wheeled          | wheel mobility, path cost, optional transport   | Roads/rough terrain speed                  |
| Tracked          | tracked mobility, armor facings, turret         | Independent turret and hull                |
| Hover/amphibious | multiple terrain domains                        | Later terrain transitions                  |
| Rotorcraft       | hovering flight, height, turning, landing       | Strafe, hover, transport                   |
| Fixed-wing       | flight controller, minimum speed, runway/rearm  | Attack runs rather than point stopping     |
| UAV/drone        | flight or hover + special AI/ability            | Recon/swarm/control                        |
| Artillery        | minimum range, ballistic projectile, deployment | Spotting and splash                        |
| Naval            | water nav, draft, weapons, transport            | In the 2035 game, after the vertical slice |
| Support          | engineer, medic, repair, supply, salvage        | Worker and utility verbs                   |
| Superweapon      | windup, warning, cooldown, effects              | Telegraphed and configurable               |

Unit tags describe target domain, weapon compatibility, armor, terrain domain and special conditions. A specific unit may combine categories (e.g., amphibious transport). All game-relevant collision uses deterministic nav/geometry; visual physics is not authoritative by default.

## 6. Structures and construction

Structure families: `headquarters`, `production`, `economy`, `power`, `storage`, `tech`, `research`, `defense`, `sensor`, `support`, `transport`, `territory`, `trade`, `wonder`, `wall`, `bridge`, `garrison`, `mobileDeployable`, `neutralObjective`, `ruin`. Each is a prefab with an oriented footprint, placement requirements, construction stages, HP/armor, build/repair rules, production queues, optional garrison, capture flags, resource connectors, territorial influence and upgrade/morph policies. A structure can fill multiple roles: a city may provide housing, territory, production and trade.

Construction methods are ruleset-defined: C&C-like placement from sidebar, worker foundations, AoE-style villagers, mobile command vehicle deployment, captured/converted buildings. Multiple builders, cancel/refund, blueprint obstruction, power brownouts and destruction during construction must be deterministic. Static buildings update path occupancy, clearance and placement checks at accepted construction ticks.

## 7. Match profile compatibility

Resolve a profile before loading a match:

1. Validate engine/protocol API ranges and required systems.
2. Resolve manifest dependency graph deterministically; detect missing/cyclic dependencies and duplicate IDs.
3. Check every referenced asset, map, unit, effect and technology.
4. Validate allowed economies, faction-era combinations and building/weapon requirements.
5. Compile map navigation and authoritative data; compute hashes.
6. Produce canonical resolved game-profile checksum; distribute it in handshake.
7. Reject mismatches for online multiplayer; allow explicit local modded play.

Do not attempt to make a medieval archer fight a fighter jet fairly without an explicitly balanced mixed-era pack. **Cross-era play is sandbox-first** and may require compatibility mappings between armor/damage types, resources and victory objectives.

## 8. Planned 2035 content coverage

The source concept defines AFN, EC and PI, each with production buildings, defenses, infantry, vehicles and aircraft. It includes original 2035–2038 phases, commander powers and three story campaigns. Keep its exact unit names in [world-2035.md](factions/world-2035.md). Use only a tiny starter roster for first playable and add unique mechanics after skirmish loop proves fun.

For a first balance prototype, use one mirrored generic test faction instead of building all faction assets. Then pick one official faction to ship as first vertical slice. This maintains test symmetry while faction asymmetry is being developed.
