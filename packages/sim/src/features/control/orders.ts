import {
  type Command,
  hasGrant,
  QUEUED_ORDER_TYPES,
  REJECTIONS,
  type Rejection,
  type Scope,
} from "../../commands";
import { defineComponent } from "../../ecs";
import { type Handler, type Kernel, register } from "../../kernel";
import type { MatchSetup } from "../../match";
import { AttackMoveOrder, AttackOrder, HoldPosition, weaponTargets } from "../combat";
import { BuilderConstruction, ConstructionSite } from "../construction";
import { RepairOrder } from "../construction/repair";
import { HARVEST_STATUSES, Harvester, suspendHarvesting } from "../economy/harvesting";
import { Health, OwnerForce, Template, Transform } from "../entities";
import { Boarding } from "../entities/transport";
import { MoveIntent } from "../movement";
import { SalvageOrder } from "../salvage";

export const MAX_QUEUED_ORDERS = 32;
export const ORDER_REFUSALS = Object.keys(REJECTIONS) as Rejection[];
export type QueuedType = (typeof QUEUED_ORDER_TYPES)[number];
type OrderCommand = Extract<Command, { type: QueuedType }>;
export const QueuedOrder = defineComponent("QueuedOrder", {
  actor: "u32",
  seat: "u32",
  kind: "u8",
  group: "u32",
  target: "u32",
  x: "i32",
  y: "i32",
  definition: "u32",
  force: "u32",
  facing: "u16",
  reason: "u8",
});
export const OrderFailure = defineComponent("OrderFailure", {
  code: "u8",
  tick: "u32",
  scope: "u8",
});
export const orderScope = (type: QueuedType): Scope =>
  type.startsWith("economy.")
    ? "economy.build"
    : type === "unit.deploy"
      ? "unit.abilities"
      : "unit.orders";
const positional = (type: QueuedType) =>
  ["unit.move", "unit.attackMove", "economy.build"].includes(type);

/** Pending jobs are canonical ECS rows; execution always reuses the original authoritative handler. */
export class UnitOrders {
  private readonly handlers = new Map<string, Handler>();
  constructor(
    private readonly kernel: Kernel,
    private readonly setup: Pick<MatchSetup, "definitions" | "grants">,
  ) {
    for (const type of QUEUED_ORDER_TYPES) {
      const handler = kernel.handlers.get(type);
      if (!handler) continue;
      this.handlers.set(type, handler);
      kernel.handlers.set(type, (kernel, raw) => {
        const command = raw as OrderCommand;
        if (command.payload.append === 1) return this.append(command);
        const candidates = this.actors(command).filter((actor) => this.capable(command, actor));
        const result = handler(kernel, command);
        if (!result) {
          const credited = candidates.filter(
            (actor) =>
              !["unit.move", "unit.attackMove", "unit.attack"].includes(command.type) ||
              this.affected(command, actor),
          );
          kernel.statistics?.order(command.seat, [
            ...new Set(credited.map((actor) => kernel.world.get(actor, OwnerForce, "force"))),
          ]);
          for (const actor of this.actors(command).filter((actor) => this.affected(command, actor)))
            this.clear(actor);
          if (type === "unit.unload")
            this.handlers.get("unit.stop")?.(kernel, {
              ...command,
              type: "unit.stop",
              payload: { entities: this.actors(command) },
            });
        }
        return result;
      });
    }
  }
  type(row: number): QueuedType {
    return QUEUED_ORDER_TYPES[this.kernel.world.get(row, QueuedOrder, "kind")]!;
  }
  private definition(actor: number) {
    return this.setup.definitions[this.kernel.world.get(actor, Template, "definition")];
  }
  private live(actor: number): boolean {
    const { world } = this.kernel;
    return (
      world.isAlive(actor) &&
      world.has(actor, Template) &&
      world.has(actor, OwnerForce) &&
      world.has(actor, Health) &&
      world.get(actor, Health, "current") > 0
    );
  }
  private actors(command: OrderCommand): number[] {
    const payload = command.payload;
    return [
      ...new Set(
        "entities" in payload
          ? payload.entities
          : "builders" in payload
            ? payload.builders
            : [payload.entity],
      ),
    ].sort((a, b) => a - b);
  }
  rows(actor: number): number[] {
    const { world } = this.kernel;
    return world.query(QueuedOrder).filter((row) => world.get(row, QueuedOrder, "actor") === actor);
  }
  clear(actor: number): void {
    const { world } = this.kernel;
    for (const row of this.rows(actor)) world.destroy(row);
    if (world.isAlive(actor) && world.has(actor, OrderFailure)) world.remove(actor, OrderFailure);
  }
  allowed(seat: number, row: number): boolean {
    const { world, tick } = this.kernel,
      actor = world.get(row, QueuedOrder, "actor");
    return (
      this.live(actor) &&
      world.get(actor, OwnerForce, "force") === world.get(row, QueuedOrder, "force") &&
      hasGrant(
        this.setup.grants,
        seat,
        world.get(actor, OwnerForce, "force"),
        orderScope(this.type(row)),
        tick,
      )
    );
  }
  private affected(command: OrderCommand, actor: number): boolean {
    const { world, unitModes } = this.kernel;
    if (!this.live(actor) || !world.has(actor, Transform) || !this.definition(actor)?.domain)
      return false;
    switch (command.type) {
      case "unit.move":
      case "unit.attackMove":
        return !!this.definition(actor)?.speed && !unitModes?.active(actor);
      case "unit.attack":
        return (
          world.has(actor, AttackOrder) &&
          world.get(actor, AttackOrder, "target") === command.payload.entity &&
          [actor, ...(this.kernel.transport?.firingPassengers(actor) ?? [])].some((shooter) =>
            this.definition(shooter)?.weapons?.some((weapon) =>
              weaponTargets(weapon, this.definition(command.payload.entity)!),
            ),
          )
        );
      case "unit.hold":
        return world.has(actor, HoldPosition);
      case "unit.harvest":
        return world.has(actor, Harvester) && world.get(actor, Harvester, "enabled") === 1;
      case "unit.deploy":
        return !!this.definition(actor)?.deployMode;
      default:
        return true;
    }
  }
  private capable(command: OrderCommand, actor: number): boolean {
    const { kernel } = this,
      { world } = kernel;
    if (!this.live(actor) || !world.has(actor, Transform)) return false;
    const definition = this.definition(actor);
    if (!definition?.domain) return false;
    switch (command.type) {
      case "unit.move":
      case "unit.attackMove":
        return definition.speed > 0;
      case "unit.attack": {
        if (!this.live(command.payload.entity)) return false;
        const target = this.definition(command.payload.entity)!;
        return [actor, ...(kernel.transport?.passengers(actor) ?? [])].some((shooter) =>
          this.definition(shooter)?.weapons?.some((weapon) => weaponTargets(weapon, target)),
        );
      }
      case "unit.harvest":
        return (
          definition.role === "harvester" &&
          !!definition.harvestCapacity &&
          !!definition.harvestAmountPerSecond
        );
      case "unit.load":
        return definition.domain === "foot";
      case "unit.unload":
        return !!definition.transportSlots;
      case "unit.deploy":
        return !!definition.deployMode;
      case "economy.repair":
        return definition.role === "builder" && !!definition.repair;
      case "economy.assistConstruction":
      case "economy.salvage":
        return definition.role === "builder";
      case "economy.build":
        return (
          definition.role === "builder" && !!definition.builds?.includes(command.payload.definition)
        );
      default:
        return true;
    }
  }
  private append(command: OrderCommand): Rejection | undefined {
    const { kernel } = this,
      { world } = kernel,
      payload = command.payload;
    const actors = this.actors(command).filter((actor) => this.capable(command, actor));
    if (!actors.length) return "bad_payload";
    if (
      !actors.every((actor) =>
        hasGrant(
          this.setup.grants,
          command.seat,
          world.get(actor, OwnerForce, "force"),
          orderScope(command.type),
          kernel.tick,
        ),
      )
    )
      return "no_grant";
    if (actors.some((actor) => this.rows(actor).length >= MAX_QUEUED_ORDERS))
      return "order_queue_full";
    if (
      command.type.startsWith("economy.") &&
      "builders" in payload &&
      (actors.length !== payload.builders.length ||
        !actors.every(
          (actor) =>
            world.get(actor, OwnerForce, "force") === world.get(actors[0]!, OwnerForce, "force"),
        ))
    )
      return "bad_payload";
    const target = "entity" in payload ? payload.entity : 0;
    if ("entity" in payload && command.type !== "unit.unload") {
      if (command.type === "economy.salvage") {
        if (!kernel.remains?.canSee(command.seat, target)) return "bad_payload";
      } else if (!this.live(target) || !kernel.visibility?.canSeeEntity(command.seat, target))
        return "bad_payload";
      if (
        command.type === "unit.attack" &&
        actors.some(
          (actor) =>
            kernel.vision?.groupForForce(world.get(actor, OwnerForce, "force")) ===
            kernel.vision?.groupForForce(world.get(target, OwnerForce, "force")),
        )
      )
        return "bad_payload";
      if (
        ["unit.load", "economy.assistConstruction", "economy.repair"].includes(command.type) &&
        actors.some(
          (actor) =>
            world.get(actor, OwnerForce, "force") !== world.get(target, OwnerForce, "force"),
        )
      )
        return "bad_payload";
      if (command.type === "unit.load" && !kernel.transport?.capacity(target)) return "bad_payload";
      if (command.type === "economy.assistConstruction" && !world.has(target, ConstructionSite))
        return "bad_payload";
    }
    const definition =
      "definition" in payload
        ? this.setup.definitions.findIndex((definition) => definition.id === payload.definition)
        : 0;
    if (
      command.type === "economy.build" &&
      (definition < 0 ||
        !this.setup.definitions[definition]?.construction ||
        actors.some((actor) => world.get(actor, OwnerForce, "force") !== command.payload.force))
    )
      return "bad_payload";
    let group = 0;
    for (const actor of actors) {
      const row = world.create();
      if (!group) group = row;
      world.add(row, QueuedOrder, {
        actor,
        seat: command.seat,
        kind: QUEUED_ORDER_TYPES.indexOf(command.type),
        group: command.type === "economy.build" ? group : row,
        target,
        x: "x" in payload ? payload.x : 0,
        y: "y" in payload ? payload.y : 0,
        definition,
        force: world.get(actor, OwnerForce, "force"),
        facing: "facing" in payload ? payload.facing : 0,
      });
      if (world.has(actor, OrderFailure)) world.remove(actor, OrderFailure);
    }
    kernel.statistics?.order(command.seat, [
      ...new Set(actors.map((actor) => world.get(actor, OwnerForce, "force"))),
    ]);
  }
  private busy(actor: number): boolean {
    const { world } = this.kernel;
    if (!world.has(actor, Transform) || this.kernel.disabled?.(actor)) return true;
    if (
      [
        MoveIntent,
        AttackOrder,
        AttackMoveOrder,
        HoldPosition,
        BuilderConstruction,
        RepairOrder,
        SalvageOrder,
      ].some((component) => world.has(actor, component)) ||
      (this.kernel.transport && world.has(actor, Boarding))
    )
      return true;
    return (
      world.has(actor, Harvester) &&
      world.get(actor, Harvester, "enabled") === 1 &&
      ["travel_ore", "mining", "travel_dock", "queued", "unloading"].includes(
        HARVEST_STATUSES[world.get(actor, Harvester, "state")]!,
      )
    );
  }
  harvestFinished(actor: number): void {
    if (this.rows(actor).length) suspendHarvesting(this.kernel, actor);
  }
  private command(row: number, actors: number[]): OrderCommand {
    const { world, tick } = this.kernel;
    const type = this.type(row),
      target = world.get(row, QueuedOrder, "target");
    const point = { x: world.get(row, QueuedOrder, "x"), y: world.get(row, QueuedOrder, "y") };
    let payload: object;
    switch (type) {
      case "unit.move":
      case "unit.attackMove":
        payload = { entities: actors, ...point };
        break;
      case "unit.attack":
      case "unit.load":
        payload = { entities: actors, entity: target };
        break;
      case "unit.unload":
        payload = { entity: actors[0] };
        break;
      case "economy.assistConstruction":
      case "economy.repair":
      case "economy.salvage":
        payload = { builders: actors, entity: target };
        break;
      case "economy.build":
        payload = {
          builders: actors,
          ...point,
          definition: this.setup.definitions[world.get(row, QueuedOrder, "definition")]!.id,
          force: world.get(row, QueuedOrder, "force"),
          facing: world.get(row, QueuedOrder, "facing"),
        };
        break;
      default:
        payload = { entities: actors };
    }
    return {
      tick,
      sequence: 0,
      seat: world.get(row, QueuedOrder, "seat"),
      type,
      payload,
    } as OrderCommand;
  }
  prune(): void {
    const { world } = this.kernel;
    for (const row of world.query(QueuedOrder)) {
      const actor = world.get(row, QueuedOrder, "actor");
      if (
        !this.live(actor) ||
        world.get(actor, OwnerForce, "force") !== world.get(row, QueuedOrder, "force")
      )
        world.destroy(row);
    }
  }
  tick(): void {
    this.prune();
    const { kernel } = this,
      { world } = kernel;
    const rows = world.query(QueuedOrder),
      heads = new Map<number, number>();
    for (const row of rows) {
      const actor = world.get(row, QueuedOrder, "actor");
      if (!heads.has(actor)) heads.set(actor, row);
    }
    const used = new Set<number>(),
      seenGroups = new Set<number>();
    for (const row of rows) {
      if (!world.isAlive(row)) continue;
      const group = world.get(row, QueuedOrder, "group");
      if (seenGroups.has(group)) continue;
      seenGroups.add(group);
      const jobs =
        this.type(row) === "economy.build"
          ? rows.filter(
              (other) => world.isAlive(other) && world.get(other, QueuedOrder, "group") === group,
            )
          : [row];
      const actors = jobs.map((job) => world.get(job, QueuedOrder, "actor"));
      if (
        jobs.some(
          (job, index) =>
            heads.get(actors[index]!) !== job ||
            used.has(actors[index]!) ||
            this.busy(actors[index]!),
        )
      )
        continue;
      for (const actor of actors) used.add(actor);
      const command = this.command(row, actors);
      let reason = jobs.every((job) => this.allowed(command.seat, job))
        ? this.handlers.get(command.type)?.(kernel, command)
        : "no_grant";
      if (
        (!reason || reason === "placement_failed") &&
        command.type === "unit.unload" &&
        actors.some((actor) => this.kernel.transport?.passengers(actor).length)
      )
        reason = "unload_blocked";
      const waiting =
        reason &&
        ["no_grant", "insufficient_funds", "cooldown", "transport_full", "unload_blocked"].includes(
          reason,
        );
      for (const job of jobs) {
        if (waiting && reason)
          world.set(job, QueuedOrder, "reason", ORDER_REFUSALS.indexOf(reason) + 1);
        else if (world.isAlive(job)) world.destroy(job);
      }
      if (waiting) continue;
      for (const actor of actors) {
        if (reason) {
          if (!world.has(actor, OrderFailure)) world.add(actor, OrderFailure);
          world.set(actor, OrderFailure, "code", ORDER_REFUSALS.indexOf(reason) + 1);
          world.set(actor, OrderFailure, "tick", kernel.tick);
          world.set(
            actor,
            OrderFailure,
            "scope",
            orderScope(command.type) === "economy.build"
              ? 1
              : orderScope(command.type) === "unit.abilities"
                ? 2
                : 0,
          );
        } else if (command.type === "unit.stop") this.clear(actor);
      }
      if (!reason && command.type === "unit.unload")
        this.handlers.get("unit.stop")?.(kernel, {
          ...command,
          type: "unit.stop",
          payload: { entities: actors },
        });
    }
  }
  cancel(seat: number, row: number, point?: { x: number; y: number }): Rejection | undefined {
    const { world } = this.kernel;
    if (!world.isAlive(row) || !world.has(row, QueuedOrder)) return "bad_payload";
    if (!this.allowed(seat, row)) return "no_grant";
    if (point && !positional(this.type(row))) return "bad_payload";
    const group = world.get(row, QueuedOrder, "group");
    const jobs = world
      .query(QueuedOrder)
      .filter((job) => world.get(job, QueuedOrder, "group") === group);
    if (!jobs.every((job) => this.allowed(seat, job))) return "no_grant";
    for (const job of jobs)
      if (world.get(job, QueuedOrder, "group") === group) {
        if (point) {
          world.set(job, QueuedOrder, "x", point.x);
          world.set(job, QueuedOrder, "y", point.y);
          world.set(job, QueuedOrder, "reason", 0);
        } else world.destroy(job);
      }
  }
}

export function initializeOrderQueues(
  kernel: Kernel,
  setup: Pick<MatchSetup, "definitions" | "grants">,
): void {
  const orders = new UnitOrders(kernel, setup);
  kernel.orders = orders;
  register(kernel, {
    components: [QueuedOrder, OrderFailure],
    handlers: {
      "unit.cancelQueued": (_kernel, { seat, payload }) => orders.cancel(seat, payload.item),
      "unit.editQueued": (_kernel, { seat, payload }) => orders.cancel(seat, payload.item, payload),
    },
    systems: { control: [() => orders.tick()], destruction: [() => orders.prune()] },
  });
}
