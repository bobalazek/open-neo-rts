---
name: add-content
description: Add or change game content in open-neo-rts — a unit, structure, weapon, ability, tech, faction or ruleset preset. Use when asked to "add a unit/building/tank/turret/weapon/upgrade", rebalance numbers, or wire new content into a faction.
---

# Add content

Content is declarative JSON plus assets. The full guide is [docs/contributing/adding-content.md](../../../docs/contributing/adding-content.md); read it first. If the content schemas in `content/schemas/` don't exist yet, stop and tell the user: the workflow can't be completed until they land.

## Steps

1. **Find the pack and conventions.** Read 1–2 existing definitions of the same kind in `content/packs/<pack>/`, and match their fields, units and naming. IDs are `kind:kebab-name`.
2. **Reuse before creating.** Check whether an existing weapon, ability, armor class or component already fits. Only create new sub-definitions when nothing fits.
3. **Write the definition** with a `$schema` reference. Gameplay numbers are integers in sim units (ticks at 20 Hz, cells, fixed-point). Never floats.
4. **If the content needs engine behaviour that doesn't exist**, don't special-case it. Tell the user which general capability is missing (e.g. "abilities can't target allied structures yet") and propose it as a separate change using the `add-sim-feature` skill.
5. **Wire it in:** production structure list, faction tech tree, `locales/en.json` strings.
6. **Assets:** reference only files that exist with an `assets.json` provenance entry. Never fabricate authors or add downloaded or third-party assets. If there are no assets, use the pack's placeholder model and say so.
7. **Validate:** run `bun run validate-content` if it exists, then `bun run test` (the generic content suite spawns every definition headlessly).
8. **Report:** what you added, the playtest preview link (`/editor/playtest?spawn=<id>`), and any balance assumptions you made.

## Don'ts

- No TypeScript classes per unit, and no `if (id === "unit:…")` anywhere in engine code.
- Don't change existing units' numbers unless asked; balance changes need a stated reason.
- Don't add binary files outside the patterns in `.gitattributes`.
