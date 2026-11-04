import { SCHEMAS, validate } from "@open-neo-rts/content";
import { text } from "../../shared";
import { definitionArchive } from "./archive";
import { prepareDefinitionClone } from "./creation";
import { writeDefinitionClone } from "./creation-write";
import { definitionForm } from "./definition-form";
import {
  checkDefinitionDraft,
  EditorConflict,
  type EditorDirectory,
  type EditorPack,
  readEditorDirectory,
  readEditorPack,
  safeEditorPath,
  writeDefinition,
} from "./definition-pack";
import { MODEL_FILE_LIMIT } from "./model";

type Data = Record<string, unknown>;
type Kind = "unit" | "structure" | "prop";
type Message = Parameters<typeof text>[0];
const groups = ["general", "combat", "visuals", "production", "upgrades", "eras"] as const;
type Group = (typeof groups)[number];
const GROUPS: Record<Group, readonly string[]> = {
  general: [
    "id",
    "name",
    "description",
    "role",
    "family",
    "tags",
    "health",
    "armor",
    "resist",
    "movement",
    "radius",
    "vision",
    "pop",
    "footprint",
    "cells",
    "nodeKinds",
    "blocks",
    "domains",
    "destructible",
    "harvest",
    "transport",
    "ammo",
    "repair",
    "power",
    "dock",
    "pads",
    "garrison",
    "turret",
  ],
  combat: ["weapons", "abilities"],
  visuals: ["presentation"],
  production: [
    "cost",
    "buildTime",
    "producedBy",
    "requires",
    "spawnsWith",
    "productionReward",
    "productionSlots",
    "exits",
    "extraction",
    "adjacency",
  ],
  upgrades: ["research"],
  eras: ["eras", "eraVariants"],
};

/** Browser-owned authoring state; only copied validated JSON reaches previews or downloads. */
export function mountDefinitionEditor(
  host: HTMLElement,
  options: {
    initialId?: string;
    update(): void;
    preview(value: {
      bytes: Uint8Array;
      wreck?: Uint8Array;
      raw: Data;
      name: string;
      kind: Kind;
    }): Promise<void>;
    playtest(
      packs: readonly EditorPack[],
      packId: string,
      path: string,
      draft: Data,
      mode: "movement" | "skirmish",
    ): Promise<void>;
  },
) {
  const section = document.createElement("div");
  section.className = "definition-editor";
  section.setAttribute("data-panel-content", "");
  const label = (caption: Message, name: string) => {
    const row = document.createElement("label");
    row.append(text(caption));
    const input = document.createElement("select");
    input.name = name;
    input.setAttribute("aria-label", text(caption));
    row.append(input);
    section.append(row);
    return input;
  };
  const picker = label("ui.editor.definition", "edit-definition");
  const tabs = document.createElement("div");
  tabs.setAttribute("role", "tablist");
  const formHost = document.createElement("div");
  const creationHost = document.createElement("div");
  const creationHelp = document.createElement("p");
  creationHelp.textContent = text("ui.editor.clone-help");
  creationHost.append(creationHelp);
  const creationField = (key: Message, name: string) => {
    const row = document.createElement("label");
    row.append(text(key));
    const field = document.createElement("input");
    field.type = "text";
    field.name = name;
    field.setAttribute("aria-label", text(key));
    row.append(field);
    creationHost.append(row);
    return field;
  };
  const cloneName = creationField("ui.editor.clone-name", "clone-name");
  cloneName.maxLength = 96;
  const cloneFolder = creationField("ui.editor.clone-folder", "clone-folder");
  cloneFolder.maxLength = 96;
  const status = document.createElement("p");
  status.setAttribute("role", "status");
  const error = document.createElement("p");
  error.setAttribute("role", "alert");
  const diagnostics = document.createElement("div");
  const conflict = document.createElement("div");
  conflict.hidden = true;
  const input = document.createElement("input");
  input.type = "file";
  input.hidden = true;
  input.setAttribute("webkitdirectory", "");
  section.append(tabs, formHost, creationHost, status, error, diagnostics, conflict, input);
  host.append(section);
  let packs: EditorPack[] = [],
    current: { pack: EditorPack; file: string; kind: Kind } | undefined;
  let draft: Data = {},
    baseline = "",
    baselineJson = "",
    busy = false,
    disposed = false;
  let group: Group = "general";
  let diskConflict: string | undefined,
    selection = 0,
    folderDialog = false,
    creating = false;
  const inputErrors = new Map<string, string>();
  const inputValues = new Map<string, string>();
  const events = new AbortController();
  const dirty = () => !!current && (inputErrors.size > 0 || JSON.stringify(draft) !== baselineJson);
  function action(key: Message, run: () => void, footer = false) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = text(key);
    if (footer) button.setAttribute("data-panel-footer", "");
    button.addEventListener("click", run, { signal: events.signal });
    section.append(button);
    return button;
  }
  const open = action("ui.editor.open-pack", () => void openPack(), true);
  const save = action("ui.editor.download", () => void saveDraft(), true);
  const preview = action("ui.editor.preview", () => void validateDraft(true));
  const playtest = action("ui.editor.playtest", () => void startPlaytest("movement"), true);
  playtest.setAttribute("data-playtest", "");
  playtest.title = text("ui.editor.playtest-help");
  playtest.setAttribute("data-contextual-help", "");
  const skirmish = action("ui.editor.skirmish", () => void startPlaytest("skirmish"), true);
  skirmish.setAttribute("data-skirmish-playtest", "");
  skirmish.title = text("ui.editor.skirmish-help");
  skirmish.setAttribute("data-contextual-help", "");
  const clone = action("ui.editor.clone", () => {
    if (!current || !canReplace()) return;
    creating = true;
    cloneName.value = "";
    cloneFolder.value = "";
    error.textContent = "";
    diagnostics.replaceChildren();
    refresh();
    cloneName.focus();
  });
  const create = action("ui.editor.create", () => void createDefinition(false), true);
  const archive = action("ui.editor.download-changes", () => void createDefinition(true), true);
  const cancelCreate = action(
    "ui.editor.cancel-create",
    () => {
      if (busy) return;
      creating = false;
      error.textContent = "";
      refresh();
      clone.focus();
    },
    true,
  );
  open.title = text("ui.editor.open-help");
  for (const button of [open, save, preview]) button.setAttribute("data-contextual-help", "");
  save.title = preview.title = text("ui.editor.check-scope");
  const discard = action("ui.editor.discard", () => {
    if (!current || busy) return;
    draft = JSON.parse(baselineJson) as Data;
    inputErrors.clear();
    inputValues.clear();
    diskConflict = undefined;
    conflict.hidden = true;
    renderForm();
  });
  const reload = action("ui.editor.reload-disk", () => {
    if (!current || busy || diskConflict === undefined) return;
    try {
      const value: unknown = JSON.parse(diskConflict);
      if (!value || typeof value !== "object" || Array.isArray(value))
        throw new Error("Not a definition object");
      baseline = diskConflict;
      draft = value as Data;
      baselineJson = JSON.stringify(draft);
      inputErrors.clear();
      inputValues.clear();
      diskConflict = undefined;
      conflict.hidden = true;
      renderForm();
    } catch {
      error.textContent = text("ui.editor.invalid-disk");
      options.update();
    }
  });
  reload.setAttribute("data-panel-footer", "");
  const keep = action("ui.editor.keep-edits", () => {
    if (busy || diskConflict === undefined) return;
    baseline = diskConflict;
    diskConflict = undefined;
    conflict.hidden = true;
    error.textContent = "";
    refresh();
  });
  keep.setAttribute("data-panel-footer", "");
  for (const key of groups) {
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("role", "tab");
    button.textContent = text(`ui.editor.${key}`);
    button.addEventListener(
      "click",
      () => {
        group = key;
        renderForm();
      },
      { signal: events.signal },
    );
    tabs.append(button);
  }
  function refresh() {
    const reviewing = diskConflict !== undefined;
    tabs.hidden = !current || reviewing || creating;
    picker.parentElement!.hidden = !current || reviewing || creating;
    formHost.hidden = reviewing || creating;
    creationHost.hidden = !creating;
    for (const control of section.querySelectorAll<
      HTMLInputElement | HTMLSelectElement | HTMLButtonElement
    >('input:not([type="file"]),select,button'))
      control.disabled = busy;
    for (const [index, button] of [...tabs.children].entries()) {
      button.setAttribute("aria-selected", String(groups[index] === group));
      const properties = current ? (SCHEMAS[current.kind].json.properties as Data) : {};
      (button as HTMLButtonElement).hidden = !GROUPS[groups[index]!].some((key) =>
        Object.hasOwn(properties, key),
      );
      (button as HTMLButtonElement).disabled = busy;
    }
    save.disabled = !current || busy || inputErrors.size > 0;
    preview.disabled = !current || busy || inputErrors.size > 0;
    save.hidden = preview.hidden = !current || reviewing || creating;
    playtest.hidden = save.hidden;
    playtest.disabled = save.disabled;
    skirmish.hidden = playtest.hidden;
    skirmish.disabled = playtest.disabled;
    open.hidden = reviewing || creating;
    clone.hidden = !current || reviewing || creating;
    clone.disabled = busy || dirty();
    create.hidden = !creating || !current?.pack.directory;
    archive.hidden = cancelCreate.hidden = !creating;
    open.disabled = busy;
    picker.disabled = busy || !current;
    discard.hidden = !current || !dirty() || reviewing || creating;
    discard.disabled = busy;
    reload.hidden = keep.hidden = diskConflict === undefined;
    save.textContent = text(current?.pack.directory ? "ui.editor.save" : "ui.editor.download");
    picker.title = current
      ? `${current.pack.input.id} / ${current.file.split("/").join(" / ")}`
      : "";
    picker.setAttribute("data-contextual-help", "");
    status.textContent = current
      ? `${String(draft.name)} · ${current.pack.input.id}${dirty() ? ` · ${text("ui.editor.unsaved")}` : ""}`
      : text("ui.editor.choose-pack");
    options.update();
  }
  function renderForm() {
    if (!current) {
      refresh();
      return;
    }
    const shape = SCHEMAS[current.kind].json;
    const properties = shape.properties as Data;
    const assigned = new Set(Object.values(GROUPS).flat());
    const keys = Object.keys(properties).filter(
      (key) =>
        key !== "$schema" &&
        (GROUPS[group]?.includes(key) || (group === "general" && !assigned.has(key))),
    );
    definitionForm(
      formHost,
      shape,
      draft,
      keys,
      () => {
        const issues = [
          ...inputErrors.values(),
          ...validate(SCHEMAS[current!.kind], draft).map(
            (issue) => `${issue.path}: ${issue.message}`,
          ),
        ];
        error.textContent = issues.slice(0, 3).join(" · ");
        refresh();
      },
      inputErrors,
      inputValues,
    );
    refresh();
  }
  function canReplace() {
    if (busy || dirty() || creating || diskConflict !== undefined) {
      error.textContent = text(
        creating ? "ui.editor.finish-creation" : "ui.editor.save-or-discard",
      );
      options.update();
      return false;
    }
    return true;
  }
  function entries() {
    return packs.flatMap((pack) =>
      [...pack.input.json].flatMap(([file, raw]) => {
        const kind = file.split("/").at(-1)?.replace(".json", "");
        return ["unit", "structure", "prop"].includes(kind ?? "") &&
          !file.includes("/source/") &&
          raw &&
          typeof raw === "object" &&
          "name" in raw
          ? [{ pack, file, kind: kind as Kind, raw: raw as Data }]
          : [];
      }),
    );
  }
  async function select(id: string) {
    const ticket = ++selection;
    const entry = entries().find((entry) => `${entry.pack.input.id}/${entry.file}` === id);
    if (!entry) return;
    busy = true;
    refresh();
    try {
      const source =
        (await entry.pack.handles.get(entry.file)?.getFile()) ?? entry.pack.files.get(entry.file)!;
      const sourceText = await source.text();
      const sourceData: unknown = JSON.parse(sourceText);
      if (!sourceData || typeof sourceData !== "object" || Array.isArray(sourceData))
        throw new Error(text("ui.editor.invalid-disk"));
      if (disposed || ticket !== selection) return;
      current = entry;
      baseline = sourceText;
      draft = sourceData as Data;
      baselineJson = JSON.stringify(draft);
      inputErrors.clear();
      inputValues.clear();
      conflict.hidden = true;
      diskConflict = undefined;
      diagnostics.replaceChildren();
      renderForm();
      await previewDraft();
    } finally {
      busy = false;
      if (!disposed) refresh();
    }
  }
  async function previewDraft(candidate = draft) {
    if (!current) return;
    const ticket = selection;
    const presentation = candidate.presentation as { model?: unknown; wreck?: string } | undefined;
    const source = current.pack.files.get(
      safeEditorPath(
        current.file.slice(0, current.file.lastIndexOf("/") + 1) +
          String(presentation?.model ?? ""),
      ),
    );
    if (!source) throw new Error(text("ui.editor.model-unavailable"));
    const wreck = presentation?.wreck
      ? current.pack.files.get(
          safeEditorPath(
            current.file.slice(0, current.file.lastIndexOf("/") + 1) + presentation.wreck,
          ),
        )
      : undefined;
    if (
      source.size > MODEL_FILE_LIMIT ||
      (presentation?.wreck && !wreck) ||
      (wreck && wreck.size > MODEL_FILE_LIMIT)
    )
      throw new Error(text("ui.editor.model-unavailable"));
    const value = {
      bytes: new Uint8Array(await source.arrayBuffer()),
      wreck: wreck && new Uint8Array(await wreck.arrayBuffer()),
      raw: structuredClone(candidate),
      name: String(candidate.name),
      kind: current.kind,
    };
    if (!disposed && ticket === selection) await options.preview(value);
  }
  async function accept(pack: EditorPack, preferredPath?: string) {
    if (disposed) return;
    packs = [...packs.filter((other) => other.input.id !== pack.input.id), pack];
    const available = entries();
    picker.replaceChildren(
      ...available.map(
        (entry) =>
          new Option(
            `${entry.pack.input.id} · ${entry.raw.name}`,
            `${entry.pack.input.id}/${entry.file}`,
          ),
      ),
    );
    const initial =
      available.find(
        (entry) => entry.pack.input.id === pack.input.id && entry.file === preferredPath,
      ) ??
      available.find((entry) => entry.raw.id === options.initialId) ??
      available[0];
    if (initial) {
      picker.value = `${initial.pack.input.id}/${initial.file}`;
      await select(picker.value);
    } else throw new Error(text("ui.editor.no-definitions"));
  }
  async function createDefinition(download: boolean) {
    if (!current || !creating || busy || disposed) return;
    busy = true;
    error.textContent = "";
    refresh();
    try {
      const fresh = await Promise.all(
        packs.map((pack) => (pack.directory ? readEditorDirectory(pack.directory) : pack)),
      );
      const source = fresh.find((pack) => pack.input.id === current!.pack.input.id)!;
      if ((await source.files.get(current.file)!.text()) !== baseline)
        throw new Error(text("ui.editor.template-changed"));
      const plan = await prepareDefinitionClone(
        fresh,
        source.input.id,
        current.file,
        cloneFolder.value,
        cloneName.value,
      );
      if (disposed) return;
      diagnostics.replaceChildren(
        ...plan.issues.map((issue) => {
          const line = document.createElement("p");
          line.textContent = `${issue.level}: ${issue.file}: ${issue.message}`;
          return line;
        }),
      );
      if (plan.issues.some((issue) => issue.level === "error"))
        throw new Error(text("ui.editor.validation-failed"));
      if (download) {
        const url = URL.createObjectURL(definitionArchive(plan.files));
        const link = document.createElement("a");
        link.href = url;
        link.download = `${plan.packId}-${cloneFolder.value}-changes.zip`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        error.textContent = text("ui.editor.archive-copy");
      } else {
        const pack = await writeDefinitionClone(fresh, plan);
        creating = false;
        await accept(pack, plan.path);
      }
    } catch (failure) {
      error.textContent =
        failure instanceof Error ? failure.message : text("ui.editor.save-failed");
    } finally {
      busy = false;
      if (!disposed) refresh();
    }
  }
  async function openPack() {
    if (!canReplace()) return;
    const choose = Reflect.get(window, "showDirectoryPicker") as
      | ((options: { mode: string }) => Promise<EditorDirectory>)
      | undefined;
    if (!choose) {
      busy = true;
      folderDialog = true;
      refresh();
      input.click();
      return;
    }
    try {
      busy = true;
      refresh();
      const handle = await choose.call(window, { mode: "readwrite" });
      await accept(await readEditorDirectory(handle));
    } catch (failure) {
      if (!(failure instanceof DOMException && failure.name === "AbortError"))
        error.textContent =
          failure instanceof Error ? failure.message : text("ui.editor.open-failed");
    } finally {
      busy = false;
      refresh();
    }
  }
  async function checkDraft(candidate: Data, showPreview: boolean) {
    if (!current) return false;
    try {
      packs = await Promise.all(
        packs.map((pack) =>
          pack.directory
            ? readEditorDirectory(
                pack.directory,
                pack.input.id === current!.pack.input.id
                  ? new Map([[current!.file, candidate]])
                  : undefined,
              )
            : pack,
        ),
      );
      current.pack = packs.find((pack) => pack.input.id === current!.pack.input.id)!;
      const issues = await checkDefinitionDraft(
        packs,
        current.pack.input.id,
        current.file,
        candidate,
      );
      if (disposed) return false;
      diagnostics.replaceChildren();
      for (const issue of issues) {
        const line = document.createElement("p");
        line.textContent = `${issue.level}: ${issue.file}: ${issue.message}`;
        diagnostics.append(line);
      }
      if (issues.some((issue) => issue.level === "error")) {
        error.textContent = text("ui.editor.validation-failed");
        return false;
      }
      if (showPreview) await previewDraft(candidate);
      return true;
    } catch (failure) {
      if (!disposed)
        error.textContent =
          failure instanceof Error ? failure.message : text("ui.editor.validation-failed");
      return false;
    }
  }
  async function validateDraft(showPreview: boolean) {
    if (!current || busy || inputErrors.size) return false;
    busy = true;
    error.textContent = "";
    refresh();
    try {
      return await checkDraft(structuredClone(draft), showPreview);
    } finally {
      busy = false;
      if (!disposed) refresh();
    }
  }
  async function startPlaytest(mode: "movement" | "skirmish") {
    if (!current || busy || creating || inputErrors.size || diskConflict !== undefined) return;
    busy = true;
    error.textContent = "";
    refresh();
    try {
      const candidate = structuredClone(draft);
      const fresh = await Promise.all(
        packs.map((pack) =>
          pack.directory
            ? readEditorDirectory(
                pack.directory,
                pack.input.id === current!.pack.input.id
                  ? new Map([[current!.file, candidate]])
                  : undefined,
              )
            : pack,
        ),
      );
      if (!disposed)
        await options.playtest(fresh, current.pack.input.id, current.file, candidate, mode);
    } catch (failure) {
      error.textContent =
        failure instanceof Error ? failure.message : text("ui.editor.validation-failed");
    } finally {
      busy = false;
      if (!disposed) refresh();
    }
  }
  async function saveDraft() {
    if (!current || busy || disposed || inputErrors.size || diskConflict !== undefined) return;
    const candidate = structuredClone(draft);
    busy = true;
    error.textContent = "";
    refresh();
    try {
      const handleBeforeValidation = current.pack.handles.get(current.file);
      if (handleBeforeValidation) {
        const disk = await (await handleBeforeValidation.getFile()).text();
        if (disk !== baseline) throw new EditorConflict(disk);
      }
      if (!(await checkDraft(candidate, false)) || disposed) return;
      // shortcut: two-space JSON until 2-38b2 supplies exact project formatting parity.
      const next = `${JSON.stringify(candidate, null, 2)}\n`;
      const handle = current.pack.handles.get(current.file);
      if (handle) {
        await writeDefinition(handle, baseline, next);
        baseline = next;
        baselineJson = JSON.stringify(candidate);
        current.pack.input.json.set(current.file, candidate);
        current.pack.files.set(current.file, await handle.getFile());
        error.textContent = "";
      } else {
        const url = URL.createObjectURL(new Blob([next], { type: "application/json" }));
        const link = document.createElement("a");
        link.href = url;
        link.download = current.file.replaceAll("/", "-");
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        error.textContent = text("ui.editor.download-copy");
      }
    } catch (failure) {
      if (failure instanceof EditorConflict) {
        diskConflict = failure.current;
        conflict.hidden = false;
        conflict.replaceChildren();
        const table = document.createElement("table");
        table.createCaption().textContent = text("ui.editor.conflict");
        const heading = table.createTHead().insertRow();
        for (const label of [
          text("ui.editor.field"),
          text("ui.editor.disk"),
          text("ui.editor.draft"),
        ]) {
          const cell = document.createElement("th");
          cell.textContent = label;
          heading.append(cell);
        }
        const rows: string[][] = [];
        const value = (data: unknown) => JSON.stringify(data) ?? text("ui.editor.not-present");
        function compare(left: unknown, right: unknown, path: string) {
          if (Object.is(left, right)) return;
          if (
            left &&
            right &&
            typeof left === "object" &&
            typeof right === "object" &&
            Array.isArray(left) === Array.isArray(right)
          ) {
            for (const key of [...new Set([...Object.keys(left), ...Object.keys(right)])].sort())
              compare(
                Object.hasOwn(left, key) ? (left as Data)[key] : undefined,
                Object.hasOwn(right, key) ? (right as Data)[key] : undefined,
                Array.isArray(left) ? `${path}[${key}]` : path ? `${path}.${key}` : key,
              );
          } else rows.push([path || "JSON", value(left), value(right)]);
        }
        try {
          compare(JSON.parse(failure.current), candidate, "");
        } catch {
          rows.push(["JSON", failure.current, JSON.stringify(candidate)]);
        }
        const body = table.createTBody();
        for (const values of rows.slice(0, 100)) {
          const row = body.insertRow();
          for (const cell of values)
            row.insertCell().textContent = cell.length > 512 ? `${cell.slice(0, 512)}…` : cell;
        }
        if (rows.length > 100 || rows.some((row) => row.some((cell) => cell.length > 512))) {
          const notice = document.createElement("p");
          notice.textContent = text("ui.editor.diff-limit");
          conflict.append(notice);
        }
        const region = document.createElement("div");
        region.setAttribute("role", "region");
        region.setAttribute("aria-label", text("ui.editor.conflict"));
        region.tabIndex = 0;
        region.append(table);
        conflict.append(region);
      }
      error.textContent =
        failure instanceof EditorConflict
          ? text("ui.editor.conflict-help")
          : failure instanceof Error
            ? failure.message
            : text("ui.editor.save-failed");
    } finally {
      busy = false;
      if (!disposed) {
        refresh();
        if (diskConflict !== undefined)
          conflict.querySelector<HTMLElement>('[role="region"]')?.focus();
      }
    }
  }
  picker.addEventListener(
    "change",
    () => {
      if (!canReplace()) {
        if (current) picker.value = `${current.pack.input.id}/${current.file}`;
        return;
      }
      void select(picker.value).catch((failure) => {
        if (current) picker.value = `${current.pack.input.id}/${current.file}`;
        error.textContent = String(failure);
        options.update();
      });
    },
    { signal: events.signal },
  );
  input.addEventListener(
    "change",
    () => {
      if (busy && !folderDialog) return;
      folderDialog = false;
      const files = new Map<string, File>();
      let id = "";
      for (const file of input.files ?? []) {
        const [root, ...parts] = file.webkitRelativePath.split("/");
        if (!id) id = root ?? "";
        if (root !== id) return;
        files.set(parts.join("/"), file);
      }
      if (!files.size) {
        busy = false;
        refresh();
        return;
      }
      busy = true;
      refresh();
      void readEditorPack(id, files)
        .then(accept)
        .catch((failure) => {
          error.textContent = String(failure);
        })
        .finally(() => {
          busy = false;
          refresh();
        });
      input.value = "";
    },
    { signal: events.signal },
  );
  input.addEventListener(
    "cancel",
    () => {
      if (!folderDialog) return;
      folderDialog = false;
      busy = false;
      refresh();
    },
    { signal: events.signal },
  );
  window.addEventListener(
    "beforeunload",
    (event) => {
      if (dirty() || busy || creating) event.preventDefault();
    },
    { signal: events.signal },
  );
  refresh();
  return {
    canReplace,
    dispose() {
      disposed = true;
      selection++;
      events.abort();
      section.remove();
    },
  };
}
