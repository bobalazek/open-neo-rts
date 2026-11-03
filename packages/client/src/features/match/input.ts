import { changeSelection } from "./selection";

const DRAG_THRESHOLD = 5;

/** Canvas input owns pointer capture; UI controls never enter this event path. */
export function bindSelectionInput(
  canvas: HTMLCanvasElement,
  options: {
    enabled: (event?: PointerEvent) => boolean;
    selected: () => readonly string[];
    select: (handles: readonly string[]) => void;
    pick: (x: number, y: number) => string | null;
    inRectangle: (left: number, top: number, right: number, bottom: number) => string[];
    rectangle?: (rect: { x: number; y: number; width: number; height: number } | null) => void;
  },
  signal: AbortSignal,
) {
  const rectangle = document.createElement("div");
  rectangle.className = "selection-box";
  rectangle.hidden = true;
  document.body.append(rectangle);
  let drag: { id: number; x: number; y: number } | undefined;
  function cancel() {
    const captured = drag;
    drag = undefined;
    rectangle.hidden = true;
    options.rectangle?.(null);
    if (captured && canvas.hasPointerCapture(captured.id))
      canvas.releasePointerCapture(captured.id);
    return captured !== undefined;
  }
  function region(x: number, y: number) {
    const bounds = canvas.getBoundingClientRect();
    const startX = Math.max(0, Math.min(bounds.width, (drag?.x ?? x) - bounds.left));
    const startY = Math.max(0, Math.min(bounds.height, (drag?.y ?? y) - bounds.top));
    const endX = Math.max(0, Math.min(bounds.width, x - bounds.left));
    const endY = Math.max(0, Math.min(bounds.height, y - bounds.top));
    return {
      bounds,
      left: Math.min(startX, endX),
      top: Math.min(startY, endY),
      right: Math.max(startX, endX),
      bottom: Math.max(startY, endY),
    };
  }
  canvas.addEventListener(
    "pointerdown",
    (event) => {
      if (event.button !== 0 || !options.enabled(event)) return;
      event.preventDefault();
      canvas.focus({ preventScroll: true });
      drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
      canvas.setPointerCapture(event.pointerId);
    },
    { signal },
  );
  canvas.addEventListener(
    "pointermove",
    (event) => {
      if (!drag || drag.id !== event.pointerId) return;
      const { bounds, left, top, right, bottom } = region(event.clientX, event.clientY);
      rectangle.hidden =
        Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < DRAG_THRESHOLD;
      if (options.rectangle) {
        options.rectangle(
          rectangle.hidden
            ? null
            : {
                x: bounds.left + left,
                y: bounds.top + top,
                width: right - left,
                height: bottom - top,
              },
        );
        rectangle.hidden = true;
        return;
      }
      Object.assign(rectangle.style, {
        left: `${bounds.left + left}px`,
        top: `${bounds.top + top}px`,
        width: `${right - left}px`,
        height: `${bottom - top}px`,
      });
    },
    { signal },
  );
  canvas.addEventListener(
    "pointerup",
    (event) => {
      if (!drag || drag.id !== event.pointerId) return;
      const { bounds, left, top, right, bottom } = region(event.clientX, event.clientY);
      const isBox = Math.hypot(event.clientX - drag.x, event.clientY - drag.y) >= DRAG_THRESHOLD;
      if (
        options.enabled(event) &&
        event.clientX >= bounds.left &&
        event.clientX <= bounds.right &&
        event.clientY >= bounds.top &&
        event.clientY <= bounds.bottom
      ) {
        const picked = isBox
          ? options.inRectangle(left, top, right, bottom)
          : [options.pick(event.clientX - bounds.left, event.clientY - bounds.top)].filter(
              (handle): handle is string => handle !== null,
            );
        options.select(changeSelection(options.selected(), picked, event));
      }
      cancel();
    },
    { signal },
  );
  canvas.addEventListener("pointercancel", cancel, { signal });
  canvas.addEventListener("lostpointercapture", cancel, { signal });
  window.addEventListener("blur", cancel, { signal });
  signal.addEventListener(
    "abort",
    () => {
      cancel();
      rectangle.remove();
    },
    { once: true },
  );
  return { cancel };
}
