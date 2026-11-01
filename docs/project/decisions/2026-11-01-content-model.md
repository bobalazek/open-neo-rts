# 2026-11-01 — Co-located content, rules in code

**Context.** Early drafts split content by kind (`units/`, `weapons/`, `abilities/`, `rules/`, `presets/`, `profiles/`, a separate `locales/` for every string) and had a separate developer pack. Finding everything about one tank meant opening five folders, and several concepts (presets, profiles, rule files) duplicated what the map and the lobby already decide.

**Decision.**
- Content lives in `content/core/`, grouped by faction: `factions/<faction>/units/<name>/` holds `unit.json` with its weapons, abilities and English strings inline, next to its model, icon and sounds. Structures likewise, with their research inline. Neutral structures, props and maps have their own folders.
- The manifest lists every definition file; the loader never scans.
- Engine vocabulary is code, not content: resources, armour classes, projectile and warhead kinds, unit and structure roles, match settings.
- No presets or profiles: maps define spawns and player counts; the lobby picks the rest.
- Translations are `locales/<lang>.json`, keyed by definition ID and field.

**Consequences.** One folder per thing, so reviews and mods touch one place. Mods can't add new armour classes or resources without engine changes, which is acceptable.
