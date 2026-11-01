# Adding content

**Status:** target workflow. The content schemas and validators don't exist yet; the steps and file layout below are what they'll implement. Update this guide when they land.

Content is **declarative data**: JSON files validated against schemas, plus assets. You can write the JSON by hand, or use the [content editor](../design/screens/content-editor.md) (`/tools/content`), which edits the same files through a form with a live 3D preview. Adding a unit, structure, weapon, ability or tech should never require engine code. If it does, the engine is missing a capability. Open an issue for that capability instead of special-casing the unit.

## Adding a unit

1. **Definition:** `content/packs/<pack>/units/<name>.json`, with a `$schema` reference so your editor autocompletes fields. Start from the closest existing unit; [dev/units/tank.json](../../content/packs/dev/units/tank.json) is the reference example, and [content-format.md](content-format.md) explains every field, the ID rules and the units of measure. A unit is a composition of components (see [content-and-eras.md](../design/content-and-eras.md#5-unit-families-and-composable-prefabs)).
   Data uses human units (cells, seconds); the loader converts them to integers.
2. **Weapons and abilities** it uses: `weapons/<id>.json`, `abilities/<id>.json`, unless it reuses existing ones.
3. **Assets** under `assets/units/<id>/`, with provenance. See [assets.md](assets.md). Check the model in the [content editor](../design/screens/content-editor.md) (`/tools/content`): sockets, team colours, damage states, destruction.
4. **Strings:** name and description in `locales/en.json`.
5. **Wire it in:** add the file's path to the pack's `manifest.json` (`files.units`); set `producedBy` and `requires` in the unit itself. Build menus and tech trees are derived from those.
6. **Validate:** `bun neo validate` checks the schema, references, locale strings, manifest, and the model against the definition (parts, a socket for each weapon, clips, material map, size). No art yet? `bun neo make-placeholders <pack>` generates block models with the right parts and sockets.
7. **Preview:** open the map editor playtest deep link (`/editor/playtest?spawn=core.unit:tank`) locally, or use the link the PR preview posts.

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
