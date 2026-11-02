import { hasGrant, type Rejection } from "../../commands";
import { defineComponent } from "../../ecs";
import { type Kernel, register } from "../../kernel";
import type { MatchSetup } from "../../match";
import { clearAttackOrder, WeaponState } from "../combat";
import { BuilderConstruction, clearConstructionOrder } from "../construction";
import { suspendRepair } from "../construction/repair";
import { suspendHarvesting } from "../economy/harvesting";
import { MoveIntent, MovementFailure } from "../movement";
import { CombatMotion } from "../projectiles";
import { type Definition, Health, OwnerForce, Template, Transform } from ".";

export const Boarding = defineComponent("Boarding", {
  transport: "u32",
  seat: "u32",
  plannedAt: "u32",
});
export const Cargo = defineComponent("Cargo", {
  transport: "u32",
  x: "i32",
  y: "i32",
  facing: "u16",
});
type Point = { x: number; y: number };

/** All mutable passenger/reservation state is canonical ECS state. */
export class UnitTransports {
  constructor(
    private readonly kernel: Kernel,
    private readonly setup: MatchSetup,
  ) {}
  private definition(id: number) {
    return this.setup.definitions[this.kernel.world.get(id, Template, "definition")];
  }
  private live(id: number, spatial = true) {
    const world = this.kernel.world;
    return (
      world.isAlive(id) &&
      world.has(id, Template) &&
      world.has(id, OwnerForce) &&
      world.has(id, Health) &&
      world.get(id, Health, "current") > 0 &&
      (!spatial || world.has(id, Transform))
    );
  }
  capacity(id: number) {
    if (!this.live(id)) return 0;
    const definition = this.definition(id);
    return definition && ["wheeled", "tracked"].includes(definition.domain ?? "")
      ? (definition.transportSlots ?? 0)
      : 0;
  }
  passengers(id: number) {
    const world = this.kernel.world;
    return world.query(Cargo).filter((unit) => world.get(unit, Cargo, "transport") === id);
  }
  private firingEnabled(id: number) {
    return (
      this.capacity(id) > 0 &&
      this.definition(id)?.transportFireWhileDeployed === true &&
      !!this.kernel.unitModes?.active(id)
    );
  }
  firingPlatform(id: number): number | undefined {
    const { world } = this.kernel;
    if (!this.live(id, false) || !world.has(id, Cargo)) return;
    const carrier = world.get(id, Cargo, "transport");
    if (
      this.firingEnabled(carrier) &&
      world.get(id, OwnerForce, "force") === world.get(carrier, OwnerForce, "force")
    )
      return carrier;
  }
  firingPassengers(id: number) {
    return this.firingEnabled(id)
      ? this.passengers(id).filter((unit) => this.firingPlatform(unit) === id)
      : [];
  }
  snapshot(id: number) {
    const capacity = this.capacity(id);
    if (!capacity) return;
    const { world } = this.kernel;
    return {
      capacity,
      firing: this.firingEnabled(id),
      boarding: world
        .query(Boarding)
        .filter((unit) => world.get(unit, Boarding, "transport") === id).length,
      passengers: this.passengers(id).map((unit) => ({
        definition: this.definition(unit)!.id,
        health: world.get(unit, Health, "current"),
        maxHealth: this.definition(unit)!.health,
      })),
    };
  }
  cancel(id: number) {
    const world = this.kernel.world;
    if (!world.isAlive(id)) return;
    if (world.has(id, Boarding)) world.remove(id, Boarding);
  }
  private stop(id: number) {
    const { world } = this.kernel;
    this.cancel(id);
    this.kernel.movement?.cancel(id);
    if (world.has(id, MoveIntent)) world.remove(id, MoveIntent);
    clearAttackOrder(this.kernel, id);
    if (world.has(id, BuilderConstruction)) clearConstructionOrder(this.kernel, id);
    suspendHarvesting(this.kernel, id);
    suspendRepair(this.kernel, id);
  }
  load(seat: number, transport: number, entities: readonly number[]): Rejection | undefined {
    const { world, tick } = this.kernel;
    const actors = [...new Set(entities)].sort((a, b) => a - b);
    const capacity = this.capacity(transport);
    if (
      !capacity ||
      !actors.length ||
      actors.some(
        (id) =>
          !this.live(id) ||
          this.definition(id)?.domain !== "foot" ||
          world.has(id, Cargo) ||
          id === transport ||
          this.kernel.unitModes?.active(id),
      )
    )
      return "bad_payload";
    const force = world.get(transport, OwnerForce, "force");
    if (
      !hasGrant(this.setup.grants, seat, force, "unit.orders", tick) ||
      actors.some(
        (id) =>
          world.get(id, OwnerForce, "force") !== force ||
          !hasGrant(
            this.setup.grants,
            seat,
            world.get(id, OwnerForce, "force"),
            "unit.orders",
            tick,
          ),
      )
    )
      return "no_grant";
    const reservations = world
      .query(Boarding)
      .filter((id) => world.get(id, Boarding, "transport") === transport && !actors.includes(id));
    if (this.passengers(transport).length + reservations.length + actors.length > capacity)
      return "transport_full";
    for (const id of actors) {
      this.stop(id);
      if (world.has(id, MovementFailure)) world.remove(id, MovementFailure);
      world.add(id, Boarding, { transport, seat });
    }
  }
  private nearby(center: Point, radius = 4) {
    const x = Math.floor(center.x / 1024),
      y = Math.floor(center.y / 1024);
    const points: Point[] = [];
    for (let dy = -radius; dy <= radius; dy++)
      for (let dx = -radius; dx <= radius; dx++) {
        if (!dx && !dy) continue;
        points.push({ x: (x + dx) * 1024 + 512, y: (y + dy) * 1024 + 512 });
      }
    return points.sort(
      (a, b) =>
        (a.x - center.x) ** 2 +
          (a.y - center.y) ** 2 -
          ((b.x - center.x) ** 2 + (b.y - center.y) ** 2) ||
        a.y - b.y ||
        a.x - b.x,
    );
  }
  private position(id: number): Point {
    return {
      x: this.kernel.world.get(id, Transform, "x"),
      y: this.kernel.world.get(id, Transform, "y"),
    };
  }
  private exit(id: number, center: Point) {
    const { world } = this.kernel;
    const definition = this.definition(id) as Definition;
    return this.nearby(center).find(
      (point) =>
        this.kernel.movement?.canTraverseDefinition(
          world.get(id, Template, "definition"),
          center,
          point,
        ) &&
        !world.query(Template, Transform, Health).some((other) => {
          if (!this.live(other) || !this.definition(other)?.id.includes("unit:")) return false;
          const radius =
            (definition.radiusSubcells ?? 0) + (this.definition(other)?.radiusSubcells ?? 0);
          const at = this.position(other);
          return (
            (at.x - point.x) ** 2 + (at.y - point.y) ** 2 < radius ** 2 ||
            (at.x === point.x && at.y === point.y)
          );
        }),
    );
  }
  private release(id: number, point: Point, damaged: boolean) {
    const { world } = this.kernel;
    clearAttackOrder(this.kernel, id);
    const facing = world.get(id, Cargo, "facing");
    world.remove(id, Cargo);
    world.add(id, Transform, { ...point, facing });
    world.add(id, CombatMotion, point);
    if (damaged) {
      const previous = world.get(id, Health, "current");
      const remaining = Math.max(1, Math.floor(previous / 2));
      world.set(id, Health, "current", remaining);
      this.kernel.statistics?.record(
        world.get(id, OwnerForce, "force"),
        "damageTaken",
        previous - remaining,
      );
    }
  }
  unload(seat: number, transport: number): Rejection | undefined {
    const { world, tick } = this.kernel;
    if (!this.capacity(transport)) return "bad_payload";
    if (
      !hasGrant(
        this.setup.grants,
        seat,
        world.get(transport, OwnerForce, "force"),
        "unit.orders",
        tick,
      )
    )
      return "no_grant";
    const passengers = this.passengers(transport);
    if (!passengers.length) return "bad_payload";
    this.kernel.movement?.refreshOccupancy();
    let unloaded = 0;
    for (const id of passengers) {
      const point = this.exit(id, this.position(transport));
      if (point) {
        this.release(id, point, false);
        unloaded++;
      }
    }
    return unloaded ? undefined : "placement_failed";
  }
  tick() {
    const { world, tick, map } = this.kernel;
    for (const id of world.query(Boarding)) {
      const transport = world.get(id, Boarding, "transport");
      const seat = world.get(id, Boarding, "seat");
      if (
        !this.live(id) ||
        !this.capacity(transport) ||
        !hasGrant(this.setup.grants, seat, world.get(id, OwnerForce, "force"), "unit.orders", tick)
      ) {
        this.stop(id);
        continue;
      }
      const at = this.position(id),
        target = this.position(transport);
      const range =
        (this.definition(id)?.radiusSubcells ?? 0) +
        (this.definition(transport)?.radiusSubcells ?? 0) +
        512;
      const level = (point: Point) =>
        map?.terrain.level[
          Math.floor(point.y / 1024) * (map?.terrain.width ?? 0) + Math.floor(point.x / 1024)
        ];
      if (
        (at.x - target.x) ** 2 + (at.y - target.y) ** 2 <= range ** 2 &&
        level(at) === level(target) &&
        this.kernel.movement?.canTraverseDefinition(
          world.get(id, Template, "definition"),
          at,
          target,
        )
      ) {
        const facing = world.get(id, Transform, "facing");
        this.stop(id);
        world.remove(id, Transform);
        if (world.has(id, CombatMotion)) world.remove(id, CombatMotion);
        world.add(id, Cargo, { transport, ...target, facing });
        continue;
      }
      if (world.has(id, MovementFailure)) {
        this.stop(id);
        continue;
      }
      const existing = world.has(id, MoveIntent);
      if (existing && tick - world.get(id, Boarding, "plannedAt") < 20) continue;
      this.kernel.movement?.refreshOccupancy();
      const goal = this.nearby(target, 2).find(
        (point) =>
          (point.x - target.x) ** 2 + (point.y - target.y) ** 2 <= range ** 2 &&
          this.kernel.movement?.canReach(id, point) &&
          this.kernel.movement?.canTraverseDefinition(
            world.get(id, Template, "definition"),
            point,
            target,
          ),
      );
      if (!goal) {
        this.stop(id);
        continue;
      }
      this.kernel.movement?.cancel(id);
      if (world.has(id, MoveIntent)) world.remove(id, MoveIntent);
      this.kernel.movement?.order(id, goal);
      world.set(id, Boarding, "plannedAt", tick);
    }
  }
  follow() {
    const { world } = this.kernel;
    for (const id of world.query(Cargo)) {
      const transport = world.get(id, Cargo, "transport");
      if (!world.isAlive(transport) || !world.has(transport, Transform)) continue;
      const at = this.position(transport);
      world.set(id, Cargo, "x", at.x);
      world.set(id, Cargo, "y", at.y);
    }
  }
  ejectDead() {
    const { world } = this.kernel;
    for (const id of world.query(Cargo)) {
      const transport = world.get(id, Cargo, "transport");
      if (this.live(transport)) continue;
      const center = { x: world.get(id, Cargo, "x"), y: world.get(id, Cargo, "y") };
      const point = this.exit(id, center);
      if (point) this.release(id, point, true);
      else {
        this.kernel.statistics?.record(
          world.get(id, OwnerForce, "force"),
          "damageTaken",
          world.get(id, Health, "current"),
        );
        this.kernel.statistics?.record(world.get(id, OwnerForce, "force"), "unitsLost");
        // Cargo with no exit never becomes a spatial actor or a public death marker.
        for (const state of world.query(WeaponState))
          if (world.get(state, WeaponState, "shooter") === id) world.destroy(state);
        world.destroy(id);
      }
    }
  }
}

export function initializeTransports(kernel: Kernel, setup: MatchSetup) {
  if (!setup.definitions.some((definition) => definition.transportSlots)) return;
  const transport = new UnitTransports(kernel, setup);
  kernel.transport = transport;
  register(kernel, {
    components: [Boarding, Cargo],
    handlers: {
      "unit.load": (_, { seat, payload: { entity, entities } }) =>
        transport.load(seat, entity, entities),
      "unit.unload": (_, { seat, payload: { entity } }) => transport.unload(seat, entity),
    },
    systems: {
      control: [() => transport.tick()],
      movement: [() => transport.follow()],
      destruction: [() => transport.ejectDead()],
    },
  });
}
