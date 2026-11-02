import { defineComponent } from "../../ecs";
import { type Kernel, register } from "../../kernel";
import { resourceNodeOrigin } from "../../match-map";
import { ConstructionSite } from "../construction";
import { type Definition, OwnerForce, Template, Transform } from "../entities";

/** Independent deposit lifetime: deleting/rebuilding an extractor never recreates this row. */
export const ResourceNode = defineComponent("ResourceNode", { index: "u32", remaining: "i32" });
/** Work is in 1/20,000 stock units (20 ticks/second × 1,000 power multiplier). */
export const Extraction = defineComponent("Extraction", { node: "u32", progress: "u16" });
export const EXTRACTION_STATUSES = [
  "active",
  "brownout",
  "disabled",
  "constructing",
  "depleted",
  "claimed",
  "invalid_node",
  "blocked",
] as const;
export interface ExtractionSnapshot {
  readonly kind: "materials" | "oil" | null;
  readonly remaining: number | null;
  readonly status: (typeof EXTRACTION_STATUSES)[number];
}
export interface ForceExtraction {
  attach(entity: number, definition: Definition): void;
  snapshot(entity: number): ExtractionSnapshot | undefined;
}

const WORK = 20 * 1000;

/** Immutable inputs only in closures; node amounts, bindings and fractional work all live in ECS. */
export function initializeExtraction(
  kernel: Kernel,
  definitions: readonly Definition[],
): ForceExtraction {
  if (kernel.extraction) throw new Error("Extraction is already initialized");
  const { world } = kernel;
  register(kernel, { components: [ResourceNode, Extraction, ConstructionSite] });
  for (const [index, resource] of (kernel.map?.resources ?? []).entries()) {
    if (resource.kind === "ore") continue;
    const node = world.create();
    world.add(node, ResourceNode, { index, remaining: resource.amount ?? -1 });
  }
  const binding = (entity: number) => {
    if (
      !world.isAlive(entity) ||
      !world.has(entity, Extraction) ||
      !world.has(entity, Template) ||
      !world.has(entity, Transform) ||
      !world.has(entity, OwnerForce)
    )
      return;
    const definition = definitions[world.get(entity, Template, "definition")];
    const node = world.get(entity, Extraction, "node");
    if (!definition?.extraction || !world.isAlive(node) || !world.has(node, ResourceNode)) return;
    const index = world.get(node, ResourceNode, "index");
    const resource = kernel.map?.resources?.[index];
    if (!resource || resource.kind === "ore" || !definition.nodeKinds?.includes(resource.kind))
      return;
    const output = definition.extraction[resource.kind];
    const origin = resourceNodeOrigin(resource);
    const remaining = world.get(node, ResourceNode, "remaining");
    if (
      !output ||
      world.get(entity, Transform, "x") !== origin.x * 1024 ||
      world.get(entity, Transform, "y") !== origin.y * 1024 ||
      (resource.amount === undefined
        ? remaining !== -1
        : remaining < 0 || remaining > resource.amount) ||
      world.get(entity, Extraction, "progress") >= WORK ||
      world
        .query(ResourceNode)
        .some((other) => other !== node && world.get(other, ResourceNode, "index") === index)
    )
      return;
    return { node, resource, output, remaining };
  };
  const snapshot = (entity: number): ExtractionSnapshot | undefined => {
    if (!world.isAlive(entity) || !world.has(entity, Extraction)) return;
    const bound = binding(entity);
    if (!bound) return { kind: null, remaining: null, status: "invalid_node" };
    let status: ExtractionSnapshot["status"];
    if (
      world.query(Extraction).some((other) => other < entity && binding(other)?.node === bound.node)
    )
      status = "claimed";
    else if (world.has(entity, ConstructionSite)) status = "constructing";
    else if (bound.remaining === 0) status = "depleted";
    else {
      const rate = kernel.power?.productionPerMille(entity) ?? 0;
      const bank = kernel.economy?.balance(world.get(entity, OwnerForce, "force"));
      const progress =
        world.get(entity, Extraction, "progress") + bound.output.amountPerSecond * rate;
      const amount = Math.min(
        Math.floor(progress / WORK),
        bound.remaining < 0 ? 0x7fffffff : bound.remaining,
      );
      status =
        rate === 0
          ? "disabled"
          : !bank || bank[bound.output.resource] + amount > 0x7fffffff
            ? "blocked"
            : rate === 500
              ? "brownout"
              : "active";
    }
    return {
      kind: bound.resource.kind as "materials" | "oil",
      remaining: bound.remaining < 0 ? null : bound.remaining,
      status,
    };
  };
  const extraction: ForceExtraction = Object.freeze({
    attach(entity: number, definition: Definition): void {
      if (!definition.extraction) return;
      const node = world.query(ResourceNode).find((node) => {
        const resource = kernel.map?.resources?.[world.get(node, ResourceNode, "index")];
        if (!resource || resource.kind === "ore" || !definition.nodeKinds?.includes(resource.kind))
          return false;
        const origin = resourceNodeOrigin(resource);
        return (
          world.get(entity, Transform, "x") === origin.x * 1024 &&
          world.get(entity, Transform, "y") === origin.y * 1024
        );
      });
      world.add(entity, Extraction, { node: node ?? 0 });
    },
    snapshot,
  });
  register(kernel, {
    systems: {
      economy: [
        () => {
          for (const entity of world.query(Extraction)) {
            const status = snapshot(entity)?.status;
            if (status !== "active" && status !== "brownout") continue;
            const bound = binding(entity);
            if (!bound) continue;
            const progress =
              world.get(entity, Extraction, "progress") +
              bound.output.amountPerSecond * (kernel.power?.productionPerMille(entity) ?? 0);
            const amount = Math.min(
              Math.floor(progress / WORK),
              bound.remaining < 0 ? 0x7fffffff : bound.remaining,
            );
            if (amount > 0) {
              if (
                !kernel.economy?.gain(world.get(entity, OwnerForce, "force"), {
                  [bound.output.resource]: amount,
                }).ok
              )
                continue;
              if (bound.remaining >= 0)
                world.set(bound.node, ResourceNode, "remaining", bound.remaining - amount);
            }
            world.set(entity, Extraction, "progress", progress % WORK);
          }
        },
      ],
    },
  });
  kernel.extraction = extraction;
  for (const entity of world.query(Template, Transform)) {
    const definition = definitions[world.get(entity, Template, "definition")];
    if (definition) extraction.attach(entity, definition);
  }
  return extraction;
}
