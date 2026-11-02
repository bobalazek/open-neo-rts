import { expect, test } from "bun:test";
import type { MatchSetup } from "@open-neo-rts/sim";
import { flatMap } from "@open-neo-rts/sim/testing";
import { isWorkerReply, type WorkerReply } from "./protocol";

test("worker starts validated bot hosts, publishes only seat state and refuses human commands for bot-owned seats", async () => {
  const map = flatMap(24);
  const setup: MatchSetup = {
    seed: 1,
    debug: false,
    map: { ...map, spawns: [{ id: "west", position: [8192, 8192], facing: 0x4000 }] },
    seats: [1],
    forces: [{ index: 1, faction: "faction:test" }],
    grants: [{ seat: 1, force: 1, scopes: ["unit.orders"], grantedAtTick: 0 }],
    definitions: [
      {
        id: "structure:test/headquarters",
        role: "headquarters",
        health: 100,
        speed: 0,
        turnRate: 0,
        footprint: [1, 1],
        visionSubcells: 1024,
      },
      {
        id: "unit:test/builder",
        role: "builder",
        health: 10,
        speed: 1024,
        turnRate: 65536,
        domain: "foot",
        radiusSubcells: 0,
        visionSubcells: 1024,
      },
    ],
    normal: {
      gameplayHash: "1234567890abcdef",
      mapSupport: { start: "faction", players: { min: 1, max: 1 } },
      settings: { startingCredits: 100, popCap: 200, structureCap: 150 },
      bots: [{ seat: 1, kind: "idle" }],
      forces: [
        {
          index: 1,
          team: 1,
          spawn: "west",
          start: {
            structures: ["structure:test/headquarters"],
            units: [{ unit: "unit:test/builder", count: 1, pop: 1, role: "builder" }],
            resources: { credits: 100 },
          },
        },
      ],
    },
  };
  const worker = new Worker(new URL("./entry.ts", import.meta.url));
  const pending = new Map<number, (value: WorkerReply) => void>();
  let next = 1;
  worker.onmessage = ({ data }: MessageEvent<WorkerReply>) => {
    pending.get(data.id)?.(data);
    pending.delete(data.id);
  };
  const request = (message: object) =>
    new Promise<WorkerReply>((resolve) => {
      const id = next++;
      pending.set(id, resolve);
      worker.postMessage({ id, ...message });
    });
  try {
    const initialized = await request({
      type: "init",
      options: { setup, seat: 1, mode: "controlled" },
    });
    expect(initialized.error).toBeUndefined();
    expect(isWorkerReply(initialized)).toBe(true);
    expect(initialized.state?.hash).toBeUndefined();
    expect(initialized.state?.snapshot.entities).toHaveLength(2);
    expect("bots" in (initialized.state?.snapshot ?? {})).toBe(false);
    const stepped = await request({ type: "step" });
    expect(stepped.state?.snapshot.tick).toBe(1);
    expect(isWorkerReply(stepped)).toBe(true);
    const denied = await request({
      type: "command",
      command: {
        type: "unit.stop",
        payload: { entities: [initialized.state?.snapshot.entities[1]?.handle] },
      },
    });
    expect(denied.error).toBe("This seat is controlled by a bot");
  } finally {
    worker.terminate();
  }
});
