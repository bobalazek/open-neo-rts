import type { PresentedEntity } from "@open-neo-rts/sim";
import type { createOfflineMatch, OfflineState } from "../../worker";
import type { CatalogEntry } from "./catalog";

/** Only copied worker values and opaque handles cross this panel. */
export function createInspector(
  panel: HTMLElement,
  catalog: readonly CatalogEntry[],
  signal: AbortSignal,
  onSelection: (handles: readonly string[]) => void,
) {
  const section = document.createElement("fieldset");
  section.innerHTML = `<legend>Simulation and inspector</legend>
    <div class="model-check-controls">
      <button type="button" name="pause">Run</button>
      <button type="button" name="step">Step one tick</button>
      <label>Speed <select name="speed" aria-label="Speed">${[0.25, 0.5, 1, 2, 4, 8].map((speed) => `<option value="${speed}"${speed === 1 ? " selected" : ""}>×${speed}</option>`).join("")}</select></label>
      <output aria-label="Simulation time">Waiting for worker</output>
    </div>
    <label>Inspect entity <select name="entity" aria-label="Inspect entity"></select></label>
    <output aria-label="Selection count">0 selected</output>
    <pre aria-label="Integer components">No entity selected.</pre>
    <div class="model-check-controls">
      <label>Health <input name="health" type="text" inputmode="numeric" /></label>
      <button type="button" name="set-health">Set health</button>
      <button type="button" name="kill">Kill</button>
      <button type="button" name="remove">Remove</button>
    </div>
    <p>Health 0 removes a destructible entity in the current sim; wreck gameplay is not implemented. Indestructible props have 0/0 health.</p>
    <p role="status" aria-label="Inspector result">No edit submitted.</p>`;
  panel.append(section);
  const required = <T extends Element>(selector: string) => {
    const element = section.querySelector<T>(selector);
    if (!element) throw new Error(`Inspector control missing: ${selector}`);
    return element;
  };
  const pause = required<HTMLButtonElement>('[name="pause"]');
  const step = required<HTMLButtonElement>('[name="step"]');
  const speed = required<HTMLSelectElement>('[name="speed"]');
  const time = required<HTMLOutputElement>("output");
  const picker = required<HTMLSelectElement>('[name="entity"]');
  const components = required<HTMLElement>("pre");
  const count = required<HTMLOutputElement>('[aria-label="Selection count"]');
  const health = required<HTMLInputElement>('[name="health"]');
  const setHealth = required<HTMLButtonElement>('[name="set-health"]');
  const kill = required<HTMLButtonElement>('[name="kill"]');
  const remove = required<HTMLButtonElement>('[name="remove"]');
  const result = required<HTMLElement>('[aria-label="Inspector result"]');
  let match: ReturnType<typeof createOfflineMatch> | undefined;
  let state: OfflineState | undefined;
  let selected: string[] = [];
  let pending = false;
  let healthFor = "";
  const inspected = () => state?.snapshot.entities.find(({ handle }) => handle === selected[0]);
  function draw() {
    section.disabled = !match || !state || pending;
    const pauseLabel = state?.paused ? "Run" : "Pause";
    // Replacing a pressed button's text between pointer down/up can cancel WebKit's click.
    if (pause.textContent !== pauseLabel) pause.textContent = pauseLabel;
    step.disabled = !state?.paused;
    if (state) {
      speed.value = String(state.speed);
      time.textContent = `Tick ${state.snapshot.tick} · ${state.paused ? "Paused" : "Running"} · ×${state.speed} · Hash ${state.hash ?? "unavailable"}`;
    }
    const entity = inspected();
    count.textContent = `${selected.length} selected`;
    picker.value = entity?.handle ?? "";
    components.textContent = entity
      ? `${catalog.find((entry) => entry.definition.id === entity.definition)?.name ?? entity.definition}\nHandle ${entity.handle} · Force ${entity.force + 1}\n${JSON.stringify(entity, null, 2)}`
      : "No entity selected.";
    if ((entity?.handle ?? "") !== healthFor) {
      health.value = entity ? String(entity.health) : "";
      healthFor = entity?.handle ?? "";
    }
    health.disabled = setHealth.disabled = kill.disabled = !entity || entity.maxHealth === 0;
    remove.disabled = !entity;
  }
  function select(handles: readonly string[]) {
    const visible = new Set(state?.snapshot.entities.map(({ handle }) => handle));
    selected = [...new Set(handles)].filter((handle) => visible.has(handle));
    draw();
    onSelection(selected);
  }
  async function act(
    operation: (active: NonNullable<typeof match>, acknowledged: OfflineState) => Promise<unknown>,
  ) {
    if (!match || !state || pending) return;
    const active = match;
    const acknowledged = state;
    pending = true;
    draw();
    try {
      const outcome = await operation(active, acknowledged);
      if (match === active)
        result.textContent = outcome === undefined ? "Control acknowledged." : String(outcome);
    } catch (error) {
      if (match === active)
        result.textContent = error instanceof Error ? error.message : "Control failed";
    } finally {
      if (match === active) {
        pending = false;
        draw();
      }
    }
  }
  function edit(type: string, payload: (entity: PresentedEntity) => unknown) {
    const entity = inspected();
    if (!entity || !state) return;
    const paused = state.paused;
    void act(async (active) => {
      const command = active.command(type, payload(entity));
      if (paused) await active.step();
      return command;
    });
  }
  pause.addEventListener("click", () => void act((active) => active.pause(!state?.paused)), {
    signal,
  });
  step.addEventListener("click", () => void act((active) => active.step()), { signal });
  speed.addEventListener(
    "change",
    () => {
      const requested = Number(speed.value);
      void act((active) => active.speed(requested));
    },
    { signal },
  );
  picker.addEventListener("change", () => select(picker.value ? [picker.value] : []), { signal });
  setHealth.addEventListener(
    "click",
    () => {
      const entity = inspected();
      if (
        !entity ||
        !/^(0|[1-9][0-9]*)$/.test(health.value) ||
        !Number.isSafeInteger(Number(health.value)) ||
        Number(health.value) > entity.maxHealth
      ) {
        result.textContent = `Health must be an integer from 0 to ${entity?.maxHealth ?? 0}.`;
        return;
      }
      edit("debug.setHealth", (entity) => ({
        entity: entity.handle,
        health: Number(health.value),
      }));
    },
    { signal },
  );
  kill.addEventListener(
    "click",
    () => edit("debug.setHealth", (entity) => ({ entity: entity.handle, health: 0 })),
    { signal },
  );
  remove.addEventListener(
    "click",
    () => edit("debug.remove", (entity) => ({ entity: entity.handle })),
    { signal },
  );
  draw();
  return {
    perform: act,
    busy: () => pending,
    select,
    selected: () => [...selected],
    bind(active?: typeof match) {
      match = active;
      state = undefined;
      pending = false;
      healthFor = "";
      time.textContent = "Waiting for worker";
      picker.replaceChildren(new Option("No selection", ""));
      result.textContent = "No edit submitted.";
      select([]);
    },
    update(next: OfflineState) {
      state = next;
      const handles = next.snapshot.entities.map(({ handle }) => handle);
      if (
        picker.options.length !== handles.length + 1 ||
        handles.some((handle, index) => picker.options[index + 1]?.value !== handle)
      )
        picker.replaceChildren(
          new Option("No selection", ""),
          ...next.snapshot.entities.map(
            (entity) =>
              new Option(
                `${entity.handle} · ${catalog.find((entry) => entry.definition.id === entity.definition)?.name ?? entity.definition} · Force ${entity.force + 1}`,
                entity.handle,
              ),
          ),
        );
      select(selected);
    },
  };
}
