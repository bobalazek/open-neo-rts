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

## How it stays honest

- **Debug actions are sim commands**, accepted only when the match was started with `debug: true` (otherwise rejected as `debug_only`). That flag is their only gate: they skip grant checks, because debug mode acts for any Force. They go through the command log like any order, so a session replays exactly. Payloads ([commands](../../../packages/sim/src/commands/index.ts)):
  - `debug.spawn { definition, force, x, y, facing }`: a unit, structure or prop ID, the Force, a position in subcells and a facing in binary angle units ([numerics.md](../../engineering/numerics.md#units));
  - `debug.setHealth { entity, health }`: health 0 kills it and leaves a wreck;
  - `debug.remove { entity }`: deletes it without a wreck.
- **Export command log** saves the session as a scenario file. `bun neo run` replays it headless and prints its checkpoint hashes, so a bug found by clicking becomes a determinism test or an end-to-end test without rewriting it ([testing.md](../../engineering/testing.md)).
- **Deep links** encode map, seed, Forces and spawns: `/debug?map=core.map:sandbox-terrain&seed=1&force=eastern-collective&spawn=core.unit:eastern-collective/dragon-tank@40,12`. PR previews link straight to new content this way ([CONTRIBUTING.md](../../../CONTRIBUTING.md#previews)).

## Not in it

No economy, production queues, victory or bots until those features exist; they show up here as they're built, each behind its own toggle.
