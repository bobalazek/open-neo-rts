# Debug mode

**From:** `bun run dev`, then `/debug` (or a deep link) · **To:** itself; later the [map editor playtest](map-editor.md) reuses it

The first thing anyone can see of the game, and the tool every later feature is tested in: open any map, put any unit or structure of any faction on it, give orders, and inspect the simulation tick by tick. It runs the real sim in the client's Web Worker, through the same command pipeline and per-seat projection as a match ([architecture.md](../../engineering/architecture.md#3-monorepo-layout)), so what works here works in a match.

```text
┌────────────────────────────────────────────────────────────────────────────┐
│ Map [ sandbox-terrain ▾ ] Seed [ 1 ] [ Reload ]   Tick 1 240  ▌▌ ▶ ▸| ×1 ▾ │
├──────────────┬─────────────────────────────────────────────┬───────────────┤
│ FORCE        │                                             │ INSPECTOR     │
│ ● 1 Eastern  │                                             │ Dragon Tank   │
│   Collective │                                             │ #42  Force 1  │
│ ○ 2 Alliance │              (the map, rendered)            │ health 900/900│
│   of Free    │                                             │ x 41472       │
│   Nations    │                                             │ y 12288       │
│ [ + Force ]  │                                             │ order: move   │
│ SPAWN        │                                             │ weapon ready  │
│ [ search… ]  │                                             │ [ Set health ]│
│ ▸ Units      │                                             │ [ Kill ]      │
│ ▸ Structures │                                             │ [ Delete ]    │
│ ▸ Props      │                                             │ STATE HASH    │
│              │                                             │ 9f3a…  @1240  │
├──────────────┴─────────────────────────────────────────────┴───────────────┤
│ OVERLAYS ☑ grid ☐ heights ☐ cell rules ☐ nav domain [foot ▾] ☐ paths ☐ fog │
│ [ Export command log ]  [ Copy deep link ]                                 │
└────────────────────────────────────────────────────────────────────────────┘
```

## What it does

- **Map:** any map from the loaded packs, including the [sandbox maps](../terrain-and-biomes.md#sandbox-maps) that each show one terrain feature. **Reload** restarts the sim with the same map and seed.
- **Forces:** add Forces, each with a faction and a colour, and pick which one you control. Fog follows the controlled Force, or is off.
- **Spawn:** pick a unit, structure or prop and click the map to place it for the selected Force. No cost, no builder, no tech requirements. Placement rules still apply (a shipyard needs shore, a node-bound structure needs its node), and the overlay shows why a cell is refused.
- **Orders:** select, box select, move and attack-move, as in a match ([match-hud.md](match-hud.md)), as soon as those features exist.
- **Time:** pause, step one tick, and run at ×0.25 to ×8.
- **Inspector:** the selected entity's components as the sim holds them (integers, not rendered values), plus buttons to set health, kill or delete it.
- **Overlays:** grid, height levels, footprint cell rules, the nav grid for one movement domain, current paths, fog.
- **State hash** at the current tick, the same value `bun neo run` prints for that tick.

## Model check

The current `/debug` session runs the real worker and copied entity presentation, initially paused with an empty setup and explicit debug no-fog. Choose any of the five sandbox maps or Training Grounds, an unsigned integer seed, and Forces with original factions and chosen colours. Pick the controlled Force and **Reload session** to apply the setup; reload reconstructs the same world. The existing `?map=core.map:sandbox-terrain` map link still works, and invalid maps leave the picker available for retry.

The searchable palette lists every existing unit, structure and prop definition, including definitions whose model is unavailable. Choose a spawn Force and quarter-turn rotation, then left-click a map cell to submit `debug.spawn`. A paused edit advances one tick; a running edit joins the next tick. The worker reports placement refusals; model failures are shown separately and leave the session usable.

The inspector lists the current projection's opaque entity handles and integer values. Set health, kill and remove use the worker command path. In the current sim, health 0 removes a destructible entity; wreck gameplay is not implemented. Indestructible props have 0/0 health and can only be removed. Run/pause, single-step and ×0.25…×8 show acknowledged worker state, tick and full-state hash. Selection/orders, placement overlays, command-log export and full session deep links remain later tasks.

The first asset-inspection stage is available at `/debug?models=1` after `bun run dev`. Open a local `.glb`, change **Team colour**, and select a named **Animation**. **Rest pose** restores the model's authored transforms. Drag the canvas to orbit and scroll to zoom. The controls stay above the canvas and wrap on narrow screens.

```text
┌───────────────────────────────────────────────────────────────────────┐
│ Model check                                                           │
│ Model [ Choose GLB ]  Team colour [ ■ ]  Animation [ Rest pose ▾ ]     │
│ filename · clip count                              Terrain view       │
├───────────────────────────────────────────────────────────────────────┤
│                      orbitable 3D model                               │
└───────────────────────────────────────────────────────────────────────┘
```

The file is read in the browser. Team slots change while palette, metal and glass retain their colours. Idle, move and active clips loop; attack, death and door clips play once. A bad file leaves the previous valid model available and asks for another GLB. This checks assets directly; the `/debug` session above uses commands and per-seat simulation projection.

## How it stays honest

- **Debug actions are sim commands**, accepted only when the match was started with `debug: true` (otherwise rejected as `debug_only`). That flag gates debug access: they skip grant checks, because debug mode acts for any Force. Spawning still enforces terrain, bounds and occupied cells, but [skips build radius](../../project/decisions/2026-11-01-debug-spawn-placement.md). Occupied unit cells fail immediately without moving units. They go through the command log like any order, so a session replays exactly. Payloads ([commands](../../../packages/sim/src/commands/index.ts)):
  - `debug.spawn { definition, force, x, y, facing }`: a unit, structure or prop ID, the Force, a position in subcells and a facing in binary angle units ([numerics.md](../../engineering/numerics.md#units));
  - `debug.setHealth { entity, health }`: health 0 kills it and leaves a wreck;
  - `debug.remove { entity }`: deletes it without a wreck.
- **Export command log** saves the session as a scenario file. `bun neo run` replays it headless and prints its checkpoint hashes, so a bug found by clicking becomes a determinism test or an end-to-end test without rewriting it ([testing.md](../../engineering/testing.md)).
- **Deep links** encode map, seed, Forces and spawns: `/debug?map=core.map:sandbox-terrain&seed=1&force=eastern-collective&spawn=core.unit:eastern-collective/dragon-tank@40,12`. PR previews link straight to new content this way ([CONTRIBUTING.md](../../../CONTRIBUTING.md#previews)).

## Not in it

No economy, production queues, victory or bots until those features exist; they show up here as they're built, each behind its own toggle.
