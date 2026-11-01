// Authoritative runtime imports stay inside the worker, never its main-thread lifecycle module.
import { WATER_PASSABLE } from "@open-neo-rts/content";
import {
  compileNavigation,
  type DebugOverlayData,
  type DebugOverlayOptions,
  type Definition,
  type Kernel,
  type SeatSnapshot,
  Template,
  Transform,
} from "@open-neo-rts/sim";

export function isOverlayOptions(value: unknown): value is DebugOverlayOptions {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const options = value as Record<string, unknown>;
  return (
    Object.keys(options).length === 3 &&
    typeof options.terrain === "boolean" &&
    typeof options.paths === "boolean" &&
    (options.navigation === null ||
      (typeof options.navigation === "string" && Object.hasOwn(WATER_PASSABLE, options.navigation)))
  );
}

/** Cache large immutable packets; only opt-in path points are copied on each published tick. */
export function createDebugDiagnostics(
  kernel: Kernel,
  definitions: readonly Definition[],
  resolve: (handle: unknown) => number | undefined,
) {
  let options: DebugOverlayOptions = { terrain: false, navigation: null, paths: false };
  let terrainSent = false;
  let navSignature = "";
  let revision = 0;
  return {
    configure(next: DebugOverlayOptions) {
      if (options.navigation !== next.navigation) navSignature = "";
      options = { ...next };
    },
    copy(snapshot: SeatSnapshot): DebugOverlayData | undefined {
      if (!options.terrain && !options.navigation && !options.paths) return undefined;
      const data: DebugOverlayData = { tick: snapshot.tick };
      if (options.terrain && !terrainSent) {
        data.terrain = kernel.map?.terrain;
        terrainSent = true;
      }
      if (options.navigation && kernel.map) {
        const objects = kernel.world.query(Template, Transform).flatMap((entity) => {
          const definition = definitions[kernel.world.get(entity, Template, "definition")];
          const kind = definition?.id.split(":")[0]?.split(".").at(-1);
          if (
            !definition ||
            kind === "unit" ||
            (kind === "prop" && definition.blocks === "nothing")
          )
            return [];
          return [
            {
              definition: definition.id,
              position: [
                kernel.world.get(entity, Transform, "x"),
                kernel.world.get(entity, Transform, "y"),
              ] as const,
              rotation: (((kernel.world.get(entity, Transform, "facing") >>> 14) + 3) & 3) * 90,
              owner: "neutral",
            },
          ];
        });
        const signature = JSON.stringify([options.navigation, objects]);
        if (signature !== navSignature) {
          const grid = compileNavigation(
            kernel.map,
            definitions,
            { domain: options.navigation, radiusSubcells: 0 },
            objects,
          );
          data.navigation = {
            revision: ++revision,
            domain: grid.domain,
            radiusSubcells: 0,
            width: grid.width,
            height: grid.height,
            cost: [...grid.cost],
            connections: [...grid.connections],
            speedPercent: [...grid.speedPercent],
          };
          navSignature = signature;
        }
      }
      if (options.paths) {
        const byId = new Map(snapshot.entities.map((entity) => [resolve(entity.handle), entity]));
        data.paths =
          kernel.movement?.debugPaths().flatMap((route) => {
            const entity = byId.get(route.entity);
            return entity
              ? [
                  {
                    handle: entity.handle,
                    points: [{ x: entity.x, y: entity.y }, ...route.path],
                    target: route.target,
                    searching: route.searching,
                  },
                ]
              : [];
          }) ?? [];
      }
      return data;
    },
  };
}
