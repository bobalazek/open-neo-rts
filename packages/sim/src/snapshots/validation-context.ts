import type { Component } from "../ecs";
import { type Definition, Health, OwnerForce, Template } from "../features/entities";
import type { Kernel } from "../kernel";
import type { MatchSetup } from "../match";

export function canonicalInvariant(condition: unknown, detail: string): asserts condition {
  if (!condition) throw new Error(`Invalid canonical state: ${detail}`);
}

/** Read-only checks against an isolated candidate, with immutable installed-row anchors captured first. */
export function canonicalValidationContext(kernel: Kernel, setup: MatchSetup) {
  const { world } = kernel;
  const registered = new Set(world.components());
  const covered = new Set<Component>();
  const forces = new Set(setup.forces.map((force) => force.index));
  const seats = new Set(setup.seats);
  const rows = (component: Component) => {
    covered.add(component);
    return registered.has(component) ? world.query(component) : [];
  };
  const has = (entity: number, component: Component) =>
    registered.has(component) && world.isAlive(entity) && world.has(entity, component);
  const definition = (index: number): Definition => {
    const found = setup.definitions[index];
    canonicalInvariant(found, `unknown definition ${index}`);
    return found;
  };
  const actor = (entity: number): Definition => {
    canonicalInvariant(
      [Template, OwnerForce, Health].every((component) => has(entity, component)),
      `entity ${entity} is not a complete actor`,
    );
    return definition(world.get(entity, Template, "definition"));
  };
  const point = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < setup.map.terrain.width * 1024 && y < setup.map.terrain.height * 1024;
  const fixed = (component: Component, fields: readonly string[]) => {
    const capture = () =>
      rows(component).map((id) => [id, ...fields.map((field) => world.get(id, component, field))]);
    const installed = JSON.stringify(capture());
    return () =>
      canonicalInvariant(
        JSON.stringify(capture()) === installed,
        `${component.name} installed row identities changed`,
      );
  };
  return {
    kernel,
    world,
    setup,
    registered,
    covered,
    forces,
    seats,
    rows,
    has,
    definition,
    actor,
    point,
    fixed,
  };
}

export type CanonicalValidation = ReturnType<typeof canonicalValidationContext>;
