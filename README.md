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

```text
open-neo-rts/
├── apps/
│   ├── web/                  browser client: menus, match, map editor, model viewer
│   ├── server/               match server (Bun + Colyseus)
│   └── cli/                  `bun neo <command>`: asset validation now; scenario runs,
│                             replays, benchmarks and AI-vs-AI next
├── packages/
│   ├── deterministic/        seeded PRNG, fixed-point math, trig tables, hashing
│   ├── sim/                  deterministic simulation
│   │   └── src/
│   │       ├── ecs/          our entity component system
│   │       ├── physics/      collision, line traces, projectiles (integer math)
│   │       └── projection/   what each player is allowed to see (fog of war)
│   ├── ai/                   bot players
│   ├── content/              definition and map types, pack loading, validators
│   ├── net/                  wire protocol, encoding, client and server transport
│   └── render/               Babylon.js renderer (reads sim state, never writes it)
├── content/                  game data: no code
│   ├── schemas/              JSON schemas generated from packages/content
│   ├── profiles/             game profiles (ruleset + packs + defaults)
│   ├── rulesets/presets/     lobby presets
│   ├── packs/
│   │   ├── official-2035/    factions, units, structures, weapons, research, locales, assets
│   │   └── example-mod/      reference mod
│   ├── maps/                 official and example maps
│   └── campaigns/            campaigns and missions (later)
├── docs/                     design, engineering and contributing docs
├── tools/biome/              lint plugin enforcing the determinism rules
├── .claude/skills/           step-by-step skills for coding agents
├── AGENTS.md                 rules for coding agents
└── CONTRIBUTING.md           how to contribute
```

Architecture and dependency rules: [docs/engineering/architecture.md](docs/engineering/architecture.md).
