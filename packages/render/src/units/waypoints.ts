import { Color3, type LinesMesh, Matrix, MeshBuilder, type Scene, Vector3 } from "@babylonjs/core";
import type { TerrainGrid } from "@open-neo-rts/content";
import type { SeatSnapshot } from "@open-neo-rts/sim";
import { CELL_SIZE, terrainHeight, waterHeight } from "../terrain";

export interface OrderWaypoint {
  handle: string;
  x: number;
  y: number;
  editable: boolean;
  grid: boolean;
}

/** One batched overlay, built only from selected actors' already-permitted order copies. */
export function createOrderWaypoints(scene: Scene, terrain: TerrainGrid) {
  let mesh: LinesMesh | undefined,
    key = "",
    topology = "";
  let latest: SeatSnapshot | undefined;
  let selected: readonly string[] = [];
  let focused: string | undefined;
  let draft: { handle: string; x: number; y: number } | undefined;
  const markers = new Map<string, OrderWaypoint>();
  const position = ({ x, y }: { x: number; y: number }) => {
    const cx = x / 1024,
      cy = y / 1024;
    return new Vector3(
      cx * CELL_SIZE,
      Math.max(terrainHeight(terrain, cx, cy), waterHeight(terrain, cx, cy)) + 0.2,
      cy * CELL_SIZE,
    );
  };
  const clear = () => {
    mesh?.dispose(false, true);
    mesh = undefined;
    topology = "";
  };
  function render(snapshot = latest, selection = selected) {
    markers.clear();
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
                const source =
                  order.x !== undefined && order.y !== undefined
                    ? { x: order.x, y: order.y }
                    : order.target
                      ? targets.get(order.target)
                      : undefined;
                if (source) {
                  const point = draft?.handle === order.handle ? draft : source;
                  markers.set(order.handle, {
                    handle: order.handle,
                    x: point.x,
                    y: point.y,
                    editable: order.x !== undefined && order.y !== undefined,
                    grid: order.type === "economy.build",
                  });
                  points.push({ x: point.x, y: point.y });
                }
              }
              return points.length > 1 ? [points] : [];
            })
        : [];
    const focus = focused ? markers.get(focused) : undefined;
    const next = JSON.stringify([paths, focus]);
    if (next === key) return;
    key = next;
    if (!paths.length) {
      clear();
      return;
    }
    const lines = paths.map((path) =>
      path.flatMap((point, index) => {
        const previous = path[index - 1];
        if (!previous) return [position(point)];
        const steps = Math.max(
          1,
          Math.ceil(Math.max(Math.abs(point.x - previous.x), Math.abs(point.y - previous.y)) / 512),
        );
        return Array.from({ length: steps }, (_, sample) => {
          const t = (sample + 1) / steps;
          return position({
            x: previous.x + (point.x - previous.x) * t,
            y: previous.y + (point.y - previous.y) * t,
          });
        });
      }),
    );
    for (const path of paths)
      for (const point of path.slice(1)) {
        const at = position(point),
          size = CELL_SIZE * 0.15;
        lines.push([at.add(new Vector3(-size, 0, 0)), at.add(new Vector3(size, 0, 0))]);
        lines.push([at.add(new Vector3(0, 0, -size)), at.add(new Vector3(0, 0, size))]);
      }
    if (focus) {
      const at = position(focus),
        size = CELL_SIZE * 0.3;
      lines.push([
        at.add(new Vector3(-size, 0, 0)),
        at.add(new Vector3(0, 0, size)),
        at.add(new Vector3(size, 0, 0)),
        at.add(new Vector3(0, 0, -size)),
        at.add(new Vector3(-size, 0, 0)),
      ]);
    }
    const shape = lines.map((line) => line.length).join(",");
    if (mesh && shape === topology) {
      MeshBuilder.CreateLineSystem("selected order waypoints", { lines, instance: mesh }, scene);
      return;
    }
    const previous = mesh;
    // Keep the compiled line material when route topology changes; moving endpoints never replace it.
    mesh = MeshBuilder.CreateLineSystem(
      "selected order waypoints",
      { lines, updatable: true, material: previous?.material ?? undefined },
      scene,
    );
    previous?.dispose(false, false, true);
    topology = shape;
    mesh.color = new Color3(0.25, 0.85, 1);
    mesh.isPickable = false;
    mesh.renderingGroupId = 1;
  }
  return {
    accept(snapshot: SeatSnapshot | undefined, selection: readonly string[]) {
      latest = snapshot;
      selected = [...selection];
      if (!snapshot) draft = focused = undefined;
      render();
    },
    focus(handle?: string) {
      if (focused === handle) return;
      focused = handle;
      render();
    },
    preview(value?: { handle: string; x: number; y: number }) {
      if (draft?.handle === value?.handle && draft?.x === value?.x && draft?.y === value?.y) return;
      draft = value;
      render();
    },
    marker(handle: string) {
      const value = markers.get(handle);
      return value ? { ...value } : undefined;
    },
    /** CSS pixels match selection picking, including hardware scaling and inset viewports. */
    pick(x: number, y: number): OrderWaypoint | undefined {
      const camera = scene.activeCamera;
      const canvas = scene.getEngine().getRenderingCanvas();
      if (!camera || !canvas) return;
      const viewport = camera.viewport.toGlobal(canvas.clientWidth, canvas.clientHeight);
      viewport.y = canvas.clientHeight - viewport.y - viewport.height;
      let nearest: OrderWaypoint | undefined,
        distance = 12 ** 2;
      for (const marker of markers.values()) {
        const point = Vector3.Project(
          position(marker),
          Matrix.IdentityReadOnly,
          scene.getTransformMatrix(),
          viewport,
        );
        const squared = (point.x - x) ** 2 + (point.y - y) ** 2;
        if (
          point.z >= 0 &&
          point.z <= 1 &&
          point.x >= viewport.x &&
          point.x <= viewport.x + viewport.width &&
          point.y >= viewport.y &&
          point.y <= viewport.y + viewport.height &&
          squared < distance
        ) {
          distance = squared;
          nearest = marker;
        }
      }
      return nearest ? { ...nearest } : undefined;
    },
    dispose() {
      clear();
      latest = undefined;
      selected = [];
      markers.clear();
      key = "";
    },
  };
}
