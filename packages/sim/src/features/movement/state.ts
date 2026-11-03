import { arr, bool, int, oneOf, opt, str } from "@open-neo-rts/content";
import { strictObject } from "../../snapshots/schema";

/** JSON shapes are checked before the existing search restorers validate geometric continuations. */
export function movementStateSchema(
  width: number,
  height: number,
  definitions: number,
  forces: number,
) {
  const cells = width * height,
    id = () => int(0, 0x7fffffff),
    safe = () => int(0, Number.MAX_SAFE_INTEGER);
  const point = strictObject({ x: id(), y: id() });
  // Dock perimeter points retain facing in existing captures, although movement reads x/y.
  const requested = strictObject({ x: id(), y: id(), facing: opt(int(0, 0xffff)) });
  const local = strictObject({ x: int(0, width * 1024 - 1), y: int(0, height * 1024 - 1) });
  const nullable = (schema: ReturnType<typeof strictObject>) => ({
    ...schema,
    check(value: unknown, path: string, issues: import("@open-neo-rts/content").Issue[]) {
      if (value !== null) schema.check(value, path, issues);
    },
  });
  const sweep = nullable(
    strictObject({
      a: point,
      b: point,
      cursor: id(),
      status: oneOf(["searching", "clear", "blocked"]),
      stack: arr(id(), 0, 65536),
      blocker: int(-1, 0x7fffffff),
    }),
  );
  const nearest = nullable(
    strictObject({
      stack: arr(id(), 0, cells * 2),
      best: int(-1, cells - 1),
      distance: safe(),
      visits: id(),
    }),
  );
  const entry = strictObject({ node: id(), lo: int(-1, width - 1), hi: int(-1, width - 1) });
  const visible = nullable(
    strictObject({
      work: id(),
      stack: arr(entry, 0, cells * 2),
      active: nullable(entry),
      occluders: arr(id(), 0, 65536),
      cursor: id(),
      corner: int(0, 4),
      best: int(-1, cells - 1),
      distance: safe(),
      sweep,
    }),
  );
  const anchor = nullable(
    strictObject({
      phase: int(0, 8),
      scan: int(0, cells),
      preferred: int(0, cells),
      preferredGoal: int(-1, cells - 1),
      goalDistance: safe(),
      selected: int(-1, cells - 1),
      goal: int(-1, cells - 1),
      candidate: int(-1, cells - 1),
      purpose: int(0, 3),
      destination: point,
      direct: bool(),
      sweep,
      nearest,
      visible,
    }),
  );
  const path = nullable(
    strictObject({
      start: int(0, cells - 1),
      goal: int(0, cells - 1),
      cost: arr(int(-1, cells * 14 * 65535), cells, cells),
      parent: arr(int(-1, cells - 1), cells, cells),
      closed: arr(int(0, 1), cells, cells),
      heap: arr(int(0, cells - 1), 0, cells),
      best: int(0, cells - 1),
      status: oneOf(["searching", "found", "unreachable"]),
    }),
  );
  const envelope = {
    force: id(),
    entity: int(1, 0x7fffffff),
    issueTick: id(),
    kind: oneOf(["order", "repath"]),
  };
  const scheduler = strictObject({
    budget: id(),
    forces: arr(id(), forces, forces),
    cursor: id(),
    queues: arr(
      arr(
        strictObject({
          request: strictObject({ ...envelope, start: int(0, cells - 1), goal: int(0, cells - 1) }),
          search: path,
        }),
        0,
        65536,
      ),
      forces,
      forces,
    ),
    anchors: arr(
      arr(
        strictObject({
          request: strictObject({
            ...envelope,
            input: strictObject({
              position: local,
              requested,
              bounded: local,
              uniform: bool(),
            }),
          }),
          search: anchor,
        }),
        0,
        65536,
      ),
      forces,
      forces,
    ),
    anchorCursors: arr(id(), forces, forces),
    turns: arr(int(0, 1), forces, forces),
  });
  return strictObject({
    occupancy: str(),
    profiles: arr(
      strictObject({
        definition: int(0, Math.max(0, definitions - 1)),
        objects: arr(
          strictObject({
            definition: str(),
            position: arr(id(), 2, 2),
            rotation: int(0, 270),
            owner: oneOf(["neutral"]),
          }),
          0,
          65536,
        ),
      }),
      0,
      definitions,
    ),
    routes: arr(
      strictObject({
        entity: int(1, 0x7fffffff),
        definition: int(0, Math.max(0, definitions - 1)),
        goal: int(-1, cells - 1),
        requested,
        target: local,
        path: arr(local, 0, cells + 1),
        searching: bool(),
        preparing: bool(),
        stuck: int(0, 40),
        repaths: int(0, 2),
      }),
      0,
      65536,
    ),
    scheduler,
  });
}
