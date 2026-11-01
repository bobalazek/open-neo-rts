import { describe, expect, test } from "bun:test";
import { createStream, nextInt, nextU32 } from "@open-neo-rts/deterministic";
import type { Command } from "../commands";
import { defineComponent } from "../ecs";
import {
  type Controller,
  checkpointHash,
  createKernel,
  type Feature,
  type Kernel,
  PHASES,
  register,
  registerController,
  type System,
  step,
  stream,
} from ".";

const Body = defineComponent("Body", { force: "i32", x: "i32", y: "i32", hp: "i32" });

/** Spawns bodies, sets their health, walks them east and hurts them at random until they die. */
const toy: Feature = {
  components: [Body],
  handlers: {
    "debug.spawn": ({ world }, { payload }) => {
      const { force, x, y } = payload;
      world.add(world.create(), Body, { force, x, y, hp: 100 });
    },
    "debug.setHealth": ({ world }, { payload }) => {
      if (!world.isAlive(payload.entity) || !world.has(payload.entity, Body)) return "bad_payload";
      world.set(payload.entity, Body, "hp", payload.health);
    },
  },
  systems: {
    movement: [
      ({ world }) => {
        for (const id of world.query(Body)) world.set(id, Body, "x", world.get(id, Body, "x") + 1);
      },
    ],
    combat: [
      (kernel) => {
        const { world } = kernel;
        const rng = stream(kernel, "combat");
        for (const id of world.query(Body)) {
          const hp = world.get(id, Body, "hp") - nextInt(rng, 4);
          if (hp <= 0) world.destroy(id);
          else world.set(id, Body, "hp", hp);
        }
      },
    ],
  },
};

const SPAWN = { definition: "unit:test", y: 0, facing: 0 };

const spawn = (tick: number, seat: number, sequence: number, x = 0): Command => ({
  tick,
  seat,
  sequence,
  type: "debug.spawn",
  payload: { ...SPAWN, force: seat, x },
});

const setHealth = (tick: number, sequence: number, entity: number, health: number): Command => ({
  tick,
  seat: 1,
  sequence,
  type: "debug.setHealth",
  payload: { entity, health },
});

const remove = (tick: number, sequence: number, entity: number): Command => ({
  tick,
  seat: 1,
  sequence,
  type: "debug.remove",
  payload: { entity },
});

/** Every 60 ticks, spawn a body for its own Force. */
const bot: Controller = ({ tick }) =>
  tick % 60 === 0 ? [{ type: "debug.spawn", payload: { ...SPAWN, force: 2, x: tick } }] : [];

function script(tick: number, seed: number): unknown[] {
  if (tick === 0) return [spawn(0, 1, 0), spawn(0, 1, 1, 2048), spawn(0, 3, 2, 4096)];
  if (tick === 40) return [setHealth(40, 3, 1, 900), "garbage", setHealth(40, 4, 99, 1)];
  if (tick === 150) return [spawn(150, 1, 6, seed), remove(150, 5, 1)];
  return [];
}

function shuffled<T>(items: readonly T[], seed: number): T[] {
  const out = [...items];
  const s = createStream(seed, "test:shuffle");
  for (let i = out.length - 1; i > 0; i--) {
    const j = nextInt(s, i + 1);
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

function setup(seed: number): Kernel {
  const kernel = createKernel({ seed, debug: true });
  register(kernel, toy);
  registerController(kernel, 2, bot);
  return kernel;
}

function play(seed: number, shuffle = false): Kernel {
  const kernel = setup(seed);
  for (let t = 0; t < 300; t++)
    step(kernel, shuffle ? shuffled(script(t, seed), t) : script(t, seed));
  return kernel;
}

describe("step", () => {
  test("runs handlers, then phases in the fixed order, controllers at the start of ai", () => {
    const kernel = createKernel({ seed: 1, debug: true });
    const trace: string[] = [];
    const tracer =
      (name: string): System =>
      () => {
        trace.push(name);
      };
    const reversed = [...PHASES].reverse().map((phase) => [phase, [tracer(phase)]]);
    register(kernel, {
      systems: Object.fromEntries(reversed),
      handlers: {
        "debug.remove": () => {
          trace.push("handler");
        },
      },
    });
    register(kernel, { systems: { movement: [tracer("movement 2")] } });
    registerController(kernel, 1, () => {
      trace.push("controller");
      return [];
    });
    step(kernel, [remove(0, 0, 1)]);
    expect(trace).toEqual(
      PHASES.flatMap((p) => {
        if (p === "ingest") return ["handler", p];
        if (p === "ai") return ["controller", p];
        if (p === "movement") return [p, "movement 2"];
        return [p];
      }),
    );
  });

  test("gives every input exactly one result, in input order", () => {
    const kernel = createKernel({ seed: 1, debug: true });
    register(kernel, toy);
    const inputs = [
      spawn(0, 1, 0),
      "nonsense",
      { ...spawn(0, 1, 1), type: "unit.fly" },
      spawn(0, 1, 2),
      spawn(0, 2, 2),
      setHealth(0, 3, 99, 5),
      setHealth(0, 4, 1, 5),
      remove(0, 5, 1),
      { ...spawn(0, 1, 6), payload: { definition: "unit:test" } },
    ];
    const entries = step(kernel, inputs);
    expect(entries.every((e, i) => e.command === inputs[i] && e.tick === 0)).toBe(true);
    expect(entries.map((e) => e.result)).toEqual([
      "accepted",
      "malformed",
      "unknown_type",
      "duplicate",
      "duplicate",
      "bad_payload",
      "accepted",
      "unknown_type",
      "bad_payload",
    ]);
    expect(kernel.log).toEqual(entries);
    expect(kernel.world.get(1, Body, "hp")).toBeLessThanOrEqual(5);
  });

  test("rejects debug commands, from inputs and controllers, unless the match is a debug match", () => {
    for (const debug of [false, true]) {
      const kernel = createKernel({ seed: 1, debug });
      register(kernel, toy);
      registerController(kernel, 2, bot);
      const results = [...step(kernel, [spawn(0, 1, 0)]), ...step(kernel, [])];
      const expected = debug ? "accepted" : "debug_only";
      expect(results.map((e) => [e.source, e.result])).toEqual([
        ["input", expected],
        ["controller", expected],
      ]);
      expect(kernel.world.query(Body)).toHaveLength(debug ? 2 : 0);
    }
  });

  test("runs controller commands on the next tick, from the controller's seat", () => {
    const kernel = createKernel({ seed: 1, debug: true });
    const seen: number[][] = [];
    register(kernel, {
      handlers: {
        "debug.remove": (k, c) => {
          seen.push([k.tick, c.tick, c.seat, c.sequence, c.payload.entity]);
        },
      },
    });
    registerController(kernel, 4, ({ tick }) =>
      tick === 0 ? [7, 8].map((entity) => ({ type: "debug.remove", payload: { entity } })) : [],
    );
    registerController(kernel, 3, ({ tick }) =>
      tick === 0 ? [{ type: "debug.remove", payload: { entity: 6 } }] : [],
    );
    expect(step(kernel, [])).toEqual([]);
    expect(seen).toEqual([]);
    const entries = step(kernel, []);
    expect(seen).toEqual([
      [1, 1, 3, 0, 6],
      [1, 1, 4, 1, 7],
      [1, 1, 4, 2, 8],
    ]);
    expect(entries.map((e) => [e.tick, e.source, e.result])).toEqual([
      [1, "controller", "accepted"],
      [1, "controller", "accepted"],
      [1, "controller", "accepted"],
    ]);
  });

  test("throws on an input for another tick", () => {
    expect(() => step(setup(1), [spawn(5, 1, 0)])).toThrow(RangeError);
  });
});

describe("register", () => {
  test("refuses a second handler for a type and a controller on the system or a taken seat", () => {
    const kernel = setup(1);
    expect(() => register(kernel, toy)).toThrow("already has a handler");
    expect(() => registerController(kernel, 0, bot)).toThrow();
    expect(() => registerController(kernel, 2, bot)).toThrow();
  });
});

describe("streams", () => {
  test("drawing from one stream leaves another's sequence alone", () => {
    const a = createKernel({ seed: 9, debug: false });
    const b = createKernel({ seed: 9, debug: false });
    const fromA = [1, 2, 3, 4, 5].map(() => nextU32(stream(a, "combat")));
    const fromB = [1, 2, 3, 4, 5].map(() => {
      nextU32(stream(b, "economy"));
      return nextU32(stream(b, "combat"));
    });
    expect(fromB).toEqual(fromA);
    expect(checkpointHash(b)).not.toBe(checkpointHash(a));
  });

  test("are hashed in name order, whatever the creation order", () => {
    const a = createKernel({ seed: 9, debug: false });
    const b = createKernel({ seed: 9, debug: false });
    stream(a, "combat");
    stream(a, "ai:2");
    stream(b, "ai:2");
    stream(b, "combat");
    expect(checkpointHash(a)).toBe(checkpointHash(b));
  });
});

describe("checkpoints", () => {
  test("match for the same seed, features and commands, also when commands arrive shuffled", () => {
    const first = play(1);
    expect(first.checkpoints.map((c) => c.tick)).toEqual([100, 200, 300]);
    expect(play(1).checkpoints).toEqual(first.checkpoints);
    expect(play(1, true).checkpoints).toEqual(first.checkpoints);
    expect(play(2).checkpoints).not.toEqual(first.checkpoints);
  });

  test("two kernels in one process share no state", () => {
    const [aloneA, aloneB] = [play(1), play(2)];
    const [a, b] = [setup(1), setup(2)];
    for (let t = 0; t < 300; t++) {
      step(a, script(t, 1));
      step(b, script(t, 2));
    }
    expect(a.checkpoints).toEqual(aloneA.checkpoints);
    expect(b.checkpoints).toEqual(aloneB.checkpoints);
  });

  test("golden hashes for a 300-tick scripted run", () => {
    const kernel = play(1);
    expect(kernel.checkpoints).toEqual([
      { tick: 100, hash: "042addffff95d490" },
      { tick: 200, hash: "cd7857877fac5775" },
      { tick: 300, hash: "f2c1a6b5f489e920" },
    ]);
    expect(checkpointHash(kernel)).toBe(kernel.checkpoints[2]?.hash ?? "");
    expect(kernel.log).toHaveLength(8 + 5);
  });
});
