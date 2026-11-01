# Adding content

Content is data: a unit, structure or map is a JSON file in its own folder, plus its assets. Adding one should never need engine code; if it does, the engine is missing a general capability, and that's a separate engine PR. The format is in [content-format.md](content-format.md); the PR rules are in [pull-requests.md](pull-requests.md).

You can write the JSON by hand or use the [content editor](../design/screens/content-editor.md), which edits the same files through a form with a live 3D preview.

## Adding a unit

1. **Folder:** `content/core/factions/<faction>/units/<name>/`, named in kebab-case.
2. **Definition:** `unit.json`. Start from the faction's closest existing unit. Set:
   - `id` matching the folder (`unit:<faction>/<name>`);
   - English `name` and `description`;
   - `role` and `family`;
   - cost, build time, `producedBy`, `requires`;
   - health, armour class, `resist`, movement, radius, vision, population;
   - weapons inline (launcher, projectile, warheads with `versus`);
   - abilities inline;
   - `presentation`.

   Damage and health stay within the reference bands in [combat-and-balance.md](../design/combat-and-balance.md#damage-scale).
3. **Manifest:** add the file's path to `files.units` in `content/core/manifest.json`.
4. **Assets** (when art exists): model, wreck, icon and sounds in the same folder, plus `assets.json` ([assets.md](assets.md)). The model needs the parts, sockets and clips that `presentation` lists, including a muzzle socket for every weapon.
5. **Faction doc:** add the unit to its faction's table, with its role and counters.
6. **Validate:** `bun neo validate`. It checks the schema, references, manifest, and the model against the definition.
7. **Preview:** open it in the content editor, or with the debug mode link the PR preview posts.

You don't write tests per unit: a generic content suite spawns every definition headlessly, makes it move, attack, take damage and die, and checks determinism.

## Adding a structure

Same steps, in `factions/<faction>/structures/<name>/structure.json`, listed under `files.structures`. Structures also set `role`, `footprint` (and `cells` for coastal ones), `power`, and what they offer: production (via units' `producedBy`), research inline, abilities, garrison, pads, adjacency bonuses. Builders construct every structure, so there's no `producedBy`.

## Other content

| Content           | Where                             | Notes                                                                                                             |
| ----------------- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Faction           | `factions/<faction>/faction.json` | Colour, start kit, bot personality; needs exactly one `headquarters` structure and a `builder` unit trained there |
| Neutral structure | `neutral/structures/<name>/`      | Tech buildings, quantum computing facilities, the wonder                                                          |
| Prop              | `props/<biome>/<name>/prop.json`  | Trees, rocks, ruins                                                                                               |
| Map               | `maps/<name>/map.json`            | Made in the map editor ([map-editor.md](../engineering/map-editor.md))                                            |
| Translation       | `locales/<lang>.json`             | Keyed by definition ID and field                                                                                  |

## Balance changes

Changing numbers is a **balance** PR: state the reason, and attach the balance report diff (and AI-vs-AI results once they exist).
