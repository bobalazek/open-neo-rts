type Order = "unit.move" | "unit.stop" | "unit.attackMove";

/** Orders leave the UI as handles; the worker resolves and checks their grants. */
export function bindOrderInput(
  canvas: HTMLCanvasElement,
  panel: HTMLElement,
  options: {
    ready: () => boolean;
    selectMode: () => void;
    pickCell: (x: number, y: number) => { x: number; y: number } | null;
    order: (type: Order, cell?: { x: number; y: number }) => Promise<string>;
  },
  signal: AbortSignal,
) {
  const section = document.createElement("fieldset");
  section.innerHTML = `<legend>Selected unit orders</legend><div class="model-check-controls"><button type="button" name="attack-move">Attack-move (A)</button><button type="button" name="stop">Stop (S)</button></div><p role="status" aria-label="Order mode">Right-click to move. Right-drag pans. A, then left-click to attack-move. No combat yet.</p>`;
  panel.append(section);
  const attack = section.querySelector<HTMLButtonElement>('[name="attack-move"]');
  const stop = section.querySelector<HTMLButtonElement>('[name="stop"]');
  const status = section.querySelector<HTMLElement>("p");
  if (!attack || !stop || !status) throw new Error("Order controls missing");
  let targeting = false;
  let right: { id: number; x: number; y: number; dragged: boolean } | undefined;
  function cancel() {
    targeting = false;
    right = undefined;
    attack?.setAttribute("aria-pressed", "false");
    if (status)
      status.textContent =
        "Right-click to move. Right-drag pans. A, then left-click to attack-move. No combat yet.";
  }
  function arm() {
    if (!options.ready()) return;
    options.selectMode();
    targeting = !targeting;
    attack?.setAttribute("aria-pressed", String(targeting));
    if (status)
      status.textContent = targeting
        ? "Attack-move: left-click a destination. Esc cancels."
        : "Right-click to move.";
    canvas.focus({ preventScroll: true });
  }
  async function issue(type: Order, cell?: { x: number; y: number }) {
    const result = await options.order(type, cell);
    if (!signal.aborted && status) status.textContent = `${type}: ${result}`;
  }
  function destination(type: "unit.move" | "unit.attackMove", x: number, y: number) {
    if (!options.ready()) return;
    const cell = options.pickCell(x, y);
    if (!cell) {
      if (status) status.textContent = "Choose a destination inside the map.";
      return;
    }
    cancel();
    void issue(type, cell);
  }
  attack.setAttribute("aria-pressed", "false");
  attack.addEventListener("click", arm, { signal });
  stop.addEventListener(
    "click",
    () => {
      cancel();
      if (options.ready()) void issue("unit.stop");
    },
    { signal },
  );
  canvas.addEventListener(
    "keydown",
    (event) => {
      if (event.ctrlKey || event.metaKey || event.altKey || event.repeat) return;
      if (event.code === "KeyA") {
        event.preventDefault();
        arm();
      } else if (event.code === "KeyS") {
        event.preventDefault();
        cancel();
        if (options.ready()) void issue("unit.stop");
      } else if (event.code === "Escape" && targeting) {
        event.preventDefault();
        event.stopImmediatePropagation();
        cancel();
      }
    },
    { signal },
  );
  canvas.addEventListener(
    "click",
    (event) => {
      if (event.button === 0 && targeting)
        destination("unit.attackMove", event.clientX, event.clientY);
    },
    { signal },
  );
  canvas.addEventListener(
    "pointerdown",
    (event) => {
      if (event.button !== 2) return;
      right = { id: event.pointerId, x: event.clientX, y: event.clientY, dragged: false };
      canvas.focus({ preventScroll: true });
    },
    { signal },
  );
  canvas.addEventListener(
    "pointermove",
    (event) => {
      if (
        right?.id === event.pointerId &&
        Math.hypot(event.clientX - right.x, event.clientY - right.y) > 5
      )
        right.dragged = true;
    },
    { signal },
  );
  canvas.addEventListener(
    "pointerup",
    (event) => {
      const down = right;
      right = undefined;
      if (
        !down ||
        down.id !== event.pointerId ||
        down.dragged ||
        event.button !== 2 ||
        Math.hypot(event.clientX - down.x, event.clientY - down.y) > 5
      )
        return;
      const bounds = canvas.getBoundingClientRect();
      if (
        event.clientX < bounds.left ||
        event.clientX > bounds.right ||
        event.clientY < bounds.top ||
        event.clientY > bounds.bottom
      )
        return;
      destination("unit.move", event.clientX, event.clientY);
    },
    { signal },
  );
  canvas.addEventListener("pointercancel", cancel, { signal });
  window.addEventListener("blur", cancel, { signal });
  signal.addEventListener(
    "abort",
    () => {
      cancel();
      section.remove();
    },
    { once: true },
  );
  return { targeting: () => targeting, cancel };
}
