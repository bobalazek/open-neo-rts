import type { PanelBlock } from "@open-neo-rts/render";

export function visiblePanelElement(element: Element) {
  if (element.closest("[hidden]")) return false;
  for (let parent = element.parentElement; parent; parent = parent.parentElement)
    if (
      parent instanceof HTMLDetailsElement &&
      !parent.open &&
      !parent.querySelector("summary")?.contains(element)
    )
      return false;
  return true;
}

export function panelBlocks(
  scope: Element,
  identify: (element: HTMLElement) => string,
): { blocks: PanelBlock[]; nodes: Element[] } {
  const blocks: PanelBlock[] = [];
  const nodes: Element[] = [];
  const visit = (element: Element) => {
    if (!visiblePanelElement(element)) return;
    if (element instanceof HTMLTableElement) {
      const region = element.closest<HTMLElement>('[role="region"]') ?? element;
      nodes.push(region, element);
      blocks.push({
        kind: "table",
        id: identify(region),
        caption: element.caption?.textContent ?? region.getAttribute("aria-label") ?? "",
        headers: [...(element.tHead?.rows[0]?.cells ?? [])].map((cell) => cell.textContent ?? ""),
        rows: [...element.tBodies].flatMap((body) =>
          [...body.rows].map((row) => [...row.cells].map((cell) => cell.textContent ?? "")),
        ),
      });
      return;
    }
    if (element instanceof HTMLImageElement) {
      nodes.push(element);
      blocks.push({
        kind: "image",
        id: identify(element),
        source: element.src,
        caption: "",
        width: Number(element.getAttribute("width")) || 320,
        height: Number(element.getAttribute("height")) || 180,
      });
      return;
    }
    if (element instanceof SVGSVGElement) {
      const clone = element.cloneNode(true) as SVGSVGElement;
      clone.setAttribute("width", "560");
      clone.setAttribute("height", "220");
      clone.setAttribute("font-family", "Arial");
      clone.setAttribute("font-size", "12");
      const source = new XMLSerializer()
        .serializeToString(clone)
        .replaceAll("currentColor", "#b5c0bf");
      const host = element.parentElement!;
      nodes.push(host, element);
      blocks.push({
        kind: "image",
        id: identify(host),
        source: `data:image/svg+xml,${encodeURIComponent(source)}`,
        caption: element.getAttribute("aria-label") ?? "",
        width: 760,
        height: (760 * 220) / 560,
      });
      return;
    }
    if (element instanceof HTMLDetailsElement) {
      const summary = element.querySelector("summary");
      if (summary) {
        nodes.push(summary);
        blocks.push({
          kind: "button",
          id: identify(summary),
          text: summary.textContent ?? "",
          caption: "",
          active: element.open,
          disabled: false,
          activate: () => {
            summary.focus({ preventScroll: true });
            summary.click();
          },
        });
      }
      if (element.open) for (const child of element.children) if (child !== summary) visit(child);
      return;
    }
    if (element.matches("p:not([role]),h2,h3")) {
      nodes.push(element as HTMLElement);
      blocks.push({
        kind: "text",
        id: identify(element as HTMLElement),
        text: element.textContent ?? "",
        heading: element.matches("h2,h3"),
      });
      return;
    }
    if (element.matches("button,label,select,input,h1,summary")) return;
    for (const child of element.children) visit(child);
  };
  for (const child of scope.children) visit(child);
  return { blocks, nodes };
}

export function saveGallery(scope: HTMLElement, identify: (element: HTMLElement) => string) {
  const list = scope.querySelector<HTMLElement>("[data-save-list]");
  const detail = scope.querySelector<HTMLElement>("[data-save-detail]");
  if (!list || !detail) return undefined;
  const nodes: HTMLElement[] = [];
  const items: PanelBlock[] = [...list.children].flatMap((element): PanelBlock[] => {
    if (element instanceof HTMLButtonElement) {
      nodes.push(element);
      return [
        {
          kind: "button" as const,
          id: identify(element),
          text: [...element.childNodes]
            .filter((node) => node.nodeType === Node.TEXT_NODE)
            .map((node) => node.textContent)
            .join("")
            .trim(),
          caption: element.querySelector("small")?.textContent ?? "",
          image: element.querySelector("img")?.src,
          active: element.getAttribute("aria-pressed") === "true",
          disabled: element.disabled,
          activate: () => {
            element.focus({ preventScroll: true });
            element.click();
          },
        },
      ];
    }
    nodes.push(element as HTMLElement);
    return [
      { kind: "text", id: identify(element as HTMLElement), text: element.textContent ?? "" },
    ];
  });
  const selected = panelBlocks(detail, identify);
  return { items, detail: selected.blocks, nodes: [...nodes, ...selected.nodes] };
}
