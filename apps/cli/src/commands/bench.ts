import { strict as assert } from "node:assert";
import {
  type Command,
  createMatch,
  defineComponent,
  MoveIntent,
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
    const seen = new Set<string>();
    for (let i = 0; i < args.length; i += 2) {
      const flag = args[i];
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
    samples.sort((a, b) => a - b);
    const mean = samples.reduce((sum, elapsed) => sum + elapsed, 0) / ticks;
    const p95 = samples[Math.ceil(ticks * 0.95) - 1] as number;
    const max = samples[ticks - 1] as number;
    console.log(
      `Tick cost: ${units} units, 8 Forces, ${ticks} ticks (${WARMUP_TICKS} warmup ticks)`,
    );
    console.log(`mean ${mean.toFixed(3)} ms | p95 ${p95.toFixed(3)} ms | max ${max.toFixed(3)} ms`);
    microbench(units);
    return 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
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
