import { Color3, type LinesMesh, MeshBuilder, type Scene, Vector3 } from "@babylonjs/core";
import type { TerrainGrid } from "@open-neo-rts/content";
import type { SeatSnapshot } from "@open-neo-rts/sim";
import { CELL_SIZE, terrainHeight, waterHeight } from "../terrain";

/** One batched overlay, built only from selected actors' already-permitted order copies. */
export function createOrderWaypoints(scene: Scene, terrain: TerrainGrid) {
  let mesh: LinesMesh | undefined,
    key = "";
  const clear = () => {
    mesh?.dispose(false, true);
    mesh = undefined;
  };
  return {
    accept(snapshot: SeatSnapshot | undefined, selection: readonly string[]) {
      const targets = new Map<string, { x: number; y: number }>(
        snapshot?.entities.map((entity) => [entity.handle, entity]) ?? [],
      );
      for (const remains of snapshot?.remains ?? []) targets.set(remains.handle, remains);
      const paths =
        snapshot?.mode === "controlled"
          ? snapshot.entities
              .filter((entity) => selection.includes(entity.handle))
              .flatMap((entity) => {
                const points = [{ x: entity.x, y: entity.y }];
                const active =
                  entity.order ??
                  (entity.attackTarget ? targets.get(entity.attackTarget) : undefined);
                if (active) points.push({ x: active.x, y: active.y });
                for (const order of entity.queuedOrders ?? []) {
                  const point =
                    order.x !== undefined && order.y !== undefined
                      ? { x: order.x, y: order.y }
                      : order.target
                        ? targets.get(order.target)
                        : undefined;
                  if (point) points.push({ x: point.x, y: point.y });
                }
                return points.length > 1 ? [points] : [];
              })
          : [];
      const next = JSON.stringify(paths);
      if (next === key) return;
      key = next;
      clear();
      if (!paths.length) return;
      const position = ({ x, y }: { x: number; y: number }) => {
        const cx = x / 1024,
          cy = y / 1024;
        return new Vector3(
          cx * CELL_SIZE,
          Math.max(terrainHeight(terrain, cx, cy), waterHeight(terrain, cx, cy)) + 0.2,
          cy * CELL_SIZE,
        );
      };
      const lines = paths.map((path) => path.map(position));
      for (const path of paths)
        for (const point of path.slice(1)) {
          const at = position(point),
            size = CELL_SIZE * 0.15;
          lines.push([at.add(new Vector3(-size, 0, 0)), at.add(new Vector3(size, 0, 0))]);
          lines.push([at.add(new Vector3(0, 0, -size)), at.add(new Vector3(0, 0, size))]);
        }
      mesh = MeshBuilder.CreateLineSystem("selected order waypoints", { lines }, scene);
      mesh.color = new Color3(0.25, 0.85, 1);
      mesh.isPickable = false;
      mesh.renderingGroupId = 1;
    },
    dispose() {
      clear();
      key = "";
    },
  };
}
