# Content

Game data: JSON definitions plus assets, grouped in **packs**. No code. What a pack is, why, and a template for every file: [docs/contributing/content-format.md](../docs/contributing/content-format.md).

```text
content/
├── schemas/              JSON schemas generated from packages/content (never edited by hand)
└── packs/
    ├── core/             resources, damage types, match settings, the test faction, presets
    └── neo-2035/         the world of 2035: AFN, EC, PI, maps, campaigns, profile
```

Add content: [adding-content.md](../docs/contributing/adding-content.md). Asset rules: [assets.md](../docs/contributing/assets.md). Check assets with `bun neo validate-assets`.
