import { content } from "virtual:normal-catalog";
import preview from "../../../../../content/core/maps/training-grounds/preview.png";
import { text } from "../../shared";
import { mountNativePanel } from "../../shared/native-panel";
import { isMatchRecord, isRecord } from "../../worker/protocol";
import { faction, map } from "../skirmish/setup";
import { savedReplay, verifyReplay } from "./files";
import {
  MAX_REPLAY_BYTES,
  parseSavedReplay,
  replayCompatibility,
  replayConfig,
  replayStore,
  replayTime,
  type SavedReplay,
} from "./storage";

export function replayLibrary(
  root: HTMLElement,
  canvas: HTMLCanvasElement,
  watch: (id: string) => void,
  back: () => void,
) {
  root.innerHTML = `<section class="saves-screen"><button type="button" data-back>${text("ui.common.back")}</button><h1>${text("ui.replays.title")}</h1><label>${text("ui.replays.search")}<input type="search" maxlength="96" data-search></label><div class="save-layout"><div data-save-list role="group" aria-label="${text("ui.replays.title")}"></div><aside data-save-detail></aside></div><p role="status" aria-live="polite"></p><p role="alert"></p><label>${text("ui.replays.import")}<input type="file" accept="application/json,.json"></label></section>`;
  const signal = new AbortController(),
    urls = new Set<string>();
  const section = root.querySelector<HTMLElement>("section")!,
    list = section.querySelector<HTMLElement>("[data-save-list]")!,
    detail = section.querySelector<HTMLElement>("aside")!;
  const status = section.querySelector<HTMLElement>('[role="status"]')!,
    alert = section.querySelector<HTMLElement>('[role="alert"]')!,
    file = section.querySelector<HTMLInputElement>('[type="file"]')!,
    search = section.querySelector<HTMLInputElement>('[type="search"]')!;
  let disposed = false,
    busy = false,
    rows: unknown[] = [],
    selected: string | undefined;
  let selectedInvalid: unknown;
  const native = mountNativePanel(root, section, canvas, {
    id: () => "replays",
    title: () => text("ui.replays.title"),
    modal: false,
  });
  const controls = () => {
    for (const input of section.querySelectorAll<HTMLInputElement | HTMLButtonElement>(
      "input,button:not([data-back])",
    ))
      input.disabled = busy || input.hasAttribute("data-unavailable");
    native.update();
  };
  async function run(action: () => Promise<void>) {
    if (busy || disposed) return;
    busy = true;
    alert.textContent = "";
    controls();
    try {
      await action();
    } catch (error) {
      if (!disposed)
        alert.textContent = error instanceof Error ? error.message : text("ui.replays.failed");
    } finally {
      busy = false;
      if (!disposed) {
        status.textContent = "";
        controls();
      }
    }
  }
  const entry = (raw: unknown) => {
    try {
      return parseSavedReplay(raw);
    } catch {
      return undefined;
    }
  };
  async function unchanged(replay: SavedReplay) {
    const current = await replayStore.read(replay.id);
    if (JSON.stringify(current) !== JSON.stringify(replay))
      throw new Error("Replay changed in another tab. Refresh and try again.");
    return current;
  }
  function button(label: string, activate: () => void) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.addEventListener("click", activate);
    detail.append(button);
    return button;
  }
  function details(replay?: SavedReplay) {
    detail.replaceChildren();
    if (!replay) return;
    const heading = document.createElement("h2"),
      image = document.createElement("img"),
      metadata = document.createElement("p"),
      name = document.createElement("input"),
      label = document.createElement("label");
    heading.textContent = replay.name;
    image.src = preview;
    image.alt = map.name;
    image.width = 320;
    image.height = 180;
    metadata.textContent = `${map.name} · ${replayTime(replay.record.tick)} · ${replay.winner === null ? text("ui.result.draw") : text("ui.result.winner", { team: replay.winner + 1 })}\n${new Date(replay.createdAt).toLocaleString()} · Simulation ${replay.record.scenario.simVersion}`;
    detail.append(heading, image, metadata);
    const reason = replayCompatibility(replay, content.packs, content.cosmeticHash);
    if (reason) {
      const error = document.createElement("p");
      error.textContent = reason;
      detail.append(error);
    }
    button(
      text("ui.replays.watch"),
      () =>
        void run(async () => {
          await unchanged(replay);
          if (!disposed) watch(replay.id);
        }),
    ).disabled = !!reason;
    if (reason) detail.querySelector("button")!.setAttribute("data-unavailable", "");
    name.value = replay.name;
    name.maxLength = 96;
    label.textContent = text("ui.replays.name");
    label.append(name);
    detail.append(label);
    button(
      text("ui.replays.rename"),
      () =>
        void run(async () => {
          const next = parseSavedReplay({ ...replay, name: name.value.trim() });
          await replayStore.write(next, replay);
          await refresh();
        }),
    );
    button(
      text("ui.replays.export"),
      () =>
        void run(async () => {
          const current = await unchanged(replay);
          if (disposed) return;
          const url = URL.createObjectURL(
            new Blob([`${JSON.stringify(current)}\n`], { type: "application/json" }),
          );
          urls.add(url);
          const anchor = document.createElement("a");
          anchor.href = url;
          anchor.download = `${replay.id}.json`;
          anchor.click();
          setTimeout(() => {
            URL.revokeObjectURL(url);
            urls.delete(url);
          }, 1000);
        }),
    );
    button(
      text("ui.replays.delete"),
      () =>
        void run(async () => {
          if (!window.confirm(text("ui.replays.confirm-delete", { name: replay.name }))) return;
          await replayStore.remove(replay.id, replay);
          selected = undefined;
          await refresh();
        }),
    );
  }
  function render() {
    list.replaceChildren();
    const entries = rows
      .map(entry)
      .filter((value): value is SavedReplay => !!value)
      .sort((a, b) => b.createdAt - a.createdAt);
    for (const replay of entries) {
      if (
        !`${replay.name} ${map.name} ${faction.name} ${text("ui.replays.player", { team: 1 })} ${text("ui.replays.bot", { team: 2 })}`
          .toLowerCase()
          .includes(search.value.toLowerCase())
      )
        continue;
      const row = document.createElement("button"),
        image = document.createElement("img"),
        caption = document.createElement("small");
      row.type = "button";
      row.className = "save-row";
      row.setAttribute("aria-pressed", String(replay.id === selected));
      row.textContent = replay.name;
      image.src = preview;
      image.alt = "";
      image.width = 128;
      image.height = 72;
      caption.textContent = `${replayTime(replay.record.tick)} · ${new Date(replay.createdAt).toLocaleString()}`;
      row.prepend(image);
      row.append(caption);
      row.addEventListener("click", () => {
        selected = replay.id;
        selectedInvalid = undefined;
        render();
      });
      list.append(row);
    }
    for (const [index, raw] of rows.entries()) {
      if (entry(raw)) continue;
      const label = text("ui.replays.invalid", { number: index + 1 });
      if (search.value && !label.toLowerCase().includes(search.value.toLowerCase())) continue;
      const row = document.createElement("button");
      row.type = "button";
      row.className = "save-row";
      row.textContent = label;
      row.setAttribute("aria-pressed", String(selectedInvalid === raw));
      row.addEventListener("click", () => {
        selected = undefined;
        selectedInvalid = raw;
        render();
      });
      list.append(row);
    }
    if (!list.children.length) {
      const empty = document.createElement("p");
      empty.textContent = text(rows.length ? "ui.replays.no-results" : "ui.replays.empty");
      list.append(empty);
    }
    details(entries.find((row) => row.id === selected));
    if (selectedInvalid !== undefined) {
      const error = document.createElement("p");
      error.textContent = text("ui.replays.damaged");
      detail.append(error);
      const raw = selectedInvalid;
      if (isRecord(raw)) {
        try {
          const key = raw.id as IDBValidKey;
          indexedDB.cmp(key, key);
          button(
            text("ui.replays.delete"),
            () =>
              void run(async () => {
                if (
                  !window.confirm(
                    text("ui.replays.confirm-delete", {
                      name: text("ui.replays.invalid", { number: "" }),
                    }),
                  )
                )
                  return;
                await replayStore.remove(key, raw);
                selectedInvalid = undefined;
                await refresh();
              }),
          );
        } catch {
          /* The gallery never guesses a damaged row's storage key. */
        }
      }
    }
    controls();
  }
  async function refresh() {
    const next = await replayStore.list();
    if (!disposed) {
      rows = next;
      render();
    }
  }
  section.querySelector("[data-back]")!.addEventListener("click", back, { signal: signal.signal });
  search.addEventListener("input", render, { signal: signal.signal });
  file.addEventListener(
    "change",
    () => {
      const imported = file.files?.[0];
      if (!imported) return;
      void run(async () => {
        if (imported.size > MAX_REPLAY_BYTES) throw new Error(text("ui.replays.too-large"));
        const value: unknown = JSON.parse(await imported.text());
        const replay = isMatchRecord(value)
          ? savedReplay(value, replayConfig(value), null)
          : parseSavedReplay(value);
        const winner = await verifyReplay(replay, signal.signal, (state) => {
          if (!disposed) {
            status.textContent = text("ui.replays.verifying", {
              current: replayTime(state.tick),
              total: replayTime(state.duration),
            });
            native.update();
          }
        });
        if (disposed) return;
        const copy: SavedReplay = { ...replay, id: `replay-${crypto.randomUUID()}`, winner };
        await replayStore.write(copy);
        selected = copy.id;
        await refresh();
      }).finally(() => {
        file.value = "";
      });
    },
    { signal: signal.signal },
  );
  void run(refresh);
  window.addEventListener(
    "keydown",
    (event) => {
      if (event.code === "Escape" && !event.defaultPrevented) {
        event.preventDefault();
        back();
      }
    },
    { signal: signal.signal },
  );
  return () => {
    disposed = true;
    signal.abort();
    native.dispose();
    for (const url of urls) URL.revokeObjectURL(url);
    urls.clear();
  };
}
