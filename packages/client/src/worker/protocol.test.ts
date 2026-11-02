import { expect, test } from "bun:test";
import { isWorkerReply } from "./protocol";

const resources = { credits: 5000, materials: 0, "industrial-capacity": 0, "salvage-points": 0 };
const reply = (banks: unknown, mode = "controlled") => ({
  id: 1,
  state: { paused: true, speed: 1, snapshot: { tick: 0, mode, entities: [], banks } },
});

test("worker replies accept bounded copied stock banks and retain bank-free debug packets", () => {
  expect(isWorkerReply(reply([{ force: 1, resources }]))).toBe(true);
  expect(isWorkerReply(reply([]))).toBe(true);
  expect(isWorkerReply(reply(undefined, "debug-no-fog"))).toBe(true);
  expect(isWorkerReply(reply([{ force: 1, resources }], "debug-no-fog"))).toBe(false);
});

test("worker replies reject forged bank values, unknown/capacity/prototype keys and duplicate Forces", () => {
  for (const malformed of [
    null,
    {},
    [{ force: -1, resources }],
    [{ force: 0.5, resources }],
    [{ force: 0x80000000, resources }],
    [{ force: 1, resources: { ...resources, credits: -1 } }],
    [{ force: 1, resources: { ...resources, credits: 0.5 } }],
    [{ force: 1, resources: { ...resources, credits: 0x80000000 } }],
    [{ force: 1, resources: { ...resources, credits: Number.NaN } }],
    [{ force: 1, resources: { ...resources, power: 1 } }],
    [{ force: 1, resources: { ...resources, unknown: 1 } }],
    [{ force: 1, resources: { ...resources, constructor: 1 } }],
    [{ force: 1, resources: Object.assign(Object.create({ credits: 1 }), resources) }],
    [{ force: 1, resources: { ...resources, ...JSON.parse('{"__proto__": 1}') } }],
    [
      { force: 1, resources },
      { force: 1, resources },
    ],
    [
      { force: 2, resources },
      { force: 1, resources },
    ],
    [{ force: 1, resources: { credits: 5000 } }],
    Array(1),
    Array.from({ length: 9 }, (_, force) => ({ force, resources })),
  ])
    expect(isWorkerReply(reply(malformed))).toBe(false);
});
