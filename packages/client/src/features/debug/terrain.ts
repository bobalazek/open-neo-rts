import { createRenderer } from "@open-neo-rts/render";
import { loadMap, MAPS } from "./maps";

export async function startTerrainView(canvas: HTMLCanvasElement) {
  const controls = document.createElement("section");
  controls.className = "model-check";
  controls.setAttribute("aria-label", "Terrain view");
  controls.innerHTML = `
    <div class="model-check-controls">
      <label>Map <select></select></label>
      <a href="/debug?models=1">Model check</a>
    </div>
    <p role="status">Loading map…</p>`;
  const select = controls.querySelector("select");
  const status = controls.querySelector('[role="status"]');
  if (!select || !status) throw new Error("Terrain controls missing");
  const id = new URLSearchParams(location.search).get("map") ?? "core.map:sandbox-flat";
  select.replaceChildren(
    ...MAPS.map(({ definition }) => new Option(definition.name, `core.${definition.id}`)),
  );
  if (!MAPS.some(({ definition }) => `core.${definition.id}` === id)) {
    select.add(new Option("Unknown map", id));
  }
  select.value = id;
  select.addEventListener("change", () => {
    const url = new URL(location.href);
    url.searchParams.set("map", select.value);
    location.assign(url);
  });
  document.body.classList.add("model-check-page");
  document.body.append(controls);
  canvas.setAttribute("aria-label", "Map terrain. Use arrow keys to pan and scroll to zoom.");
  canvas.tabIndex = 0;
  try {
    const { definition, grid } = await loadMap(id);
    const renderer = await createRenderer(canvas, { terrain: grid });
    status.textContent = `${definition.name} · ${grid.width} × ${grid.height} cells`;
    canvas.dataset.map = id;
    return {
      ...renderer,
      dispose() {
        controls.remove();
        document.body.classList.remove("model-check-page");
        renderer.dispose();
      },
    };
  } catch (error) {
    console.error(error);
    status.textContent = "Could not load this map. Choose another map.";
    status.setAttribute("role", "alert");
    status.classList.add("model-check-error");
    return {
      dispose() {
        controls.remove();
        document.body.classList.remove("model-check-page");
      },
    };
  }
}
