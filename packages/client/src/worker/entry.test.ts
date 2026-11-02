import { expect, spyOn, test } from "bun:test";
import { flatMap } from "@open-neo-rts/sim/testing";
import type { WorkerReply } from "./protocol";

test("the worker clock includes publication, rebases late callbacks and resets pause/speed deadlines", async () => {
  let now = 0;
  let timerId = 0;
  let publicationMs = 12;
  const timers = new Map<number, { callback: () => void; at: number }>();
  const replies: WorkerReply[] = [];
  const saved = ["postMessage", "onmessage"].map((name) => ({
    name,
    descriptor: Object.getOwnPropertyDescriptor(globalThis, name),
  }));
  const clock = spyOn(performance, "now").mockImplementation(() => now);
  const timeout = spyOn(globalThis, "setTimeout").mockImplementation(((
    callback: () => void,
    delay: number,
  ) => {
    const id = ++timerId;
    timers.set(id, { callback, at: now + delay });
    return id;
  }) as unknown as typeof setTimeout);
  const clear = spyOn(globalThis, "clearTimeout").mockImplementation((id) => {
    timers.delete(Number(id));
  });
  Object.defineProperty(globalThis, "postMessage", {
    configurable: true,
    value: (reply: WorkerReply) => {
      replies.push(reply);
      now += publicationMs;
    },
  });
  const port = globalThis as unknown as { onmessage: (event: { data: unknown }) => void };
  let request = 0;
  const send = (data: Record<string, unknown>) =>
    port.onmessage({ data: { id: ++request, ...data } });
  const latest = () => replies.at(-1)?.state;
  const next = () => {
    expect(timers.size).toBe(1);
    const timer = [...timers.entries()][0];
    if (!timer) throw new Error("Missing scheduled tick");
    return timer;
  };
  const fire = (lateBy = 0) => {
    const [id, timer] = next();
    timers.delete(id);
    now = Math.max(now, timer.at) + lateBy;
    timer.callback();
  };
  try {
    await import("./entry");
    send({
      type: "init",
      options: {
        seat: 1,
        mode: "debug-no-fog",
        setup: {
          map: flatMap(8),
          seed: 1,
          debug: true,
          forces: [{ index: 1, faction: "faction:fixture" }],
          seats: [1],
          grants: [],
          definitions: [],
        },
      },
    });
    expect(latest()?.snapshot.tick).toBe(0);
    send({ type: "pause", paused: false });
    const first = next()[1].at;
    for (let tick = 1; tick <= 10; tick++) {
      expect(next()[1].at).toBe(first + (tick - 1) * 50);
      fire();
      expect(latest()?.snapshot.tick).toBe(tick);
      expect(next()[1].at).toBe(first + tick * 50);
    }
    fire(5000);
    expect(latest()?.snapshot.tick).toBe(11);
    expect(next()[1].at).toBe(now - publicationMs + 50);
    send({ type: "pause", paused: true });
    expect(timers.size).toBe(0);
    now += 5000;
    send({ type: "step" });
    expect(latest()?.snapshot.tick).toBe(12);
    expect(timers.size).toBe(0);
    send({ type: "pause", paused: false });
    expect(next()[1].at).toBe(now - publicationMs + 50);
    send({ type: "speed", speed: 2 });
    expect(next()[1].at).toBe(now - publicationMs + 25);
    fire();
    expect(latest()?.snapshot.tick).toBe(13);
    expect(next()[1].at).toBe(now - publicationMs + 25);
    publicationMs = 80;
    fire();
    expect(latest()?.snapshot.tick).toBe(14);
    expect(next()[1].at).toBe(now);
    fire();
    expect(latest()?.snapshot.tick).toBe(15);
    send({ type: "pause", paused: true });
    expect(timers.size).toBe(0);
    expect(replies.some((reply) => reply.error !== undefined)).toBe(false);
  } finally {
    clock.mockRestore();
    timeout.mockRestore();
    clear.mockRestore();
    for (const { name, descriptor } of saved) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
  }
});
