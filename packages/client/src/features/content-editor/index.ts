import { builtins } from "virtual:debug-builtins";
import { type ModelKind, SCHEMAS, validate } from "@open-neo-rts/content";
import { createModelPreview } from "@open-neo-rts/render";
import { text } from "../../shared";
import { mountNativePanel } from "../../shared/native-panel";
import { applyInterfaceScale, readDeviceSettings } from "../settings";
import { inspectModel, installedModel, MODEL_FILE_LIMIT } from "./model";

/** Model-first content tools; definition writes and draft playtests have separate owners. */
export function startContentTools(canvas: HTMLCanvasElement) {
  const priorScale = document.documentElement.style.fontSize;
  applyInterfaceScale(readDeviceSettings());
  const root = document.createElement("main");
  root.className = "content-tools";
  root.innerHTML = `<!-- THESIS: inspect original model behaviour and actual validator output before entering a match.
OWN-WORLD: inherited graphite command stations, original brick subjects, native framed controls.
STORY: find an installed asset or open a local GLB, change team/clip/LOD/health, inspect checks.
FIRST VIEWPORT: the model owns the desktop left; a scrolling native tool pane sits right, below the model when narrow.
FORM: code-led Operate extension of existing native panels and the documented model-first tool.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance -->
<canvas class="content-tools-controls" hidden></canvas><section><header><button type="button" data-back>${text("ui.common.back")}</button><h1>${text("ui.tools.title")}</h1></header><label>${text("ui.tools.search")}<input type="search" name="model-search" maxlength="96"></label><label>${text("ui.tools.definition")}<select name="definition"></select></label><button type="button" data-open>${text("ui.tools.open")}</button><input type="file" accept=".glb" hidden><p data-empty hidden>${text("ui.tools.empty")}</p><p role="status" aria-live="polite"></p><p role="alert"></p><h2 data-loaded>${text("ui.tools.no-model")}</h2><p>${text("ui.tools.orbit")}</p><label>${text("ui.tools.team")}<select name="team"><option value="#d8443a">${text("ui.tools.red")}</option><option value="#3c93d9">${text("ui.tools.blue")}</option><option value="#ddc382">${text("ui.tools.gold")}</option><option value="#5bc6b0">${text("ui.tools.teal")}</option></select></label><label>${text("ui.tools.clip")}<select name="clip" disabled><option value="">${text("ui.tools.rest")}</option></select></label><label>${text("ui.tools.lod")}<select name="lod" disabled><option value="auto">${text("ui.tools.auto")}</option><option value="0">LOD0</option><option value="1">LOD1</option></select></label><label>${text("ui.tools.health")}<select name="health" disabled>${[100, 75, 65, 32, 0].map((value) => `<option value="${value}">${value}%</option>`).join("")}</select></label><label>${text("ui.tools.kind")}<select name="kind">${(["unit", "structure", "prop", "wreck"] as const).map((kind) => `<option value="${kind}">${text(`ui.tools.${kind}`)}</option>`).join("")}</select></label><button type="button" data-retry hidden>${text("ui.common.retry")}</button><div data-model-checks></div><p>${text("ui.tools.scope")}</p></section>`;
  document.body.append(root);
  document.body.classList.add("content-tools-page");
  canvas.classList.add("content-tools-model");
  const prior = ["tabindex", "aria-label", "aria-hidden", "title"].map(
    (name) => [name, canvas.getAttribute(name)] as const,
  );
  canvas.tabIndex = 0;
  canvas.setAttribute("aria-label", text("ui.tools.orbit"));
  canvas.title = text("ui.tools.orbit");
  canvas.removeAttribute("aria-hidden");
  const events = new AbortController();
  const field = (name: string) => root.querySelector<HTMLSelectElement>(`[name="${name}"]`)!;
  const search = root.querySelector<HTMLInputElement>("[name=model-search]")!;
  const definition = field("definition"),
    team = field("team"),
    clip = field("clip"),
    lod = field("lod"),
    health = field("health"),
    kind = field("kind");
  for (const [control, label] of [
    [search, "ui.tools.search"],
    [definition, "ui.tools.definition"],
    [team, "ui.tools.team"],
    [clip, "ui.tools.clip"],
    [lod, "ui.tools.lod"],
    [health, "ui.tools.health"],
    [kind, "ui.tools.kind"],
  ] as const)
    control.setAttribute("aria-label", text(label));
  const file = root.querySelector<HTMLInputElement>('input[type="file"]')!;
  const status = root.querySelector<HTMLElement>('[role="status"]')!;
  const error = root.querySelector<HTMLElement>('[role="alert"]')!;
  const retry = root.querySelector<HTMLButtonElement>("[data-retry]")!;
  for (const button of root.querySelectorAll("[data-open],[data-retry]"))
    button.setAttribute("data-panel-footer", "");
  const openButton = root.querySelector<HTMLButtonElement>("[data-open]")!;
  openButton.title = text("ui.tools.file-help");
  openButton.setAttribute("data-contextual-help", "");
  kind.title = text("ui.tools.scope");
  kind.setAttribute("data-contextual-help", "");
  for (const help of root.querySelectorAll<HTMLElement>("p:not([role]):not([data-empty])"))
    help.hidden = true;
  const checks = root.querySelector<HTMLElement>("[data-model-checks]")!;
  checks.setAttribute("data-panel-content", "");
  const entries = builtins
    .map((entry) => {
      const raw = entry.raw as Record<string, unknown>;
      const type = String(raw.id).split(":")[0] as "unit" | "structure" | "prop";
      const issues = validate(SCHEMAS[type], raw);
      if (issues.length) throw new Error("Installed definition failed schema validation");
      return { ...entry, raw, kind: type, id: `core.${raw.id}`, name: String(raw.name) };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  let selected =
    entries.find((entry) => entry.id === "core.unit:eastern-collective/dragon-tank")?.id ??
    entries[0]?.id;
  let disposed = false,
    request = 0;
  let preview: Awaited<ReturnType<typeof createModelPreview>> | undefined;
  let creating: Promise<Awaited<ReturnType<typeof createModelPreview>>> | undefined;
  let fetching: AbortController | undefined;
  let opened:
    | { bytes: Uint8Array; name: string; kind: ModelKind; raw?: Record<string, unknown> }
    | undefined;
  let pending: (() => Promise<void>) | undefined;
  const panel = mountNativePanel(
    root,
    root.querySelector("section")!,
    root.querySelector<HTMLCanvasElement>(".content-tools-controls")!,
    { id: () => "content-tools", title: () => text("ui.tools.title"), modal: false },
  );
  function table(title: string, values: readonly string[]) {
    const details = document.createElement("details");
    const summary = document.createElement("summary");
    summary.textContent = `${title} (${values.length})`;
    details.append(summary);
    const list = document.createElement("table");
    list.createCaption().textContent = title;
    const heading = document.createElement("th");
    heading.scope = "col";
    heading.textContent = text("ui.tools.entry");
    list.createTHead().insertRow().append(heading);
    const body = list.createTBody();
    for (const value of values.slice(0, 100)) {
      body.insertRow().insertCell().textContent = value;
    }
    if (values.length > 100) {
      body.insertRow().insertCell().textContent = text("ui.tools.more-items");
    }
    const region = document.createElement("div");
    region.setAttribute("role", "region");
    region.setAttribute("aria-label", title);
    region.tabIndex = 0;
    region.append(list);
    details.append(region);
    checks.append(details);
  }
  function report(value: NonNullable<typeof opened>) {
    const info = inspectModel(value.bytes, value.kind, value.raw);
    checks.replaceChildren();
    const title = document.createElement("h2");
    title.textContent = text("ui.tools.checks");
    checks.append(title);
    const label = document.createElement("p");
    label.setAttribute("role", "status");
    label.textContent = text("ui.tools.check-summary", {
      errors: info.issues.filter((i) => i.level === "error").length,
      warnings: info.issues.filter((i) => i.level === "warning").length,
    });
    checks.append(label);
    table(
      text("ui.tools.issues"),
      info.issues.map((issue) => `${issue.level}: ${issue.message}`),
    );
    table(text("ui.tools.materials"), info.materials);
    table(text("ui.tools.nodes"), info.nodes);
    table(text("ui.tools.sockets"), info.sockets);
    return info;
  }
  function viewer() {
    creating ??= createModelPreview(canvas)
      .then((next) => {
        if (disposed) {
          next.dispose();
          throw new Error("Disposed content tools");
        }
        preview = next;
        return next;
      })
      .catch((failure) => {
        creating = undefined;
        throw failure;
      });
    return creating;
  }
  async function load(source: () => Promise<NonNullable<typeof opened>>) {
    const ticket = ++request;
    fetching?.abort();
    preview?.cancelLoad();
    clip.disabled = lod.disabled = health.disabled = true;
    status.textContent = text("ui.tools.loading");
    error.textContent = "";
    retry.hidden = true;
    panel.update();
    try {
      const candidate = await source();
      if (disposed || ticket !== request) return;
      inspectModel(candidate.bytes, candidate.kind, candidate.raw);
      const scene = await viewer();
      if (disposed || ticket !== request) return;
      const clips = await scene.load(candidate.bytes, team.value);
      if (disposed || ticket !== request || !clips) return;
      opened = candidate;
      if (!candidate.raw) {
        selected = undefined;
        definition.selectedIndex = -1;
      }
      const info = report(candidate);
      root.querySelector("[data-loaded]")!.textContent = candidate.name;
      kind.value = candidate.kind;
      kind.disabled = !!candidate.raw;
      clip.replaceChildren(
        new Option(text("ui.tools.rest"), ""),
        ...clips.map((name) => new Option(name, name)),
      );
      clip.disabled = !clips.length;
      lod.disabled = !scene.setLod(lod.value as "auto" | "0" | "1");
      health.disabled = !info.hasDamage;
      scene.setTeamColor(team.value);
      scene.setLod(lod.value as "auto" | "0" | "1");
      scene.setHealth(Number(health.value));
      canvas.dataset.model = candidate.name;
      status.textContent = text("ui.tools.loaded", { name: candidate.name, clips: clips.length });
    } catch {
      if (disposed || ticket !== request) return;
      status.textContent = opened?.name ?? "";
      error.textContent = text(opened ? "ui.tools.failed-retained" : "ui.tools.failed");
      retry.hidden = false;
      if (opened) {
        const info = inspectModel(opened.bytes, opened.kind, opened.raw);
        clip.disabled = !info.clips.length;
        lod.disabled = !preview?.setLod(lod.value as "auto" | "0" | "1");
        health.disabled = !info.hasDamage;
      }
    } finally {
      if (!disposed && ticket === request) panel.update();
    }
  }
  function choose() {
    const entry = entries.find((entry) => entry.id === selected);
    if (!entry) return;
    pending = () =>
      load(async () => {
        if (!entry.model) throw new Error("Model unavailable");
        fetching = new AbortController();
        const response = await fetch(entry.model, { signal: fetching.signal });
        if (!response.ok) throw new Error("Model request failed");
        return {
          name: entry.name,
          bytes: new Uint8Array(await response.arrayBuffer()),
          kind: entry.kind,
          raw: entry.raw,
        };
      });
    void pending();
  }
  function filter() {
    const terms = search.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const visible = entries.filter((entry) =>
      terms.every((term) => `${entry.name} ${entry.id}`.toLowerCase().includes(term)),
    );
    definition.replaceChildren(...visible.map((entry) => new Option(entry.name, entry.id)));
    definition.disabled = !visible.length;
    root.querySelector<HTMLElement>("[data-empty]")!.hidden = !!visible.length;
    if (visible.some((entry) => entry.id === selected)) definition.value = selected!;
    else {
      selected = visible[0]?.id;
      if (selected) choose();
    }
    panel.update();
  }
  function open(file: File) {
    pending = () =>
      load(async () => {
        if (!file.name.toLowerCase().endsWith(".glb") || file.size > MODEL_FILE_LIMIT)
          throw new Error("Invalid model file");
        return {
          name: file.name,
          bytes: new Uint8Array(await file.arrayBuffer()),
          kind: kind.value as ModelKind,
        };
      });
    void pending();
  }
  root.querySelector("[data-back]")!.addEventListener(
    "click",
    () => {
      location.href = "/";
    },
    { signal: events.signal },
  );
  root
    .querySelector("[data-open]")!
    .addEventListener("click", () => file.click(), { signal: events.signal });
  file.addEventListener(
    "change",
    () => {
      if (file.files?.[0]) open(file.files[0]);
      file.value = "";
    },
    { signal: events.signal },
  );
  canvas.addEventListener("dragover", (event) => event.preventDefault(), { signal: events.signal });
  canvas.addEventListener(
    "drop",
    (event) => {
      event.preventDefault();
      if (event.dataTransfer?.files[0]) open(event.dataTransfer.files[0]);
    },
    { signal: events.signal },
  );
  search.addEventListener("input", filter, { signal: events.signal });
  definition.addEventListener(
    "change",
    () => {
      selected = definition.value;
      choose();
    },
    { signal: events.signal },
  );
  for (const [control, update] of [
    [team, () => preview?.setTeamColor(team.value)],
    [clip, () => preview?.play(clip.value)],
    [lod, () => preview?.setLod(lod.value as "auto" | "0" | "1")],
    [health, () => preview?.setHealth(Number(health.value))],
  ] as const)
    control.addEventListener(
      "change",
      () => {
        update();
        panel.update();
      },
      { signal: events.signal },
    );
  kind.addEventListener(
    "change",
    () => {
      if (opened && !opened.raw) {
        opened.kind = kind.value as ModelKind;
        report(opened);
        panel.update();
      }
    },
    { signal: events.signal },
  );
  retry.addEventListener("click", () => void pending?.(), { signal: events.signal });
  filter();
  try {
    const model = new URLSearchParams(location.search).get("model");
    if (model) {
      selected = installedModel(entries, model);
      definition.value = selected;
    }
    choose();
  } catch {
    selected = undefined;
    definition.selectedIndex = -1;
    error.textContent = text("ui.tools.unknown");
    panel.update();
  }
  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      request++;
      events.abort();
      fetching?.abort();
      preview?.dispose();
      panel.dispose();
      root.remove();
      canvas.classList.remove("content-tools-model");
      document.body.classList.remove("content-tools-page");
      document.documentElement.style.fontSize = priorScale;
      delete canvas.dataset.model;
      for (const [name, value] of prior)
        if (value === null) canvas.removeAttribute(name);
        else canvas.setAttribute(name, value);
    },
  };
}
