import {
  type BattlefieldAction,
  type BattlefieldHudContent,
  createBattlefieldHud,
} from "@open-neo-rts/render";
import { text } from "../../shared";
import { visiblePanelElement } from "../../shared/panel-content";
import { hudIcon } from "./icons";

/** Existing HUD controllers remain authoritative. This binding copies their display values only. */
export function mountNativeMatchHud(
  root: HTMLElement,
  canvas: HTMLCanvasElement,
  scene: Parameters<typeof createBattlefieldHud>[0],
  minimap: {
    canvas: HTMLCanvasElement;
    navigate: (x: number, y: number, button: number, shift: boolean, alt: boolean) => void;
    zoom: (delta: number) => void;
  },
  signal: AbortSignal,
) {
  const off = new AbortController();
  const identities = new WeakMap<HTMLElement, string>();
  let identity = 0,
    ctrl = false,
    shift = false;
  let disposed = false;
  const identify = (element: HTMLElement) => {
    let id = identities.get(element);
    if (!id) {
      id = `battlefield-action-${++identity}`;
      identities.set(element, id);
      element.dataset.nativeHud = id;
    }
    return id;
  };
  const image = (source: Element | null) => {
    const asset = source?.querySelector<HTMLImageElement>("img");
    if (asset) return asset.src;
    const svg = source?.querySelector("svg");
    if (!svg) return undefined;
    const clone = svg.cloneNode(true) as SVGElement;
    clone.setAttribute("width", "24");
    clone.setAttribute("height", "24");
    return `data:image/svg+xml,${encodeURIComponent(new XMLSerializer().serializeToString(clone).replaceAll("currentColor", "#ddc382"))}`;
  };
  const fallback = document.createElement("span");
  fallback.append(hudIcon("cancel"));
  const cancelIcon = image(fallback);
  const action = (button: HTMLButtonElement): BattlefieldAction => {
    const row = button.closest("[data-order-queue] > div");
    const context =
      row?.firstChild?.nodeType === Node.TEXT_NODE
        ? row.firstChild.textContent
        : button.closest("[data-site]")?.querySelector("button")?.textContent;
    return {
      id: identify(button),
      label: button.getAttribute("aria-label") ?? button.textContent ?? "",
      tooltip:
        button.dataset.recipeInfo ??
        [context, button.getAttribute("aria-label") ?? button.textContent, button.title]
          .filter(Boolean)
          .join("\n"),
      image: image(button),
      key: button.dataset.hotkey,
      badge: row ? context?.match(/^\d+/)?.[0] : undefined,
      disabled: button.disabled || button.getAttribute("aria-disabled") === "true",
      active: button.getAttribute("aria-pressed") === "true",
      activate: () => {
        if (disposed || button.disabled) return;
        button.click();
        if (!root.querySelector("dialog[open]")) canvas.focus({ preventScroll: true });
        update();
      },
    };
  };
  const buttons = (selector: string) =>
    [...root.querySelectorAll<HTMLButtonElement>(selector)].filter(visiblePanelElement).map(action);
  const gui = createBattlefieldHud(scene, canvas, minimap.canvas, {
    map: (point, button, shift, alt) => {
      minimap.navigate(point.x, point.y, button, shift, alt);
      update();
    },
    mapFocus: () => minimap.canvas.focus({ preventScroll: true }),
    mapZoom: minimap.zoom,
  });
  function snapshot(): BattlefieldHudContent {
    const health = root.querySelector<HTMLProgressElement>("[data-health]");
    const typeButtons = buttons("[data-types] button");
    const label = typeButtons.map((button) => button.label).join(" · ");
    const groups = buttons("[data-groups] button").map((item, i) => {
      const source = root.querySelectorAll<HTMLButtonElement>("[data-groups] button")[i]!;
      const group = i === 9 ? 0 : i + 1;
      const count = source.dataset.count ?? source.textContent?.split(":")[1]?.trim() ?? "0";
      return {
        ...item,
        label: String(group),
        badge: count === "0" ? "" : `×${count}`,
        tooltip: `${text("ui.hud.select-group", { group })} · ${count}\nCtrl+${group}: ${text("ui.hud.set-group")}\nCtrl+Shift+${group}: ${text("ui.hud.add-group")}`,
        activate: () => {
          if (ctrl) {
            const index = root.querySelector<HTMLSelectElement>("[data-group-index]");
            if (index) index.value = String(group);
            root
              .querySelector<HTMLButtonElement>(shift ? "[data-add-group]" : "[data-set-group]")
              ?.click();
            update();
          } else item.activate();
        },
      };
    });
    const helpers = buttons("[data-idle-builder],[data-idle-producer]").map((item, i) => {
      const span = document.createElement("span");
      span.append(hudIcon(i ? "rally" : "build"));
      return {
        ...item,
        image: image(span),
        key: i ? "," : ".",
        badge: item.label.match(/\d+/)?.[0] ?? "0",
      };
    });
    const queue = [...root.querySelectorAll<HTMLElement>("[data-queue] li")].flatMap((row, i) => {
      const button = row.querySelector<HTMLButtonElement>("button");
      const recipe = root.querySelector<HTMLImageElement>(
        `[data-catalog] [data-definition="${row.dataset.definition}"] img`,
      );
      return [
        {
          ...(button
            ? action(button)
            : {
                id: identify(row),
                label: row.textContent ?? "",
                tooltip: row.textContent ?? "",
                disabled: true,
                active: false,
                activate: () => {},
              }),
          image: recipe?.src ?? cancelIcon,
          badge: String(i + 1),
          progress: Number.parseInt(row.dataset.progress ?? "0", 10),
          tooltip: row.textContent ?? "",
        },
      ];
    });
    const commands = buttons("[data-commands] button").filter(
      (item) =>
        root.querySelector<HTMLElement>(`[data-native-hud="${item.id}"]`)?.dataset.available !==
        "false",
    );
    const modeText = root.querySelector("[data-mode]")?.textContent ?? "";
    const modeLabel =
      canvas.dataset.commandMode === "economy.build"
        ? modeText.split(" · ").slice(0, 2).join(" · ")
        : modeText.split(":")[0];
    const ping = root.querySelector<HTMLSelectElement>(".minimap-pings select");
    const mapActions = buttons(".minimap-controls > button,.minimap-pings button");
    const pingIcon = document.createElement("span");
    pingIcon.append(
      hudIcon(
        (["assault", "hold", "move", "attack", "repair"] as const)[ping?.selectedIndex ?? 0] ??
          "assault",
      ),
    );
    if (ping)
      mapActions.push({
        id: identify(ping),
        label: text("ui.minimap.pings"),
        tooltip: `${text("ui.minimap.pings")} · ${ping.selectedOptions[0]?.text ?? ""}\nAlt + click`,
        disabled: false,
        active: false,
        image: image(pingIcon),
        activate: () => {
          ping.selectedIndex = (ping.selectedIndex + 1) % ping.options.length;
          ping.dispatchEvent(new Event("change", { bubbles: true }));
          update();
        },
      });
    const details = [
      ...typeButtons,
      ...buttons(
        "[data-order-queue] button,.hud-sites button,[data-requests] button,[data-set-group],[data-add-group]",
      ),
    ];
    const groupIndex = root.querySelector<HTMLSelectElement>("[data-group-index]");
    if (groupIndex)
      details.push({
        id: identify(groupIndex),
        label: `${text("ui.hud.group")} ${groupIndex.value}`,
        tooltip: text("ui.hud.groups"),
        disabled: false,
        active: false,
        activate: () => {
          groupIndex.selectedIndex = (groupIndex.selectedIndex + 1) % groupIndex.options.length;
          groupIndex.dispatchEvent(new Event("change", { bubbles: true }));
          update();
        },
      });
    return {
      scale: (Number.parseFloat(document.documentElement.style.fontSize) || 100) / 100,
      resources: [
        ...root.querySelectorAll<HTMLElement>(".match-top > span:not([data-save-notice])"),
      ]
        .filter((node) => !node.hidden)
        .map((node) => ({
          id: identify(node),
          label: (node.textContent ?? "").replace(/^[^\d−-]*/, ""),
          tooltip: node.title || node.textContent || "",
          image: image(node),
        })),
      top: buttons(".match-top > button"),
      selection: {
        label: label || text("ui.hud.selection"),
        image: health?.hidden
          ? undefined
          : (root.querySelector<HTMLImageElement>("[data-portrait]")?.getAttribute("src") ??
            undefined),
        health: health?.hidden ? 0 : (health?.value ?? 0),
        maxHealth: health?.hidden ? 0 : (health?.max ?? 0),
        details: root.querySelector("[data-details]")?.textContent ?? "",
      },
      commands: health?.hidden ? [] : commands,
      recipes: buttons("[data-catalog] > button"),
      queue,
      details,
      groups,
      helpers,
      mapActions,
      notices: buttons(".match-notices button"),
      mode: canvas.dataset.commandMode ? `${modeLabel} · Shift · Esc` : "",
      feedback: [
        root.querySelector<HTMLElement>("[data-result]")?.dataset.feedbackKey === "ui.hud.accepted"
          ? ""
          : root.querySelector("[data-result]")?.textContent,
        root.querySelector(".hud-minimap [role=status]")?.textContent,
      ]
        .filter(Boolean)
        .join(" · "),
    };
  }
  function update() {
    if (!disposed) gui.update(snapshot());
  }
  const modifiers = (event: KeyboardEvent | PointerEvent) => {
    ctrl = event.ctrlKey || event.metaKey;
    shift = event.shiftKey;
  };
  window.addEventListener("keydown", modifiers, { capture: true, signal: off.signal });
  window.addEventListener("keyup", modifiers, { capture: true, signal: off.signal });
  canvas.addEventListener("pointerdown", modifiers, { capture: true, signal: off.signal });
  root.addEventListener(
    "focusin",
    (event) => {
      const node = event.target;
      if (node instanceof HTMLElement)
        gui.focus(
          node === minimap.canvas
            ? "minimap"
            : node.matches("[data-details]")
              ? "inspect"
              : node.dataset.nativeHud,
        );
    },
    { signal: off.signal },
  );
  root.addEventListener("click", update, { signal: off.signal });
  root.addEventListener("change", update, { signal: off.signal });
  window.addEventListener(
    "focusin",
    (event) => {
      if (event.target === canvas) gui.focus();
    },
    { signal: off.signal },
  );
  window.addEventListener(
    "keydown",
    (event) => {
      if (
        (event.target === canvas || event.target === minimap.canvas) &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        !event.repeat &&
        !root.querySelector("dialog[open]") &&
        gui.shortcut(event.code)
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      if (event.key === "Escape" && !root.querySelector("dialog[open]") && gui.close()) {
        event.preventDefault();
        event.stopImmediatePropagation();
        canvas.focus();
      }
    },
    { capture: true, signal: off.signal },
  );
  update();
  void gui.drawn().then(() => {
    if (!disposed) {
      root.classList.add("native-battlefield");
      const ping = root.querySelector<HTMLDetailsElement>(".minimap-pings");
      if (ping) ping.open = true;
      canvas.dataset.hud = "native";
      update();
    }
  });
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    off.abort();
    gui.dispose();
    root.classList.remove("native-battlefield");
    delete canvas.dataset.hud;
  };
  signal.addEventListener("abort", dispose, { once: true });
  return {
    update,
    frame: () => {
      if (!disposed) gui.frame();
    },
    box: (rect: { x: number; y: number; width: number; height: number } | null) => {
      if (disposed) return;
      const bounds = canvas.getBoundingClientRect();
      gui.selectionRectangle(
        rect ? { ...rect, x: rect.x - bounds.left, y: rect.y - bounds.top } : null,
      );
    },
    blocksPointer: (x: number, y: number) => {
      const bounds = canvas.getBoundingClientRect();
      return gui.blocksPointer(x - bounds.left, y - bounds.top);
    },
    dispose,
  };
}
