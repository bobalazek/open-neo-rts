import {
  CELL_SIZE,
  createInteractionOutline,
  type createMapPresentation,
  eventVisible,
} from "@open-neo-rts/render";
import type { SeatSnapshot } from "@open-neo-rts/sim";
import type { createMatchPresentation } from ".";

/** Hover and working-target feedback uses the same permitted seat copy as the match. */
export function bindWorldInteraction(
  canvas: HTMLCanvasElement,
  scene: Parameters<typeof createInteractionOutline>[0],
  presentation: ReturnType<typeof createMatchPresentation>,
  art: ReturnType<typeof createMapPresentation>,
  options: {
    snapshot: () => SeatSnapshot | undefined;
    enabled: () => boolean;
    blocksPointer: (x: number, y: number) => boolean;
  },
  signal: AbortSignal,
) {
  const outline = createInteractionOutline(scene);
  let pointer: { x: number; y: number; clientX: number; clientY: number } | undefined;
  let hovered:
    | { handle: string }
    | { resource: NonNullable<ReturnType<typeof art.pickResource>> }
    | undefined;
  let dirty = true,
    lastPick = -Infinity;
  const clear = () => {
    pointer = undefined;
    hovered = undefined;
    dirty = true;
  };
  canvas.addEventListener(
    "pointermove",
    (event) => {
      const bounds = canvas.getBoundingClientRect();
      pointer = {
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
        clientX: event.clientX,
        clientY: event.clientY,
      };
      dirty = true;
    },
    { signal },
  );
  canvas.addEventListener("pointerleave", clear, { signal });
  window.addEventListener("blur", clear, { signal });
  return {
    frame(now: number) {
      const snapshot = options.snapshot();
      if (!snapshot || !options.enabled()) {
        hovered = undefined;
        dirty = true;
        outline.update([]);
        return;
      }
      const visible = (x: number, y: number) =>
        eventVisible(snapshot, x * 1024 + 512, y * 1024 + 512);
      const blocked = pointer && options.blocksPointer(pointer.clientX, pointer.clientY);
      if (!pointer || blocked) hovered = undefined;
      else if (dirty || now - lastPick >= 50) {
        dirty = false;
        lastPick = now;
        const entity = presentation.hoverHit(pointer.x, pointer.y);
        const resource = art.pickResource(pointer.x, pointer.y, visible);
        hovered =
          entity && (!resource || entity.distance <= resource.distance)
            ? { handle: entity.handle }
            : resource
              ? { resource }
              : undefined;
      }
      const groups: Parameters<typeof outline.update>[0][number][] = [];
      if (hovered && "handle" in hovered) {
        const handle = hovered.handle;
        if (snapshot.entities.some((entity) => entity.handle === handle))
          groups.push(presentation.hoverMeshes(handle));
      } else if (hovered && hovered.resource.cells.every((cell) => visible(cell.x, cell.y)))
        groups.push(hovered.resource.meshes);
      const selected = new Set(presentation.selection());
      for (const entity of snapshot.entities) {
        if (!selected.has(entity.handle) || !entity.harvesting?.target) continue;
        const { x, y } = entity.harvesting.target;
        groups.push(art.resourceAt(Math.floor(x / 1024), Math.floor(y / 1024), visible));
      }
      // The mask bypasses material fog; do not expose silhouettes crossing unseen cells.
      outline.update(
        groups.filter((group) =>
          group.every((mesh) => {
            mesh.computeWorldMatrix(true);
            const bounds = mesh.getBoundingInfo().boundingBox;
            for (
              let y = Math.floor(bounds.minimumWorld.z / CELL_SIZE);
              y < Math.ceil(bounds.maximumWorld.z / CELL_SIZE);
              y++
            )
              for (
                let x = Math.floor(bounds.minimumWorld.x / CELL_SIZE);
                x < Math.ceil(bounds.maximumWorld.x / CELL_SIZE);
                x++
              )
                if (!visible(x, y)) return false;
            return true;
          }),
        ),
      );
    },
    dispose() {
      outline.dispose();
    },
  };
}
