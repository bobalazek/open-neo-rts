import type { ControllerCommand, Kernel } from "../kernel";
import type { MatchSetup } from "../match";
import { createProjection, type SeatSnapshot } from ".";

/** Each bot receives its own copy; changing it cannot change the next observation or simulation. */
function copy(snapshot: SeatSnapshot): SeatSnapshot {
  // Presentation events are cosmetic, not restored gameplay inputs.
  const { combatEvents: _combatEvents, productionExits: _productionExits, ...gameplay } = snapshot;
  return {
    ...gameplay,
    ...(snapshot.statistics && {
      statistics: snapshot.statistics.map((entry) => ({
        ...entry,
        counters: { ...entry.counters },
        ...(entry.details && {
          details: {
            controllers: entry.details.controllers.map((controller) => ({ ...controller })),
            types: entry.details.types.map((type) => ({ ...type })),
            history: entry.details.history.map((point) => ({
              tick: point.tick,
              values: { ...point.values },
            })),
          },
        }),
      })),
    }),
    ...(snapshot.victory && {
      victory: {
        ...snapshot.victory,
        forces: snapshot.victory.forces.map((force) => ({ ...force })),
        result: snapshot.victory.result && { ...snapshot.victory.result },
      },
    }),
    entities: snapshot.entities.map((entity) => ({
      ...entity,
      ...(entity.cargo && {
        cargo: {
          ...entity.cargo,
          passengers: entity.cargo.passengers.map((passenger) => ({ ...passenger })),
        },
      }),
      ...(entity.deploy && { deploy: { ...entity.deploy } }),
      ...(entity.veterancy && { veterancy: { ...entity.veterancy } }),
      ...(entity.productionSurge && { productionSurge: { ...entity.productionSurge } }),
      order: entity.order && { ...entity.order },
      ...(entity.power && {
        power: {
          ...entity.power,
          ...(entity.power.sources && { sources: [...entity.power.sources] }),
        },
      }),
      ...(entity.extraction && { extraction: { ...entity.extraction } }),
      ...(entity.harvesting && {
        harvesting: {
          ...entity.harvesting,
          ...(entity.harvesting.target && { target: { ...entity.harvesting.target } }),
        },
      }),
      ...(entity.construction && { construction: { ...entity.construction } }),
      ...(entity.constructionOrder && { constructionOrder: { ...entity.constructionOrder } }),
      ...(entity.repair && { repair: { ...entity.repair } }),
      ...(entity.repairOrder && { repairOrder: { ...entity.repairOrder } }),
      ...(entity.queuedOrders && {
        queuedOrders: entity.queuedOrders.map((order) => ({ ...order })),
      }),
      ...(entity.orderFailure && { orderFailure: { ...entity.orderFailure } }),
      ...(entity.salvageOrder && { salvageOrder: { ...entity.salvageOrder } }),
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
    ...(snapshot.remains && { remains: snapshot.remains.map((remains) => ({ ...remains })) }),
    ...(snapshot.resourceNodes && {
      resourceNodes: snapshot.resourceNodes.map((node) => ({ ...node })),
    }),
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
      (handle) =>
        projection.resolve(
          handle,
          command.type === "unit.deploy" ? "unit.abilities" : "unit.orders",
        ) ?? -1,
    );
  if ("builders" in payload && Array.isArray(payload.builders))
    payload.builders = payload.builders.map(
      (handle) => projection.resolve(handle, "economy.build") ?? -1,
    );
  if ("entity" in payload)
    payload.entity =
      projection.resolve(
        payload.entity,
        command.type === "commander.activate"
          ? "commander.abilities"
          : command.type === "unit.load" || command.type === "unit.unload"
            ? "unit.orders"
            : undefined,
      ) ?? -1;
  if ("item" in payload)
    payload.item =
      projection.resolve(
        payload.item,
        command.type === "production.cancel" ? "production.queue" : undefined,
      ) ?? -1;
  return payload;
}

export function initializeObservations(kernel: Kernel, setup: MatchSetup): void {
  const projections = new Map(
    setup.seats.map((seat) => [seat, createProjection(setup, seat, "controlled")]),
  );
  kernel.observationProjections = projections;
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
