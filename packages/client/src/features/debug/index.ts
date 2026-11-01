// Asset checking is available first. Sim commands, map spawning and projection arrive with full debug mode.

import { createModelPreview } from "@open-neo-rts/render";

export async function startModelCheck(canvas: HTMLCanvasElement) {
  const controls = document.createElement("section");
  controls.className = "model-check";
  controls.setAttribute("aria-label", "Model check");
  controls.innerHTML = `
    <h1>Model check</h1>
    <div class="model-check-controls">
      <label>Model <input type="file" accept=".glb" /></label>
      <label>Team colour <input type="color" value="#d8443a" /></label>
      <label>Animation <select disabled><option value="">Rest pose</option></select></label>
      <a href="/">Terrain view</a>
    </div>
    <p role="status">Open a GLB to inspect its team colours and animation clips.</p>
    <p class="model-check-help">Drag to orbit · Scroll to zoom</p>`;
  document.body.append(controls);
  document.body.classList.add("model-check-page");
  const preview = await createModelPreview(canvas);
  canvas.setAttribute("aria-label", "3D model preview. Drag to orbit and scroll to zoom.");
  canvas.tabIndex = 0;
  const file = controls.querySelector<HTMLInputElement>('input[type="file"]');
  const color = controls.querySelector<HTMLInputElement>('input[type="color"]');
  const clips = controls.querySelector("select");
  const status = controls.querySelector('[role="status"]');
  if (!file || !color || !clips || !status) throw new Error("Model check controls missing");
  let request = 0;
  file.addEventListener("change", async () => {
    const selected = file.files?.[0];
    if (!selected) return;
    const ticket = ++request;
    status.textContent = `Loading ${selected.name}…`;
    clips.disabled = true;
    try {
      const bytes = new Uint8Array(await selected.arrayBuffer());
      if (ticket !== request) return;
      const names = await preview.load(bytes, color.value);
      if (ticket !== request || !names) return;
      preview.setTeamColor(color.value);
      clips.replaceChildren(
        new Option("Rest pose", ""),
        ...names.map((name) => new Option(name, name)),
      );
      clips.disabled = names.length === 0;
      status.textContent = `${selected.name} · ${names.length} animation clips`;
      status.classList.remove("model-check-error");
    } catch {
      if (ticket !== request) return;
      status.textContent = `Could not open ${selected.name}. Choose a valid GLB.`;
      status.classList.add("model-check-error");
      clips.disabled = clips.options.length <= 1;
    }
  });
  color.addEventListener("input", () => preview.setTeamColor(color.value));
  clips.addEventListener("change", () => preview.play(clips.value));
  return {
    dispose() {
      request++;
      controls.remove();
      document.body.classList.remove("model-check-page");
      preview.dispose();
    },
  };
}
