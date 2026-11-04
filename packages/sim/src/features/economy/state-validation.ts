import { resourceNodeOrigin } from "../../match-map";
import {
  type CanonicalValidation,
  canonicalInvariant as check,
} from "../../snapshots/validation-context";
import { Template, Transform } from "../entities";
import { ForceBank } from "./bank";
import { Extraction, ResourceNode } from "./extraction";
import {
  AVOID_TICKS,
  HARVEST_STATUSES,
  HARVEST_UNLOAD_TICKS,
  Harvester,
  RETRY_TICKS,
} from "./harvesting";
import { ORE_REGROWTH_TICKS, OreCell } from "./ore";
import { StructurePower } from "./power";

export function prepareEconomyValidation(context: CanonicalValidation): () => void {
  const { world, rows, has, actor, setup } = context;
  const anchors = [
    context.fixed(ForceBank, ["force"]),
    context.fixed(ResourceNode, ["index"]),
    context.fixed(OreCell, ["cell", "cap"]),
  ];
  return () => {
    for (const validate of anchors) validate();
    for (const id of rows(Template)) {
      const definition = actor(id);
      check(
        definition.power === undefined || has(id, StructurePower),
        `structure ${id} lost its power attachment`,
      );
      check(
        !definition.extraction || has(id, Extraction),
        `extractor ${id} lost its extraction attachment`,
      );
    }
    for (const id of rows(ForceBank)) {
      check(!has(id, Template), `bank ${id} is also an actor`);
      for (const field of ["credits", "materials", "industrialCapacity", "salvagePoints"] as const)
        check(world.get(id, ForceBank, field) >= 0, `bank ${id} has negative stock`);
    }
    for (const id of rows(ResourceNode)) {
      check(!has(id, Template), `deposit ${id} is also an actor`);
      const node = setup.map.resources?.[world.get(id, ResourceNode, "index")];
      check(node && node.kind !== "ore", `deposit ${id} is not a node`);
      const remaining = world.get(id, ResourceNode, "remaining");
      check(
        node.amount === undefined ? remaining === -1 : remaining >= 0 && remaining <= node.amount,
        `deposit ${id} has invalid stock`,
      );
    }
    for (const id of rows(OreCell)) {
      const cap = world.get(id, OreCell, "cap"),
        remaining = world.get(id, OreCell, "remaining");
      check(
        !has(id, Template) && remaining >= 0 && remaining <= cap,
        `ore ${id} has invalid stock`,
      );
      check(
        world.get(id, OreCell, "regrowthTicks") < ORE_REGROWTH_TICKS,
        `ore ${id} has invalid regrowth`,
      );
    }
    for (const id of rows(StructurePower)) {
      const definition = actor(id);
      check(
        definition.power !== undefined &&
          world.get(id, StructurePower, "amount") === definition.power,
        `structure ${id} changed base power`,
      );
      check(
        world.get(id, StructurePower, "enabled") <= 1,
        `structure ${id} has invalid power toggle`,
      );
    }
    for (const id of rows(Extraction)) {
      const definition = actor(id);
      check(definition.extraction, `extractor ${id} has no extraction recipe`);
      check(world.get(id, Extraction, "progress") < 20000, `extractor ${id} has invalid progress`);
      const nodeId = world.get(id, Extraction, "node");
      if (!nodeId) continue; // Failed placement bindings remain inert and observable as invalid_node.
      check(
        has(nodeId, ResourceNode) && has(id, Transform),
        `extractor ${id} has an invalid deposit`,
      );
      const resource = setup.map.resources?.[world.get(nodeId, ResourceNode, "index")];
      check(
        resource && resource.kind !== "ore" && definition.nodeKinds?.includes(resource.kind),
        `extractor ${id} has an incompatible deposit`,
      );
      const origin = resourceNodeOrigin(resource);
      check(
        world.get(id, Transform, "x") === origin.x * 1024 &&
          world.get(id, Transform, "y") === origin.y * 1024,
        `extractor ${id} moved away from its deposit`,
      );
    }
    for (const id of rows(Harvester)) {
      const definition = actor(id),
        capacity = definition.harvestCapacity;
      check(
        definition.role === "harvester" && capacity && definition.harvestAmountPerSecond,
        `harvester ${id} has no hauling recipe`,
      );
      check(
        world.get(id, Harvester, "cargo") >= 0 && world.get(id, Harvester, "cargo") <= capacity,
        `harvester ${id} exceeds cargo capacity`,
      );
      check(
        world.get(id, Harvester, "state") < HARVEST_STATUSES.length &&
          world.get(id, Harvester, "enabled") <= 1,
        `harvester ${id} has an invalid state`,
      );
      check(
        world.get(id, Harvester, "miningWork") < 20 &&
          world.get(id, Harvester, "unloadTicks") <= HARVEST_UNLOAD_TICKS,
        `harvester ${id} has invalid work`,
      );
      check(
        context.point(world.get(id, Harvester, "x"), world.get(id, Harvester, "y")) &&
          world.get(id, Harvester, "arrivalTick") <= context.kernel.tick &&
          world.get(id, Harvester, "retryAt") <= context.kernel.tick + RETRY_TICKS &&
          world.get(id, Harvester, "avoidUntil") <= context.kernel.tick + AVOID_TICKS,
        `harvester ${id} has an invalid destination or deadline`,
      );
      for (const field of ["cell", "avoidCell"] as const) {
        const cell = world.get(id, Harvester, field);
        check(
          cell === 0xffffffff || cell < setup.map.terrain.width * setup.map.terrain.height,
          `harvester ${id} has an invalid field cell`,
        );
      }
      // Dock/avoidDock references can retire after economy; their owners clear them next tick.
      for (const field of ["dock", "avoidDock"] as const) {
        const dock = world.get(id, Harvester, field);
        check(dock === 0 || world.wasAllocated(dock), `harvester ${id} names a future dock`);
      }
    }
  };
}
