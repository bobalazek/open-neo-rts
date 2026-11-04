import type { createOrderWaypoints, OrderWaypoint } from "@open-neo-rts/render";

/** Move copied pending markers; only the existing HUD command path can change a queue. */
export function bindWaypointInput(
  canvas: HTMLCanvasElement,
  options: {
    waypoints: ReturnType<typeof createOrderWaypoints>;
    enabled(): boolean;
    blocksPointer(x: number, y: number): boolean;
    pickCell(x: number, y: number): { x: number; y: number } | null;
    commit(marker: OrderWaypoint, cell?: { x: number; y: number }): Promise<void>;
    fail(error: unknown): void;
  },
  signal: AbortSignal,
) {
  const previous = canvas.style.cursor;
  let pointer: { x: number; y: number } | undefined;
  let drag:
    | { id: number; button: number; x: number; y: number; moved: boolean; marker: OrderWaypoint }
    | undefined;
  let canceledRight: number | undefined;
  let committing = false;
  let styled = false;
  function restoreStyle() {
    if (!styled) return;
    styled = false;
    canvas.style.cursor = previous;
  }
  function available(x: number, y: number) {
    const bounds = canvas.getBoundingClientRect();
    return (
      options.enabled() &&
      !options.blocksPointer(x, y) &&
      x >= bounds.left &&
      y >= bounds.top &&
      x < bounds.right &&
      y < bounds.bottom
    );
  }
  function pick(x: number, y: number) {
    if (!available(x, y)) return;
    const bounds = canvas.getBoundingClientRect();
    return options.waypoints.pick(x - bounds.left, y - bounds.top);
  }
  function clear() {
    const captured = drag;
    drag = undefined;
    pointer = undefined;
    if (captured?.button === 2) canceledRight = captured.id;
    options.waypoints.preview();
    options.waypoints.focus();
    restoreStyle();
    if (captured?.button === 0 && canvas.hasPointerCapture(captured.id))
      canvas.releasePointerCapture(captured.id);
  }
  function consume(event: PointerEvent) {
    event.preventDefault();
    if (event.button === 0 || drag?.button === 0) event.stopImmediatePropagation();
  }
  canvas.addEventListener(
    "pointerdown",
    (event) => {
      if (event.button === 2) canceledRight = undefined;
      if (
        committing ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        (event.button !== 0 && event.button !== 2)
      )
        return;
      const marker = pick(event.clientX, event.clientY);
      if (!marker || (event.button === 0 && !marker.editable)) return;
      pointer = { x: event.clientX, y: event.clientY };
      drag = {
        id: event.pointerId,
        button: event.button,
        x: event.clientX,
        y: event.clientY,
        moved: false,
        marker,
      };
      if (event.button === 0) {
        consume(event);
        canvas.focus({ preventScroll: true });
        canvas.setPointerCapture(event.pointerId);
        styled = true;
        canvas.style.cursor = "grabbing";
      }
    },
    { signal, capture: true },
  );
  canvas.addEventListener(
    "pointermove",
    (event) => {
      pointer = { x: event.clientX, y: event.clientY };
      if (!drag || drag.id !== event.pointerId) return;
      if (!options.enabled() || !options.waypoints.marker(drag.marker.handle)) {
        clear();
        return;
      }
      drag.moved ||= Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 5;
      if (drag.button !== 0) return;
      consume(event);
      const cell = available(event.clientX, event.clientY)
        ? options.pickCell(event.clientX, event.clientY)
        : null;
      if (cell && drag.moved)
        options.waypoints.preview({
          handle: drag.marker.handle,
          x: cell.x * 1024 + (drag.marker.grid ? 0 : 512),
          y: cell.y * 1024 + (drag.marker.grid ? 0 : 512),
        });
      canvas.style.cursor = cell ? "grabbing" : "not-allowed";
    },
    { signal, capture: true },
  );
  canvas.addEventListener(
    "pointerup",
    (event) => {
      if (event.button === 2 && canceledRight === event.pointerId) {
        canceledRight = undefined;
        event.preventDefault();
        return;
      }
      const down = drag;
      if (!down || down.id !== event.pointerId || down.button !== event.button) return;
      if (down.button === 0) consume(event);
      drag = undefined;
      if (down.button === 0 && canvas.hasPointerCapture(down.id))
        canvas.releasePointerCapture(down.id);
      const valid =
        available(event.clientX, event.clientY) && options.waypoints.marker(down.marker.handle);
      const moved = down.moved || Math.hypot(event.clientX - down.x, event.clientY - down.y) > 5;
      const cell =
        valid && down.button === 0 && moved ? options.pickCell(event.clientX, event.clientY) : null;
      if (!valid || (down.button === 0 && !cell) || (down.button === 2 && moved)) {
        clear();
        return;
      }
      if (down.button === 2) event.preventDefault();
      committing = true;
      void options
        .commit(down.marker, cell ?? undefined)
        .catch(options.fail)
        .finally(() => {
          committing = false;
          if (!signal.aborted) {
            const at = pointer;
            clear();
            pointer = at;
          }
        });
    },
    { signal, capture: true },
  );
  canvas.addEventListener(
    "pointerleave",
    () => {
      if (!drag && !committing) clear();
    },
    { signal },
  );
  canvas.addEventListener("pointercancel", clear, { signal });
  canvas.addEventListener(
    "lostpointercapture",
    () => {
      if (drag?.button === 0) clear();
    },
    { signal },
  );
  window.addEventListener("blur", clear, { signal });
  window.addEventListener(
    "keydown",
    (event) => {
      if (event.code !== "Escape" || !drag) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      clear();
    },
    { signal, capture: true },
  );
  signal.addEventListener("abort", clear, { once: true });
  return {
    frame() {
      if (committing) return;
      if (!options.enabled() || (drag && !options.waypoints.marker(drag.marker.handle))) {
        clear();
        return;
      }
      if (drag) {
        options.waypoints.focus(drag.marker.handle);
        return;
      }
      const marker = pointer && pick(pointer.x, pointer.y);
      options.waypoints.focus(marker?.handle);
      if (marker) {
        styled = true;
        canvas.style.cursor = marker.editable ? "grab" : previous;
      } else restoreStyle();
    },
  };
}
