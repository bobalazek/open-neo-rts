import { content } from "virtual:normal-catalog";
import { text } from "../../shared";
import { mountNativePanel } from "../../shared/native-panel";
import { createOfflineMatch } from "../../worker";
import { loadMap } from "../debug/maps";
import { map, normalSkirmish } from "../skirmish/setup";
import {
  MAX_SAVE_BYTES,
  parseSavedGame,
  type SavedGame,
  saveCompatibility,
  saveMapHash,
  saveStore,
} from "./storage";

export * from "./storage";

/** Import validation uses an isolated host, never the current game's worker or renderer. */
async function verifyImport(save: SavedGame, signal: AbortSignal): Promise<void> {
  const incompatible = saveCompatibility(save, content.catalog?.gameplayHash);
  if (incompatible) throw new Error(incompatible);
  if (!content.catalog) throw new Error(text("ui.skirmish.content-error"));
  const loaded = await loadMap(`core.${map.id}`);
  if (signal.aborted) throw new Error(text("ui.common.cancel"));
  const match = createOfflineMatch(() => {});
  const cancel = () => match.dispose();
  signal.addEventListener("abort", cancel, { once: true });
  try {
    if (saveMapHash(save.match) !== save.mapHash) throw new Error(text("ui.saves.invalid"));
    await match.init({
      setup: normalSkirmish(save.config, loaded.grid, content.catalog),
      seat: 1,
      mode: "controlled",
      savedMatch: save.match,
    });
  } finally {
    signal.removeEventListener("abort", cancel);
    match.dispose();
  }
}

/** The same list is mounted at /load and inside the paused match menu. */
export function loadGameScreen(
  root: HTMLElement,
  options: {
    load: (save: SavedGame) => Promise<void>;
    back: () => void;
    start?: () => void;
    update?: () => void;
  },
  canvas?: HTMLCanvasElement,
) {
  const abort = new AbortController();
  const urls = new Set<string>();
  let disposed = false,
    busy = false,
    rows: unknown[] = [],
    selected: string | undefined;
  let native: ReturnType<typeof mountNativePanel> | undefined;
  root.innerHTML = `<section class="saves-screen"><button type="button" data-back>${text("ui.common.back")}</button><h1>${text("ui.saves.title")}</h1><div class="save-filters"><label>${text("ui.saves.filter")}<select data-save-filter><option value="all">${text("ui.saves.all")}</option><option value="manual">${text("ui.saves.manual")}</option><option value="quick">${text("ui.saves.quick")}</option><option value="auto">${text("ui.saves.auto")}</option></select></label><label>${text("ui.saves.search")}<input type="search" maxlength="96" data-save-search></label></div><div class="save-layout"><div data-save-list role="group" aria-label="${text("ui.saves.title")}"></div><aside data-save-detail></aside></div><p role="status" data-save-status></p><p role="alert" data-save-error></p><label>${text("ui.saves.import")}<input type="file" accept="application/json,.json" data-save-import></label><button type="button" data-save-start hidden>${text("ui.home.quick-start")}</button></section>`;
  const query = <T extends Element>(selector: string) => {
    const found = root.querySelector<T>(selector);
    if (!found) throw new Error("Save controls missing");
    return found;
  };
  const status = query<HTMLElement>("[data-save-status]"),
    error = query<HTMLElement>("[data-save-error]");
  const list = query<HTMLElement>("[data-save-list]"),
    detail = query<HTMLElement>("[data-save-detail]");
  const filter = query<HTMLSelectElement>("[data-save-filter]"),
    search = query<HTMLInputElement>("[data-save-search]");
  const file = query<HTMLInputElement>("[data-save-import]");
  const entry = (raw: unknown) => {
    try {
      return parseSavedGame(raw);
    } catch {
      return undefined;
    }
  };
  const rawId = (raw: unknown) =>
    raw && typeof raw === "object" && "id" in raw && typeof raw.id === "string"
      ? raw.id
      : undefined;
  function controls() {
    for (const control of root.querySelectorAll<
      HTMLButtonElement | HTMLInputElement | HTMLSelectElement
    >("button,input,select"))
      control.disabled = busy || control.hasAttribute("data-unavailable");
    native?.update();
    options.update?.();
  }
  async function run(action: () => Promise<void>) {
    if (disposed || busy) return;
    busy = true;
    error.textContent = "";
    status.textContent = text("ui.saves.working");
    controls();
    try {
      await action();
    } catch (reason) {
      if (!disposed)
        error.textContent = reason instanceof Error ? reason.message : text("ui.saves.failed");
    } finally {
      busy = false;
      if (!disposed) {
        status.textContent = "";
        controls();
      }
    }
  }
  function details(raw?: unknown) {
    detail.replaceChildren();
    if (raw === undefined) return;
    const save = entry(raw),
      id = rawId(raw);
    const heading = document.createElement("h2");
    heading.textContent = save?.name ?? text("ui.saves.invalid");
    detail.append(heading);
    if (save) {
      const image = document.createElement("img");
      image.src = save.thumbnail;
      image.alt = text("ui.saves.preview", { name: save.name });
      image.width = 320;
      image.height = 180;
      const metadata = document.createElement("p");
      metadata.textContent = text("ui.saves.details", {
        date: new Date(save.createdAt).toLocaleString(),
        tick: save.match.tick,
        sim: save.match.simVersion,
      });
      detail.append(image, metadata);
      const incompatible = saveCompatibility(save, content.catalog?.gameplayHash);
      if (incompatible) {
        const reason = document.createElement("p");
        reason.textContent = incompatible;
        detail.append(reason);
      }
      const load = document.createElement("button");
      load.type = "button";
      load.textContent = text("ui.saves.load");
      if (incompatible) load.setAttribute("data-unavailable", "");
      load.addEventListener(
        "click",
        () =>
          void run(async () => {
            const current = await saveStore.read(save.id);
            if (
              current.createdAt !== save.createdAt ||
              current.match.checksum !== save.match.checksum
            ) {
              await refresh();
              throw new Error(text("ui.saves.changed"));
            }
            await options.load(current);
          }),
      );
      const download = document.createElement("button");
      download.type = "button";
      download.textContent = text("ui.saves.export");
      download.addEventListener("click", () => {
        const url = URL.createObjectURL(
          new Blob([`${JSON.stringify(save)}\n`], { type: "application/json" }),
        );
        urls.add(url);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `open-neo-rts-save-${save.createdAt}.json`;
        anchor.click();
      });
      detail.append(load, download);
    }
    if (id !== undefined) {
      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = text("ui.saves.delete");
      remove.addEventListener("click", () => {
        if (window.confirm(text("ui.saves.delete-confirm")))
          void run(async () => {
            try {
              await saveStore.remove(id, raw);
            } catch (error) {
              await refresh();
              throw error;
            }
            selected = undefined;
            await refresh();
          });
      });
      detail.append(remove);
    }
    controls();
  }
  function render() {
    list.replaceChildren();
    const ordered = [...rows].sort(
      (a, b) => (entry(b)?.createdAt ?? 0) - (entry(a)?.createdAt ?? 0),
    );
    for (const raw of ordered) {
      const save = entry(raw),
        id = rawId(raw),
        name = save?.name ?? text("ui.saves.invalid");
      if (filter.value !== "all" && save?.kind !== filter.value) continue;
      if (!name.toLowerCase().includes(search.value.toLowerCase())) continue;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "save-row";
      button.setAttribute("aria-pressed", String(selected === id));
      button.textContent = name;
      if (save) {
        const image = document.createElement("img");
        image.src = save.thumbnail;
        image.alt = "";
        image.width = 128;
        image.height = 72;
        const date = document.createElement("small");
        date.textContent = new Date(save.createdAt).toLocaleString();
        button.prepend(image);
        button.append(date);
      }
      button.addEventListener("click", () => {
        selected = id;
        render();
      });
      list.append(button);
    }
    details(rows.find((raw) => selected !== undefined && rawId(raw) === selected));
    if (!list.children.length) {
      const empty = document.createElement("p");
      empty.textContent = text(rows.length ? "ui.saves.no-results" : "ui.saves.empty");
      list.append(empty);
    }
    query<HTMLButtonElement>("[data-save-start]").hidden = !!rows.length || !options.start;
    controls();
  }
  async function refresh() {
    const next = await saveStore.list();
    if (!disposed) {
      rows = next;
      render();
    }
  }
  filter.addEventListener("change", render);
  search.addEventListener("input", render);
  query<HTMLButtonElement>("[data-back]").addEventListener("click", options.back);
  query<HTMLButtonElement>("[data-save-start]").addEventListener("click", () => options.start?.());
  file.addEventListener("change", () => {
    const imported = file.files?.[0];
    if (!imported) return;
    void run(async () => {
      if (imported.size > MAX_SAVE_BYTES) throw new Error(text("ui.saves.too-large"));
      const save = parseSavedGame(JSON.parse(await imported.text()));
      await verifyImport(save, abort.signal);
      if (disposed) return;
      const copy: SavedGame = { ...save, id: `manual-${crypto.randomUUID()}`, kind: "manual" };
      await saveStore.write(copy);
      selected = copy.id;
      await refresh();
    }).finally(() => {
      file.value = "";
    });
  });
  if (canvas)
    native = mountNativePanel(root, root.querySelector<HTMLElement>(".saves-screen")!, canvas, {
      id: () => "load",
      title: () => text("ui.saves.title"),
      modal: false,
    });
  void run(refresh);
  return () => {
    disposed = true;
    abort.abort();
    native?.dispose();
    for (const url of urls) URL.revokeObjectURL(url);
    urls.clear();
  };
}
