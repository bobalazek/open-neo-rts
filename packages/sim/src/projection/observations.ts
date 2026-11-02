import type { ControllerCommand, Kernel } from "../kernel";
import type { MatchSetup } from "../match";
import { createProjection, type SeatSnapshot } from ".";

/** Each bot receives its own copy; changing it cannot change the next observation or simulation. */
function copy(snapshot: SeatSnapshot): SeatSnapshot {
  return {
    ...snapshot,
    entities: snapshot.entities.map((entity) => ({
      ...entity,
      order: entity.order && { ...entity.order },
      ...(entity.power && { power: { ...entity.power } }),
      ...(entity.extraction && { extraction: { ...entity.extraction } }),
      ...(entity.harvesting && { harvesting: { ...entity.harvesting } }),
      ...(entity.construction && { construction: { ...entity.construction } }),
      ...(entity.constructionOrder && { constructionOrder: { ...entity.constructionOrder } }),
      ...(entity.production && {
        production: {
          ...entity.production,
          queue: entity.production.queue.map((item) => ({ ...item })),
          rally: entity.production.rally && { ...entity.production.rally },
        },
      }),
    })),
    ...(snapshot.banks && {
      banks: snapshot.banks.map((bank) => ({ ...bank, resources: { ...bank.resources } })),
    }),
    ...(snapshot.power && { power: snapshot.power.map((power) => ({ ...power })) }),
    ...(snapshot.constructionRequests && {
      constructionRequests: snapshot.constructionRequests.map((request) => ({ ...request })),
    }),
    ...(snapshot.fog && {
      fog: snapshot.fog.map((grid) => ({ ...grid, cells: grid.cells.slice() })),
    }),
    ...(snapshot.ghosts && { ghosts: snapshot.ghosts.map((ghost) => ({ ...ghost })) }),
  };
}

/** Raw numeric IDs remain a debug fixture contract. Normal bots use the same opaque handles as humans. */
function controllerPayload(
  command: ControllerCommand,
  projection: ReturnType<typeof createProjection>,
): unknown {
  const payload = { ...command.payload } as Record<string, unknown>;
  if ("entities" in payload && Array.isArray(payload.entities))
    payload.entities = payload.entities.map(
      (handle) => projection.resolve(handle, "unit.orders") ?? -1,
    );
  if ("builders" in payload && Array.isArray(payload.builders))
    payload.builders = payload.builders.map(
      (handle) => projection.resolve(handle, "economy.build") ?? -1,
    );
  if ("entity" in payload) payload.entity = projection.resolve(payload.entity) ?? -1;
  if ("item" in payload) payload.item = projection.resolve(payload.item, "production.queue") ?? -1;
  return payload;
}

export function initializeObservations(kernel: Kernel, setup: MatchSetup): void {
  const projections = new Map(
    setup.seats.map((seat) => [seat, createProjection(setup, seat, "controlled")]),
  );
  const snapshots = new Map<number, SeatSnapshot>();
  const capture = () => {
    for (const [seat, projection] of projections) snapshots.set(seat, projection.snapshot(kernel));
  };
  capture();
  kernel.captureObservations = capture;
  kernel.observe = (seat) =>
    copy(snapshots.get(seat) ?? { tick: kernel.tick, mode: "controlled", entities: [] });
  kernel.controllerPayload = (seat, command) => {
    const projection = projections.get(seat);
    return setup.normal && projection ? controllerPayload(command, projection) : command.payload;
  };
}
