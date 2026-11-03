import { setText } from "../../shared";

// Original line pictograms; game model thumbnails remain the authored content icons.
const paths = {
  move: "M4 12h15m-6-6 6 6-6 6",
  attack: "M12 3v4m0 10v4M3 12h4m10 0h4M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8",
  harvest: "m5 20 12-13M4 7l4-3 12 7-3 3L8 7Z",
  rally: "M6 21V3m1 1h12l-3 4 3 4H7",
  assault: "m3 18 7-7m-5 0h5v5m3-7 5-5m-5 0h5v5m-3 7 4-4m-4 0h4v4",
  stop: "M6 6h12v12H6Z",
  build: "m4 20 9-9m-5-7 4-2 8 8-3 3-4-4-2 2-4-4Z",
  repair: "m4 20 8-8m1-8a6 6 0 0 0 7 7l-4-4 1-3Z",
  cancel: "m6 6 12 12M18 6 6 18",
  power: "M12 3v9m-5-7a8 8 0 1 0 10 0",
  sell: "M4 6h11l5 6-5 6H4Zm4 3v6m3-6v6",
  rotate: "M19 8a8 8 0 1 0 1 8M19 3v6h-6",
  hold: "M5 4h14v8l-7 9-7-9ZM9 9v5m6-5v5",
  salvage: "m4 17 4-9h8l4 9H4Zm3-12 2-2m6 0 2 2M9 12h6",
  deploy: "M4 8h16v8H4Zm4 0V4m8 4V4M8 16v4m8-4v4",
  load: "M3 5h12v5m0 4v5H3m7-7h11m-4-4 4 4-4 4",
  unload: "M21 5H9v5m0 4v5h12M14 12H3m4-4-4 4 4 4",
  surge: "m14 2-9 12h7l-2 8 9-12h-7Z",
  credits: "M5 5h14v14H5ZM9 9h6v6H9Z",
  materials: "m12 3 9 5v9l-9 5-9-5V8Zm-9 5 9 5 9-5m-9 5v9",
  population:
    "M9 4a3 3 0 1 0 0 6 3 3 0 0 0 0-6M3 20v-4a6 6 0 0 1 12 0v4m3-15a3 3 0 0 1 0 6m0 3a5 5 0 0 1 3 5",
  clock: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18m0 4v6l4 2",
  menu: "M4 6h16M4 12h16M4 18h16",
  pause: "M8 5v14m8-14v14",
  exit: "M10 4H4v16h6m3-13 5 5-5 5m-5-5h10",
  surrender: "M6 21V3l13 3-13 6",
} as const;
export type HudIcon = keyof typeof paths;

export function hudIcon(name: HudIcon) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.7");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  const path = document.createElementNS(svg.namespaceURI, "path");
  path.setAttribute("d", paths[name]);
  svg.append(path);
  return svg;
}

export function actionText(button: HTMLButtonElement, value: string) {
  button.setAttribute("aria-label", value);
  button.title = value;
  setText(button.querySelector(".hud-action-label") ?? button, value);
}

export function decorateAction(button: HTMLButtonElement, name: HudIcon, key = "") {
  const label = button.textContent ?? "";
  const span = document.createElement("span");
  span.className = "hud-action-label";
  span.textContent = label;
  button.replaceChildren(hudIcon(name), span);
  button.classList.add("hud-action");
  button.dataset.hotkey = key;
  actionText(button, label);
}
