# Adding content

**Status:** target workflow. The content schemas and validators don't exist yet; the steps and file layout below are what they'll implement. Update this guide when they land.

Content is **declarative data**: JSON files validated against schemas, plus assets. You can write the JSON by hand, or use the [content editor](../design/screens/content-editor.md) (`/tools/content`), which edits the same files through a form with a live 3D preview. Adding a unit, structure, weapon, ability or tech should never require engine code. If it does, the engine is missing a capability. Open an issue for that capability instead of special-casing the unit.

## Adding a unit

1. **Definition:** `content/packs/<pack>/units/<name>.json` (layout and IDs: [content-format.md](content-format.md)), with a `$schema` reference so your editor autocompletes fields. A unit is a composition of components (see [content-and-eras.md](../design/content-and-eras.md#5-unit-families-and-composable-prefabs)):

   ```json
   {
     "$schema": "../../../schemas/unit.schema.json",
     "id": "unit:panther",
     "family": "tracked",
     "faction": "faction:afn",
     "cost": { "credits": 900 },
     "buildTime": 400,
     "health": 1200,
     "armor": "armor:heavy",
     "movement": { "domain": "tracked", "speed": 90, "turnRate": 40 },
     "turret": { "turnRate": 60 },
     "weapons": ["weapon:panther-cannon"],
     "vision": 9,
     "producedBy": ["structure:war-factory"],
     "requires": ["tech:composite-armor"],
     "presentation": { "model": "assets/units/panther/panther.glb", "icon": "assets/units/panther/panther.icon.webp" }
   }
   ```

   Gameplay numbers are integers in sim units (ticks, cells, fixed-point). The schema documents each unit of measure.
2. **Weapons and abilities** it uses: `weapons/<id>.json`, `abilities/<id>.json`, unless it reuses existing ones.
3. **Assets** under `assets/units/<id>/`, with provenance. See [assets.md](assets.md). Check the model in the [content editor](../design/screens/content-editor.md) (`/tools/content`): sockets, team colours, damage states, destruction.
4. **Strings:** name and description in `locales/en.json`.
5. **Wire it in:** add the unit to its production structure's list and its faction's tech tree.
6. **Validate:** `bun run validate-content` and `bun run validate-assets` (planned) check the schema, references, cycles, eras, GLB structure and stale files; see [content-pipeline.md](../engineering/content-pipeline.md).
7. **Preview:** open the map editor playtest deep link (`/editor/playtest?spawn=unit:panther`) locally, or use the link the PR preview posts.

You don't write tests per unit. A generic content suite spawns **every** definition in a headless test arena, then makes it move, attack, take damage and die. It also checks the definition stays deterministic. Add a scenario test only for unusual behaviour.

## Adding a structure

Same steps, in `structures/<id>.json`. Structures also define a footprint, placement rules, construction stages, and what they produce, research or provide (power, territory, housing…). Structure families are listed in [content-and-eras.md](../design/content-and-eras.md#6-structures-and-construction).

## Other content

| Content         | Location                              | Notes                                                                     |
| --------------- | ------------------------------------- | ------------------------------------------------------------------------- |
| Weapon          | `weapons/`                            | Projectile type, damage per armor class, range, reload, in ticks          |
| Ability         | `abilities/`                          | Built from typed effects only; no scripting                               |
| Tech            | `research/`                           | Requirements graph; validated for cycles and unreachable nodes            |
| Faction         | `factions/<id>/`                      | Bonuses, starting units, tech overrides, AI personality weights           |
| Map             | `<pack>/maps/<name>/`                 | Made in the map editor; see [map-editor.md](../engineering/map-editor.md) |
| Profile, preset | `<pack>/profiles/`, `<pack>/presets/` | See [modes.md](../design/modes.md)                                        |

## Balance changes

Changing numbers is a gameplay change. Say why in the PR. Once AI-vs-AI runs exist, attach the before and after win-rate report from `bun neo ai-vs-ai`.
