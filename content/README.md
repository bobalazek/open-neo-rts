# Content

Game data: everything here is JSON definitions plus assets, validated by `packages/content`. No code.

```text
content/
├── schemas/                  JSON schemas generated from packages/content (don't edit by hand)
├── profiles/<id>/            game profiles: ruleset + packs + economy + eras + lobby defaults
├── rulesets/presets/         lobby presets (1v1, Hybrid 2v2, FFA diplomacy, Survival…)
├── packs/
│   ├── official-2035/        the first game pack
│   │   ├── factions/  units/  structures/  weapons/  abilities/  research/
│   │   ├── locales/          strings per language
│   │   ├── assets/           runtime files (GLB, textures, audio) + assets.json per folder
│   │   └── source/           editable originals (Blender, layered images)
│   └── example-mod/          reference mod, validated in CI
├── maps/
│   ├── official/
│   └── examples/
└── campaigns/                campaign graphs and missions (later)
```

Check assets with `bun neo validate-assets`. How to add content: [docs/contributing/adding-content.md](../docs/contributing/adding-content.md). Asset rules: [docs/contributing/assets.md](../docs/contributing/assets.md).
