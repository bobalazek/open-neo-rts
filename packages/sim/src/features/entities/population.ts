import type { Kernel } from "../../kernel";
import { type Definition, Health, OwnerForce, Template } from ".";

/** Living cargo counts too; an actor without authored population fails closed. */
export function populationFits(
  kernel: Kernel,
  definitions: readonly Definition[],
  force: number,
  unit: Definition,
  cap: number,
): boolean {
  if (unit.pop === undefined) return false;
  let population = 0;
  const { world } = kernel;
  for (const id of world.query(Template, OwnerForce, Health)) {
    const definition = definitions[world.get(id, Template, "definition")];
    if (
      definition?.id.split(":")[0]?.split(".").at(-1) === "unit" &&
      world.get(id, Health, "current") > 0 &&
      world.get(id, OwnerForce, "force") === force
    ) {
      if (definition.pop === undefined) return false;
      population += definition.pop;
      if (population > cap) return false;
    }
  }
  return population + unit.pop <= cap;
}
