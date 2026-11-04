# Open Neo RTS

A browser real-time strategy game with original factions and an integer,
deterministic TypeScript simulation. Inspired by classic RTS games, with original
models and content.

**Early playable · work in progress.** You can run a local skirmish against a basic
bot. The game is still being built and is not a finished or balanced release.

![A local Eastern Collective skirmish on Training Grounds](docs/screenshots/skirmish.png)

## What works today

- Quick start and skirmish setup for a local Eastern Collective mirror match on
  Training Grounds.
- Builders, paid construction, power, resources, harvesting, unit production,
  terrain navigation and fog of war.
- Combat, queued orders, deployed vehicle modes, transports, repairs, wrecks and
  salvage, with win/lose results and rematches.
- Browser save slots, import/export, and terminal match-record export. Final
  results include per-type totals, controller order APM and economy/army histories.
- Debug maps, spawning and model inspection, with first-pass original animated
  models for the Alliance of Free Nations, Eastern Collective and Phoenix
  Initiative. Normal skirmishes currently use the Eastern Collective tier-one
  roster.

Online PvP and Shared Command, the full three-faction game, replay playback,
audio, training/campaigns, and desktop releases are still roadmap work. Balance,
visual polish, performance and full-match bot qualification remain unfinished. See the
[current tasks](docs/project/tasks.md) and [roadmap](docs/project/roadmap.md).
Save/replay compatibility follows the simulation version; older files may need
their matching build.

## Run locally

Install Git LFS and the Bun version pinned in [package.json](package.json), then:

```sh
git lfs install
git clone https://github.com/bobalazek/open-neo-rts.git
cd open-neo-rts
git lfs pull
bun install
bun run dev
```

Open the client URL printed in the terminal (normally `http://localhost:4320`).
Choose **Quick start local match**, or **Single player → Skirmish** for setup.
The original core assets are required; a checkout containing only LFS pointers
will explain which assets are missing instead of starting a match.

Asset validation and CLI tests also need FFmpeg on `PATH`: `brew install ffmpeg`
on macOS or `sudo apt install ffmpeg` on Ubuntu. The game client does not need it.

Click or drag to select, right-click to issue context orders, and hold Shift to
queue. Arrow keys pan, the mouse wheel zooms, and the HUD shows available commands.
Use the idle-builder/producer buttons to start building and training units.

## Screenshots

Actual captures from the development build, using the original project assets.
The image above is a normal local match; the developer views below inspect assets
and terrain independently of skirmish progression.

![Sandbox water and shorelines in the terrain inspector](docs/screenshots/terrain.png)

_Sandbox: Water terrain inspector, showing shallow and deep water and shorelines._

![The original Eastern Collective Dragon Tank in the model inspector](docs/screenshots/model-preview.png)

_Dragon Tank model inspector: team colour and authored animation clips._

## Development

```sh
bun run check       # lint and formatting; bun run fix applies fixes
bun run typecheck
bun run test
bun run build
bun neo validate    # schemas, gameplay definitions and original assets
bun neo             # available CLI commands
```

Developer tools are at `/debug`, terrain inspection at `/debug?terrain=1`, and the
local GLB viewer at `/debug?models=1`. See [CONTRIBUTING.md](CONTRIBUTING.md) for
workflow and checks, and [docs/](docs/README.md) for the design and engineering docs.

## Stack

TypeScript, Bun, Turborepo and Biome; Babylon.js rendering; our own deterministic
ECS, gameplay, pathfinding and bot systems. Online services and the Tauri desktop
app are planned in later phases. Code and original assets are
[MIT licensed](LICENSE).

## Repository layout

Logic lives in packages; apps are thin shells that wire packages to a runtime.

```text
open-neo-rts/
├── apps/
│   ├── web/                  browser page: mounts packages/client
│   ├── server/               server process: starts packages/server
│   └── cli/                  validation, models, scenarios, scenario replays,
│                             benchmarks and seeded AI-vs-AI runs
├── packages/
│   ├── deterministic/        integer math, trig tables, seeded PRNG, hashing
│   ├── content/              content types, pack loader, locales, maps, validators
│   ├── sim/                  deterministic simulation (ECS, physics, fog projection inside)
│   ├── ai/                   bot players
│   ├── net/                  planned online protocol and transport
│   ├── render/               Babylon.js renderer (reads sim state, never writes it)
│   ├── client/               game client: screens, HUD, input, debug tools
│   └── server/               planned match server: rooms, lobby, match hosting
├── content/                  game data, no code (see docs/contributing/content-format.md)
│   ├── schemas/              JSON schemas generated from packages/content
│   └── core/                 the base game: factions, units, structures, maps, assets
├── tools/biome/              lint plugin enforcing the determinism rules
├── docs/                     design, engineering and contributing docs
├── .github/                  PR template, CI workflow
├── AGENTS.md                 rules for coding agents
└── CONTRIBUTING.md           how to contribute
```

Architecture and dependency rules: [docs/engineering/architecture.md](docs/engineering/architecture.md).
