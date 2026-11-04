import { builtins } from "virtual:debug-builtins";
import { content } from "virtual:normal-catalog";
import { text } from "../../shared";
import { mountNativePanel } from "../../shared/native-panel";
import { firstPlayableRoster } from "../skirmish/roster";
import { damageModifiers, type ManualEntry, searchManual } from "./catalog";
import { inspectManualModel } from "./model";

/** Shared standalone and paused-match controller; statistics come from the installed catalog. */
export function fieldManual(
  root: HTMLElement,
  back: () => void,
  canvas?: HTMLCanvasElement,
  update?: () => void,
) {
  root.innerHTML = `<!-- THESIS: searchable roster reference, separate from battlefield commands.
OWN-WORLD: inherited graphite panels, warm metal focus frames, original model icons.
STORY: find an actor, read compiled costs and capabilities, inspect its original model.
FIRST VIEWPORT: Back/title, search and category, roster left and details right; stacked when narrow.
FORM: code-led extension of the existing native gallery and the owner's Field Manual wireframe.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance -->
<section class="manual-screen saves-screen"><button type="button" data-back>${text("ui.common.back")}</button><h1>${text("ui.manual.title")}</h1><div class="save-filters"><label>${text("ui.manual.search")}<input type="search" name="manual-search" maxlength="96"></label><label>${text("ui.manual.filter")}<select name="manual-kind"><option value="all">${text("ui.manual.all")}</option><option value="unit">${text("ui.manual.units")}</option><option value="structure">${text("ui.manual.structures")}</option></select></label></div><div class="save-layout"><div data-panel-list role="group" aria-label="${text("ui.manual.title")}"></div><aside data-panel-detail></aside></div><p role="status" aria-live="polite"></p><p role="alert"></p></section>`;
  const section = root.querySelector<HTMLElement>(".manual-screen")!;
  const search = section.querySelector<HTMLInputElement>("input")!;
  const kind = section.querySelector<HTMLSelectElement>("select")!;
  const list = section.querySelector<HTMLElement>("[data-panel-list]")!;
  const detail = section.querySelector<HTMLElement>("[data-panel-detail]")!;
  const status = section.querySelector<HTMLElement>('[role="status"]')!;
  const abort = new AbortController();
  const metadata = new Map<string, Omit<ManualEntry, "gameplay">>(
    builtins.map((entry) => {
      const raw = entry.raw as { id: string; name: string; description?: string };
      return [
        `core.${raw.id}`,
        { ...entry, name: raw.name, description: raw.description ?? "" },
      ] as const;
    }),
  );
  const roster = new Set([...firstPlayableRoster, "core.structure:neutral/resource-extractor"]);
  const entries: ManualEntry[] = (content.catalog?.definitions ?? [])
    .filter((definition) => roster.has(definition.id))
    .map((gameplay) => ({
      gameplay,
      ...metadata.get(gameplay.id),
      name: metadata.get(gameplay.id)?.name ?? gameplay.id,
      description: metadata.get(gameplay.id)?.description ?? "",
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  let selected = entries[0]?.gameplay.id;
  let native: ReturnType<typeof mountNativePanel> | undefined;
  let closeModel: (() => void) | undefined;
  let disposed = false;
  const changed = () => {
    native?.update();
    update?.();
  };
  const names = (ids: readonly string[]) =>
    ids.map((id) => metadata.get(id)?.name ?? id).join(", ") || text("ui.manual.none");
  function element<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    value: string,
    parent: HTMLElement = detail,
  ) {
    const node = document.createElement(tag);
    node.textContent = value;
    parent.append(node);
    return node;
  }
  function table(
    caption: string,
    headers: readonly string[],
    rows: readonly (readonly string[])[],
    parent = detail,
  ) {
    const region = document.createElement("div");
    region.setAttribute("role", "region");
    region.setAttribute("aria-label", caption);
    region.tabIndex = 0;
    const table = document.createElement("table");
    element("caption", caption, table);
    const head = table.createTHead().insertRow();
    for (const header of headers) {
      const cell = document.createElement("th");
      cell.scope = "col";
      cell.textContent = header;
      head.append(cell);
    }
    const body = table.createTBody();
    for (const values of rows) {
      const row = body.insertRow();
      for (const value of values) row.insertCell().textContent = value;
    }
    region.append(table);
    parent.append(region);
  }
  function show(entry?: ManualEntry) {
    detail.replaceChildren();
    if (!entry) return;
    const definition = entry.gameplay;
    element("h2", entry.name).tabIndex = -1;
    if (entry.icon) {
      const image = document.createElement("img");
      image.src = entry.icon;
      image.alt = "";
      image.width = 128;
      image.height = 128;
      detail.append(image);
    }
    element("p", entry.description);
    const rows: string[][] = [[text("ui.manual.health"), String(definition.health)]];
    if (definition.armor) rows.push([text("ui.manual.armour"), definition.armor]);
    if (definition.visionSubcells !== undefined)
      rows.push([text("ui.manual.vision"), String(definition.visionSubcells / 1024)]);
    if (definition.kind === "unit")
      rows.push([
        text("ui.manual.speed"),
        String(Number(((definition.speed * 20) / 1024).toFixed(2))),
      ]);
    if (definition.power !== undefined)
      rows.push([text("ui.manual.power"), `${definition.power > 0 ? "+" : ""}${definition.power}`]);
    if (definition.pop !== undefined)
      rows.push([text("ui.manual.population"), String(definition.pop)]);
    if (definition.footprint)
      rows.push([text("ui.manual.footprint"), definition.footprint.join(" × ")]);
    const resources = {
      credits: "ui.hud.credits",
      materials: "ui.hud.materials",
      "industrial-capacity": "ui.hud.industrial",
      "salvage-points": "ui.hud.salvage",
    } as const;
    rows.push([
      text("ui.manual.cost"),
      definition.construction
        ? Object.entries(definition.construction.cost)
            .map(
              ([id, amount]) =>
                `${amount} ${id in resources ? text(resources[id as keyof typeof resources]) : id}`,
            )
            .join(", ")
        : text("ui.manual.unpriced"),
    ]);
    if (definition.construction)
      rows.push([text("ui.manual.build-time"), String(definition.construction.buildTicks / 20)]);
    rows.push([text("ui.manual.prerequisites"), names(definition.requires)]);
    if (definition.producedBy.length)
      rows.push([text("ui.manual.produced-by"), names(definition.producedBy)]);
    if (definition.produces.length)
      rows.push([
        text("ui.manual.produces"),
        names(definition.produces.filter((id) => roster.has(id))),
      ]);
    if (definition.builds.length)
      rows.push([
        text("ui.manual.builds"),
        names(definition.builds.filter((id) => roster.has(id))),
      ]);
    table(text("ui.manual.statistics"), [text("ui.manual.stat"), text("ui.manual.value")], rows);
    if (definition.weapons.length) element("h3", text("ui.manual.weapons"));
    for (const weapon of definition.weapons) {
      table(
        weapon.id,
        [text("ui.manual.stat"), text("ui.manual.value")],
        [
          [text("ui.manual.targets"), weapon.targets.join(", ")],
          [text("ui.manual.range"), weapon.rangeSubcells.map((value) => value / 1024).join("–")],
          [text("ui.manual.reload"), String(weapon.reloadTicks / 20)],
          [text("ui.manual.projectile"), weapon.projectile.kind],
          [
            text("ui.manual.effects"),
            weapon.warheads
              .map(
                (warhead) =>
                  `${warhead.type}${warhead.amount !== undefined ? ` ${warhead.amount}` : warhead.amountPerSecond !== undefined ? ` ${warhead.amountPerSecond}/s` : ""}`,
              )
              .join(", "),
          ],
        ],
      );
      const modifiers = damageModifiers(weapon);
      if (modifiers.length) {
        const more = document.createElement("details");
        element("summary", `${text("ui.manual.modifiers")} · ${weapon.id}`, more);
        element("p", text("ui.manual.modifier-help"), more);
        table(
          text("ui.manual.modifiers"),
          [text("ui.manual.warhead"), text("ui.manual.armour"), text("ui.manual.percent")],
          modifiers.map((row) => [String(row.warhead), row.armor, `${row.percent}%`]),
          more,
        );
        detail.append(more);
      }
    }
    if (entry.model) {
      const inspect = element("button", text("ui.manual.model"));
      inspect.type = "button";
      inspect.addEventListener("click", () => {
        closeModel?.();
        closeModel = inspectManualModel(entry);
      });
    }
    const browse = element("button", text("ui.manual.browse"));
    browse.type = "button";
    browse.addEventListener("click", () => search.focus());
  }
  function render() {
    const visible = searchManual(entries, search.value, kind.value);
    if (!visible.some((entry) => entry.gameplay.id === selected))
      selected = visible[0]?.gameplay.id;
    list.replaceChildren();
    if (!visible.length) element("p", text("ui.manual.empty"), list);
    for (const entry of visible) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "save-row";
      button.dataset.panelEntry = entry.gameplay.id;
      button.setAttribute("aria-pressed", String(selected === entry.gameplay.id));
      button.append(document.createTextNode(entry.name));
      if (entry.icon) {
        const image = document.createElement("img");
        image.src = entry.icon;
        image.alt = "";
        button.prepend(image);
      }
      element(
        "small",
        text(entry.gameplay.kind === "unit" ? "ui.manual.units" : "ui.manual.structures"),
        button,
      );
      button.addEventListener("click", () => {
        selected = entry.gameplay.id;
        render();
        detail.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true });
      });
      list.append(button);
    }
    show(visible.find((entry) => entry.gameplay.id === selected));
    status.textContent = text("ui.manual.results", { count: visible.length });
    changed();
  }
  section.querySelector("[data-back]")!.addEventListener("click", back, { signal: abort.signal });
  search.addEventListener("input", render, { signal: abort.signal });
  kind.addEventListener("change", render, { signal: abort.signal });
  if (!content.catalog)
    section.querySelector<HTMLElement>('[role="alert"]')!.textContent =
      text("ui.manual.unavailable");
  render();
  if (canvas)
    native = mountNativePanel(root, section, canvas, {
      id: () => "manual",
      title: () => text("ui.manual.title"),
      modal: false,
    });
  return () => {
    if (disposed) return;
    disposed = true;
    abort.abort();
    closeModel?.();
    native?.dispose();
  };
}
