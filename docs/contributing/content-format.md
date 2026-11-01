# Content format

All game content is data in **packs**. This page explains the model and gives a template for every kind of file. Naming rules are in [conventions.md](conventions.md); adding a unit step by step is in [adding-content.md](adding-content.md).

## The model: everything is a pack

```text
content/
├── schemas/                 JSON schemas generated from packages/content (never edited by hand)
└── packs/
    ├── core/                rules every game needs, plus the test faction
    └── neo-2035/            the first real game: AFN, EC, PI, their maps and campaigns
```

A **pack** is a self-contained folder with a `manifest.json`. Everything that belongs to it lives inside it: factions, units, structures, weapons, abilities, research, maps, campaigns, presets, profiles, strings and assets. There are no top-level `maps/` or `campaigns/` folders, because a map or a campaign always belongs to some pack.

- **`core`** holds what every game builds on: resources (credits, raw materials, power), damage types and armour classes, match settings, the test faction, basic presets and English strings. It has no dependencies.
- **`neo-2035`** depends on `core` and adds the world of 2035 ([world-2035.md](../design/factions/world-2035.md)).
- **Mods** are packs too. A mod depends on the packs it extends and can add content or patch existing definitions ([modding.md](../engineering/modding.md)).

Why packs and not one big content folder? A pack is the unit of **loading, versioning and sharing**:
- the game can load `core` alone for tests;
- a lobby can list exactly which packs (and versions) a match uses, and every player's content hash must match;
- a mod is just another pack, so there's no special mod format.

## Profiles and presets

| Concept      | What it is                                                                                                                                                            | Where                         |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| **Profile**  | A playable game: which packs, factions, resources and rule modules, plus default settings. It's what the player picks in skirmish setup ("Neo 2035", "Core skirmish") | `<pack>/profiles/<name>.json` |
| **Preset**   | A lobby template inside a profile: Force slots, teams, seats, settings overrides ("1v1", "2v2 Shared Command")                                                        | `<pack>/presets/<name>.json`  |
| **Settings** | Every configurable match rule, with type, default and range ([match-rules.md](../design/match-rules.md))                                                              | `core/rules/settings.json`    |

The **ruleset** of a match is the profile's `rules` (which rule modules are on, such as weather or territory) plus the resolved settings. There's no separate ruleset file.

## Pack layout

```text
<pack>/
├── manifest.json            id, version, engine range, dependencies, name and description keys
├── rules/                   resources.json, damage.json, settings.json (core only, or overrides)
├── factions/                <name>.json
├── units/                   <name>.json
├── structures/              <name>.json
├── weapons/                 <name>.json
├── abilities/               <name>.json
├── research/                <name>.json (techs and upgrades)
├── profiles/                <name>.json
├── presets/                 <name>.json
├── maps/<name>/             map.json + layer files
├── campaigns/<name>/        campaign.json + missions/<name>/mission.json
├── locales/                 <lang>.json
├── assets/<kinds>/<name>/   runtime files + assets.json
└── source/<kinds>/<name>/   editable originals (Blender, layered images)
```

Folders a pack doesn't use are left out (`core` has no campaigns).

## IDs and references

- Inside a pack, IDs are `<kind>:<name>` (`unit:tank`). References to another pack use `<pack>.<kind>:<name>` (`core.resource:credits`).
- A reference without a pack prefix resolves inside the same pack first, then in its dependencies in order.
- **Single source of truth for links:** a unit names what produces it (`producedBy`), and nothing lists it the other way round. Build menus, tech trees and the Field Manual are derived.

## Units of measure

Data files use **human units**; the loader converts them to integer sim units once at load ([numerics.md](../engineering/numerics.md#content-units)).

| Field kind                      | Unit in data             | Example             |
| ------------------------------- | ------------------------ | ------------------- |
| Distance, range, radius, vision | cells (decimals allowed) | `"range": [0, 6]`   |
| Speed                           | cells per second         | `"speed": 1.5`      |
| Time (build, reload, cooldown)  | seconds                  | `"reload": 2.5`     |
| Turn rate                       | degrees per second       | `"turnRate": 90`    |
| Multipliers                     | percent (integer)        | `"edgePercent": 25` |
| Costs, health, damage           | integers                 | `"health": 600`     |

## Templates

These files in `core` are the reference examples:

| Kind                        | Example                                                                                          |
| --------------------------- | ------------------------------------------------------------------------------------------------ |
| Manifest                    | [core/manifest.json](../../content/packs/core/manifest.json)                                     |
| Resources, damage, settings | [core/rules/](../../content/packs/core/rules/)                                                   |
| Faction                     | [core/factions/test.json](../../content/packs/core/factions/test.json)                           |
| Unit                        | [core/units/tank.json](../../content/packs/core/units/tank.json)                                 |
| Structure                   | [core/structures/refinery.json](../../content/packs/core/structures/refinery.json)               |
| Weapon                      | [core/weapons/artillery-shell.json](../../content/packs/core/weapons/artillery-shell.json)       |
| Profile                     | [core/profiles/skirmish.json](../../content/packs/core/profiles/skirmish.json)                   |
| Preset                      | [core/presets/2v2-shared-command.json](../../content/packs/core/presets/2v2-shared-command.json) |
| Locale                      | [core/locales/en.json](../../content/packs/core/locales/en.json)                                 |

Kinds without an example in `core` yet:

**Ability** (`abilities/<name>.json`). Built only from typed effects; no scripts.

```json
{
  "$schema": "../../../schemas/ability.schema.json",
  "id": "ability:shield-overcharge",
  "name": "ability.shield-overcharge.name",
  "description": "ability.shield-overcharge.description",
  "target": "self",
  "cooldown": 30,
  "autoCast": false,
  "effects": [{ "type": "modifyStat", "stat": "shieldStrength", "percent": 200, "duration": 8 }]
}
```

**Research** (`research/<name>.json`). Techs unlock things; upgrades change stats.

```json
{
  "$schema": "../../../schemas/research.schema.json",
  "id": "research:composite-armor",
  "name": "research.composite-armor.name",
  "description": "research.composite-armor.description",
  "researchedAt": ["structure:quantum-research-lab"],
  "cost": { "core.resource:credits": 1500, "resource:quantum-processing": 2 },
  "researchTime": 45,
  "requires": ["structure:cyber-operations-center"],
  "effects": [
    { "type": "modifyStat", "target": { "tags": ["vehicle"] }, "stat": "health", "percent": 115 }
  ]
}
```

**Era variants** (any unit or structure). One era today; the fields exist so a later profile can add more ([content-and-eras.md §4](../design/content-and-eras.md#4-eras-and-tech)).

```json
{
  "eras": ["era:modern", "era:future"],
  "eraVariants": {
    "era:future": {
      "health": 750,
      "weapons": ["weapon:rail-cannon"],
      "presentation": { "model": "assets/units/tank/tank.future.glb" }
    }
  }
}
```

**Map** (`maps/<name>/map.json`): see [map-editor.md §3](../engineering/map-editor.md#3-editable-map-schema). **Campaign and mission**: see [authoring-scenarios.md](authoring-scenarios.md).

Until the schemas are generated, these files are the specification; when `packages/content` defines the types, the schemas are generated from them and these examples must validate.
