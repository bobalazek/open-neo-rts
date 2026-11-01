import { strict as assert } from "node:assert";
import { WATER } from "@open-neo-rts/content";
import {
  type Command,
  canTraverse,
  compileNavigation,
  createMatch,
  defineComponent,
  MoveIntent,
  NAV_DIRECTIONS,
  type PathRequest,
  PathScheduler,
  step,
  World,
} from "@open-neo-rts/sim";
import {
  createCommandLog,
  easternCollectiveTier1Definitions,
  flatMap,
} from "@open-neo-rts/sim/testing";

const WARMUP_TICKS = 100;

/** Wall-clock measurements belong in the CLI, never in simulation state. */
export async function bench(args: string[]): Promise<number> {
  try {
    const options = { units: 1000, ticks: 1000 };
    let workload = "flat";
    const seen = new Set<string>();
    for (let i = 0; i < args.length; i += 2) {
      const flag = args[i];
      if (flag === "--workload") {
        if (seen.has(flag)) throw new Error(`Duplicate option: ${flag}`);
        seen.add(flag);
        const value = args[i + 1];
        if (value !== "flat" && value !== "navigation")
          throw new Error("--workload requires flat or navigation");
        workload = value;
        continue;
      }
      if (flag !== "--units" && flag !== "--ticks") throw new Error(`Unknown option: ${flag}`);
      if (seen.has(flag)) throw new Error(`Duplicate option: ${flag}`);
      seen.add(flag);
      const key = flag === "--units" ? "units" : "ticks";
      const raw = args[i + 1];
      const max = key === "units" ? 0x7fffffff : 0x7fffffff - WARMUP_TICKS - 1;
      if (raw === undefined || !/^\d+$/.test(raw) || Number(raw) < 1 || Number(raw) > max)
        throw new Error(`${flag} requires an integer from 1 to ${max}`);
      options[key] = Number(raw);
    }
    if (workload === "navigation") {
      navigationBench(seen.has("--units") ? options.units : 300, options.ticks);
      return 0;
    }
    const { units, ticks } = options;
    const definitions = easternCollectiveTier1Definitions();
    const soldier = definitions.find((definition) => definition.id.endsWith("/collective-soldier"));
    assert(soldier);
    const forces = Array.from({ length: 8 }, (_, index) => ({
      index,
      faction: "faction:eastern-collective",
    }));
    const kernel = createMatch({
      map: flatMap(512),
      seed: 1,
      debug: true,
      definitions,
      forces,
      seats: [],
      grants: [],
    });
    const log = createCommandLog();
    const armies: number[][] = [];
    const spawns: Command[] = [];
    let nextId = 1;
    for (const { index } of forces) {
      const count = Math.floor(units / 8) + (index < units % 8 ? 1 : 0);
      armies.push(Array.from({ length: count }, () => nextId++));
      for (const command of log.spawnArmy(0, 0, count, soldier.id, index, 250 * 1024, 250 * 1024))
        spawns.push(command);
    }
    assert(step(kernel, spawns).every((entry) => entry.result === "accepted"));
    const samples: number[] = [];
    for (let tick = 0; tick < WARMUP_TICKS + ticks; tick++) {
      const commands: Command[] = [];
      if (tick % 100 === 0) {
        const x = (Math.floor(tick / 100) % 2 === 0 ? 500 : 0) * 1024;
        for (const army of armies)
          for (let offset = 0; offset < army.length; offset += 1000)
            commands.push(
              log.move(kernel.tick, 0, army.slice(offset, offset + 1000), x, 250 * 1024),
            );
      }
      const start = performance.now();
      const entries = step(kernel, commands);
      const elapsed = performance.now() - start;
      assert(entries.every((entry) => entry.result === "accepted"));
      if (tick >= WARMUP_TICKS) samples.push(elapsed);
    }
    assert.equal(kernel.world.query(MoveIntent).length, units);
    console.log(
      `Flat-world full-sim tick cost: ${units} units, 8 Forces, ${ticks} ticks (${WARMUP_TICKS} warmup ticks)`,
    );
    printTimings(samples);
    microbench(units);
    return 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

function printTimings(samples: number[]): void {
  samples.sort((a, b) => a - b);
  const duration = samples.reduce((sum, elapsed) => sum + elapsed, 0);
  const p95 = samples[Math.ceil(samples.length * 0.95) - 1] as number;
  const max = samples[samples.length - 1] as number;
  console.log(
    `mean ${(duration / samples.length).toFixed(3)} ms | p95 ${p95.toFixed(3)} ms | max ${max.toFixed(3)} ms`,
  );
  console.log(`Measured duration: ${duration.toFixed(3)} ms`);
}

/** Search throughput for unit request slots, without unit following, smoothing or kernel hashing. */
function navigationBench(units: number, ticks: number): void {
  const seed = 1;
  const quota = 4096;
  const size = 256;
  const base = flatMap(size);
  const water = [...base.terrain.water];
  for (let y = 0; y < size; y++)
    if (y < 120 || y >= 136)
      for (let x = 124; x < 132; x++)
        water[y * size + x] =
          x === 124 || x === 131 || y === 119 || y === 136 ? WATER.shallow : WATER.deep;
  const map = { ...base, id: "map:bench-river-256", terrain: { ...base.terrain, water } };
  const compileStart = performance.now();
  const grid = compileNavigation(map, [], { domain: "foot", radiusSubcells: 256 });
  const compileMs = performance.now() - compileStart;
  const scheduler = new PathScheduler(grid, [0, 1, 2, 3, 4, 5, 6, 7], quota);
  const request = (entity: number, issueTick: number, start?: number): PathRequest => {
    const y = 16 + ((entity * 37 + issueTick * 53 + seed) % 224);
    const from = start ?? y * size + (entity % 2 === 0 ? 24 : 232);
    const x = from % size < 128 ? 232 : 24;
    return {
      entity,
      force: (entity - 1) % 8,
      issueTick,
      kind: "order",
      start: from,
      goal: y * size + x,
    };
  };
  let pending = Array.from({ length: units }, (_, i) => request(i + 1, 0));
  const samples: number[] = [];
  let submitted = 0;
  let served = 0;
  let completed = 0;
  let expansions = 0;
  let maxExpansions = 0;
  let queued = 0;
  let checksum = 0;
  const hash = (value: number) => {
    checksum = (Math.imul(checksum, 31) + value) >>> 0;
  };
  for (let tick = 0; tick < WARMUP_TICKS + ticks; tick++) {
    const previousQueued = queued;
    const start = performance.now();
    scheduler.submit(pending);
    const result = scheduler.tick();
    const elapsed = performance.now() - start;
    const finished = result.results.filter((entry) => entry.status === "found");
    assert(result.expansions <= quota);
    assert.equal(
      result.expansions,
      result.forces.reduce((sum, force) => sum + force.expansions, 0),
    );
    assert.equal(
      finished.length,
      result.forces.reduce((sum, force) => sum + force.completed, 0),
    );
    assert.equal(result.queued, previousQueued + pending.length - finished.length);
    if (tick >= WARMUP_TICKS) {
      samples.push(elapsed);
      submitted += pending.length;
      served += result.results.length;
      completed += finished.length;
      expansions += result.expansions;
      maxExpansions = Math.max(maxExpansions, result.expansions);
      hash(result.expansions);
      hash(result.queued);
    }
    for (const entry of result.results) {
      assert.notEqual(entry.status, "unreachable");
      assert.equal(entry.path[0], entry.request.start);
      if (entry.status === "found") assert.equal(entry.path.at(-1), entry.request.goal);
      let cost = 0;
      for (let i = 0; i < entry.path.length; i++) {
        const cell = entry.path[i] as number;
        assert(cell >= 0 && cell < size * size && grid.cost[cell] !== 0);
        if (i > 0) {
          const previous = entry.path[i - 1] as number;
          const dx = (cell % size) - (previous % size);
          const dy = Math.floor(cell / size) - Math.floor(previous / size);
          const direction = NAV_DIRECTIONS.findIndex(([x, y]) => x === dx && y === dy);
          assert(direction >= 0 && canTraverse(grid, previous, cell, direction));
          cost += (grid.cost[cell] as number) * (dx === 0 || dy === 0 ? 10 : 14);
        }
        if (tick >= WARMUP_TICKS) hash(cell);
      }
      assert.equal(entry.cost, cost);
      if (tick >= WARMUP_TICKS) {
        hash(entry.request.entity);
        hash(entry.status === "found" ? 1 : 0);
        hash(entry.cost);
      }
    }
    pending = finished.map((entry) => request(entry.request.entity, tick + 1, entry.request.goal));
    queued = result.queued;
    assert.equal(queued + pending.length, units);
  }
  console.log(
    `Navigation compiler/search/scheduler: ${units} unit request slots, 8 Forces, ${ticks} ticks (${WARMUP_TICKS} warmup ticks)`,
  );
  console.log(
    `seed ${seed} | ${map.id} ${size}x${size} | foot radius 256 subcells | quota ${quota} nodes/tick`,
  );
  console.log(`Cold compile: ${compileMs.toFixed(3)} ms (excluded from warm tick samples)`);
  printTimings(samples);
  console.log(
    `Requests: submitted ${submitted} (${(submitted / ticks).toFixed(3)}/tick) | served ${served} | completed ${completed} | queued ${queued}`,
  );
  console.log(
    `Expansions: ${expansions} (${(expansions / ticks).toFixed(3)}/tick) | max ${maxExpansions}/tick | checksum ${checksum.toString(16).padStart(8, "0")}`,
  );
}

function microbench(count: number): void {
  const position = defineComponent("BenchPosition", { x: "i32" });
  const world = new World();
  world.register(position);
  // A single-component sparse set: sparse[id] is the dense index plus one (zero means absent).
  const sparse = new Uint32Array(count + 1);
  const dense: number[] = [];
  const values = new Int32Array(count);
  const alive: number[] = [];
  const ids: number[] = [];
  let queried: number[] = [];
  let baselineQueried: number[] = [];
  let checksum = 0;
  let baselineChecksum = 0;
  const time = (operation: () => void) => {
    const start = performance.now();
    operation();
    return (performance.now() - start).toFixed(3);
  };
  const rows = [
    [
      "create",
      () => {
        for (let i = 0; i < count; i++) ids.push(world.create());
      },
      () => {
        for (let i = 1; i <= count; i++) alive.push(i);
      },
    ],
    [
      "add",
      () => {
        for (const id of ids) world.add(id, position, { x: id });
      },
      () => {
        for (const id of alive) {
          sparse[id] = dense.length + 1;
          values[dense.length] = id;
          dense.push(id);
        }
      },
    ],
    [
      "query",
      () => {
        queried = world.query(position);
      },
      () => {
        baselineQueried = dense.slice();
      },
    ],
    [
      "iterate",
      () => {
        for (const id of queried) checksum += world.get(id, position, "x");
      },
      () => {
        for (const id of baselineQueried)
          baselineChecksum += values[(sparse[id] as number) - 1] as number;
      },
    ],
  ] satisfies [string, () => void, () => void][];
  console.log(`ECS microbenchmark: ${count} entities, one i32 component, one batch per operation`);
  console.log("operation | ECS ms | sparse-set ms");
  for (const [name, ecs, baseline] of rows)
    console.log(`${name} | ${time(ecs)} | ${time(baseline)}`);
  assert.equal(queried.length, count);
  assert.equal(baselineQueried.length, count);
  assert.equal(checksum, (count * (count + 1)) / 2);
  assert.equal(baselineChecksum, checksum);
}
