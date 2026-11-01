# Open Neo RTS

Open Neo RTS is an open-source real-time strategy game inspired by a couple of classic RTS games that I played in my childhood. The game is under active development and is not yet playable. Over the next couple of weeks, I will be adding mainly ideas and feature I may want to implement in the game and once I feel it's ready, I (or, you know, Claude/Codex) will start with the implementation.

Design docs live in [docs/](docs/README.md). Want to help? See [CONTRIBUTING.md](CONTRIBUTING.md).

## Stack

- TypeScript, Bun, Turborepo, Biome
- Babylon.js (WebGPU, with WebGL fallback)
- Our own ECS, deterministic physics and pathfinding
- Tauri desktop shell

## Development

```sh
git lfs install    # once; assets use Git LFS
bun install
bun run dev        # web client
bun run check      # lint + format check (bun run fix to apply)
bun run typecheck
bun run test
bun run build
bun neo            # project CLI: lists commands (e.g. bun neo validate-assets)
```

## Repository layout

Logic lives in packages; apps are thin shells that wire packages to a runtime.

```text
open-neo-rts/
├── apps/
│   ├── web/                  browser page: mounts packages/client
│   ├── server/               server process: starts packages/server
│   └── cli/                  `bun neo <command>`: validation now; scenario runs,
│                             replays, benchmarks and AI-vs-AI next
├── packages/
│   ├── deterministic/        integer math, trig tables, seeded PRNG, hashing
│   ├── content/              content types, pack loader, locales, maps, validators
│   ├── sim/                  deterministic simulation (ECS, physics, fog projection inside)
│   ├── ai/                   bot players
│   ├── net/                  wire protocol and transport
│   ├── render/               Babylon.js renderer (reads sim state, never writes it)
│   ├── client/               game client: screens, HUD, input, editors
│   └── server/               match server: rooms, lobby, match hosting
├── content/                  game data, no code (see docs/contributing/content-format.md)
│   ├── schemas/              JSON schemas generated from packages/content
│   └── packs/
│       ├── core/             rules every game needs, UI strings, the test faction
│       └── neo-2035/         AFN, EC, PI, their maps, campaigns and profile
├── tools/biome/              lint plugin enforcing the determinism rules
├── docs/                     design, engineering and contributing docs
├── .github/                  PR template, CI workflow
├── AGENTS.md                 rules for coding agents
└── CONTRIBUTING.md           how to contribute
```

Architecture and dependency rules: [docs/engineering/architecture.md](docs/engineering/architecture.md).
