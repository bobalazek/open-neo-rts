# Content

Game data: JSON definitions plus assets, grouped in **packs**. No code. What a pack is, why, and a template for every file: [docs/contributing/content-format.md](../docs/contributing/content-format.md).

```text
content/
├── schemas/              JSON schemas generated from packages/content (never edited by hand)
└── packs/
    ├── core/             the base game: rules, resources, damage, settings, presets, UI strings,
    │                     and (soon) AFN, EC, PI with their maps and assets
    └── dev/              test faction, placeholder assets, debug profile (hidden in release builds)
```

Add content: [adding-content.md](../docs/contributing/adding-content.md). Asset rules: [assets.md](../docs/contributing/assets.md). Check assets with `bun neo validate-assets`.
