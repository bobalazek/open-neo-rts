import type { ForceStatisticsSnapshot, HistoryMetric } from "@open-neo-rts/sim";
import { text } from "../../shared";

type DefinitionLabel = { id: string; name: string; kind: string };
export const metricLabels = {
  credits: "ui.stats.credits-stock",
  materials: "ui.stats.materials-stock",
  industrialCapacity: "ui.stats.industrial-stock",
  salvagePoints: "ui.stats.salvage-stock",
  creditsGathered: "ui.stats.credits-earned",
  materialsGathered: "ui.stats.materials-earned",
  industrialCapacityGathered: "ui.stats.industrial-earned",
  salvagePointsGathered: "ui.stats.salvage-earned",
  creditsIncome: "ui.stats.credits-income",
  materialsIncome: "ui.stats.materials-income",
  industrialIncome: "ui.stats.industrial-income",
  salvageIncome: "ui.stats.salvage-income",
  units: "ui.stats.units",
  structures: "ui.stats.structures",
  armyUnits: "ui.stats.army-units",
  armyCredits: "ui.stats.army-credits",
  armyMaterials: "ui.stats.army-materials",
  armyIndustrialCapacity: "ui.stats.army-industrial",
  armySalvagePoints: "ui.stats.army-salvage",
} as const;
export type ChartMetric = keyof typeof metricLabels;
const incomeMetrics: Partial<Record<ChartMetric, HistoryMetric>> = {
  creditsIncome: "creditsGathered",
  materialsIncome: "materialsGathered",
  industrialIncome: "industrialCapacityGathered",
  salvageIncome: "salvagePointsGathered",
};
export const colors = [
  "#e87870",
  "#75b9ec",
  "#eac674",
  "#9bd89b",
  "#d6a4e9",
  "#83d2d0",
  "#eaa6c1",
  "#c1cbd7",
];
const duration = (ticks: number) =>
  `${Math.floor(ticks / 1200)}:${String(Math.floor(ticks / 20) % 60).padStart(2, "0")}`;
const forceName = (force: number) => text("ui.result.other-force", { force: force + 1 });

/** Shared sampled graph values; starting stock/refunds never count as gathered income. */
export function historySeries(statistics: readonly ForceStatisticsSnapshot[], metric: ChartMetric) {
  const income = incomeMetrics[metric];
  return statistics
    .filter((row) => row.details)
    .map((row) => ({
      force: row.force,
      points: row.details!.history.map((point, index, points) => ({
        tick: point.tick,
        value: income
          ? index
            ? Math.floor(
                ((point.values[income] - points[index - 1]!.values[income]) * 1200) /
                  (point.tick - points[index - 1]!.tick),
              )
            : 0
          : point.values[metric as HistoryMetric],
      })),
    }));
}

export function table(headers: string[], rows: (string | number)[][], caption: string) {
  const scroll = document.createElement("div");
  scroll.className = "result-totals";
  scroll.tabIndex = 0;
  scroll.setAttribute("role", "region");
  scroll.setAttribute("aria-label", caption);
  const result = document.createElement("table"),
    title = result.createCaption();
  title.textContent = caption;
  const heading = result.createTHead().insertRow();
  for (const label of headers) {
    const cell = document.createElement("th");
    cell.scope = "col";
    cell.textContent = label;
    heading.append(cell);
  }
  const body = result.createTBody();
  for (const values of rows) {
    const row = body.insertRow();
    for (const [index, value] of values.entries()) {
      const cell = document.createElement(index ? "td" : "th");
      if (!index) cell.setAttribute("scope", "row");
      cell.textContent = String(value);
      row.append(cell);
    }
  }
  scroll.append(result);
  return scroll;
}

function history(
  root: HTMLElement,
  statistics: ForceStatisticsSnapshot[],
  metrics: readonly ChartMetric[],
) {
  const label = document.createElement("label"),
    select = document.createElement("select");
  label.textContent = text("ui.stats.metric");
  for (const metric of metrics) {
    const option = new Option(text(metricLabels[metric]), metric);
    select.append(option);
  }
  label.append(select);
  root.append(label);
  const graph = document.createElement("div");
  graph.className = "result-history";
  root.append(graph);
  const render = () => {
    graph.replaceChildren();
    const metric = select.value as ChartMetric;
    const series = historySeries(statistics, metric);
    const maxTick = Math.max(1, ...series.flatMap((row) => row.points.map((point) => point.tick)));
    const maxValue = Math.max(
      1,
      ...series.flatMap((row) => row.points.map((point) => point.value)),
    );
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 560 220");
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", text(metricLabels[metric]));
    const axis = document.createElementNS(svg.namespaceURI, "path");
    axis.setAttribute("d", "M56 12V182H550");
    axis.setAttribute("fill", "none");
    axis.setAttribute("stroke", "currentColor");
    svg.append(axis);
    for (const [x, y, value] of [
      [4, 20, String(maxValue)],
      [30, 182, "0"],
      [56, 208, "0:00"],
      [495, 208, duration(maxTick)],
    ] as const) {
      const label = document.createElementNS(svg.namespaceURI, "text");
      label.setAttribute("x", String(x));
      label.setAttribute("y", String(y));
      label.setAttribute("fill", "currentColor");
      label.textContent = value;
      svg.append(label);
    }
    const legend = document.createElement("p");
    for (const [index, row] of series.entries()) {
      const line = document.createElementNS(svg.namespaceURI, "polyline");
      line.setAttribute(
        "points",
        row.points
          .map(
            (point) =>
              `${56 + (point.tick / maxTick) * 494},${182 - (point.value / maxValue) * 170}`,
          )
          .join(" "),
      );
      line.setAttribute("fill", "none");
      line.setAttribute("stroke", colors[index % colors.length]!);
      line.setAttribute("stroke-width", "2");
      if (index % 2) line.setAttribute("stroke-dasharray", "6 3");
      svg.append(line);
      const item = document.createElement("span");
      item.style.color = colors[index % colors.length]!;
      item.textContent = `${forceName(row.force)}${index % 2 ? " ⋯" : " ━"} `;
      legend.append(item);
    }
    graph.append(svg, legend);
    const values = document.createElement("details"),
      summary = document.createElement("summary");
    summary.textContent = text("ui.stats.sampled-values");
    values.append(summary);
    values.append(
      table(
        [text("ui.result.force"), text("ui.stats.time"), text(metricLabels[metric])],
        series.flatMap((row) =>
          row.points.map((point) => [forceName(row.force), duration(point.tick), point.value]),
        ),
        text(metricLabels[metric]),
      ),
    );
    graph.append(values);
    const note = document.createElement("p");
    note.textContent = text("ui.stats.history-note");
    graph.append(note);
  };
  select.addEventListener("change", render);
  render();
}

/** Only final copied observations enter this view; no gameplay or hidden world is consulted. */
export function mountDetailedStatistics(
  dialog: HTMLDialogElement,
  summary: HTMLElement,
  statistics: ForceStatisticsSnapshot[],
  definitions: readonly DefinitionLabel[],
) {
  if (!statistics.some((row) => row.details)) return;
  const container = document.createElement("section"),
    tabs = document.createElement("div");
  tabs.className = "result-tabs";
  tabs.setAttribute("role", "tablist");
  tabs.setAttribute("aria-label", text("ui.stats.views"));
  summary.before(container);
  container.append(tabs);
  const panels: HTMLElement[] = [],
    buttons: HTMLButtonElement[] = [];
  const pages = [
    "ui.stats.summary",
    "ui.stats.economy",
    "ui.stats.military",
    "ui.stats.structures",
    "ui.stats.orders",
  ] as const;
  const activate = (index: number, focus = false) => {
    buttons.forEach((button, i) => {
      button.setAttribute("aria-selected", String(index === i));
      button.tabIndex = index === i ? 0 : -1;
      panels[i]!.hidden = index !== i;
    });
    if (focus) buttons[index]?.focus();
  };
  for (const [index, name] of pages.entries()) {
    const button = document.createElement("button"),
      panel = document.createElement("section");
    button.type = "button";
    button.textContent = text(name);
    button.id = `result-tab-${index}`;
    button.setAttribute("role", "tab");
    button.setAttribute("aria-controls", `result-panel-${index}`);
    panel.id = `result-panel-${index}`;
    panel.setAttribute("role", "tabpanel");
    panel.setAttribute("aria-labelledby", button.id);
    panel.tabIndex = 0;
    tabs.append(button);
    container.append(panel);
    buttons.push(button);
    panels.push(panel);
    button.addEventListener("click", () => activate(index));
    button.addEventListener("keydown", (event) => {
      const next =
        event.code === "Home"
          ? 0
          : event.code === "End"
            ? pages.length - 1
            : event.code === "ArrowRight"
              ? (index + 1) % pages.length
              : event.code === "ArrowLeft"
                ? (index + pages.length - 1) % pages.length
                : undefined;
      if (next !== undefined) {
        event.preventDefault();
        event.stopPropagation();
        activate(next, true);
      }
    });
  }
  const legend = dialog.querySelector(".result-totals-legend");
  if (legend) panels[0]!.append(legend);
  panels[0]!.append(summary);
  history(panels[1]!, statistics, [
    "credits",
    "creditsIncome",
    "creditsGathered",
    "materials",
    "materialsIncome",
    "materialsGathered",
    "industrialCapacity",
    "industrialIncome",
    "industrialCapacityGathered",
    "salvagePoints",
    "salvageIncome",
    "salvagePointsGathered",
  ]);
  for (const [index, kind] of [
    [2, "unit"],
    [3, "structure"],
  ] as const) {
    history(
      panels[index]!,
      statistics,
      kind === "unit"
        ? [
            "armyCredits",
            "armyMaterials",
            "armyIndustrialCapacity",
            "armySalvagePoints",
            "armyUnits",
            "units",
          ]
        : ["structures"],
    );
    const note = document.createElement("p");
    note.textContent = text(kind === "unit" ? "ui.stats.army-note" : "ui.stats.types-note");
    panels[index]!.append(note);
    const rows = statistics.flatMap((force) =>
      (force.details?.types ?? [])
        .filter(
          (type) =>
            (definitions.find((definition) => definition.id === type.definition)?.kind ??
              type.definition.split(":")[0]?.split(".").at(-1)) === kind,
        )
        .map((type) => [
          forceName(force.force),
          definitions.find((definition) => definition.id === type.definition)?.name ??
            type.definition,
          type.built,
          type.lost,
          type.destroyed,
          type.remaining,
        ]),
    );
    panels[index]!.append(
      table(
        [
          text("ui.result.force"),
          text("ui.stats.type"),
          text("ui.stats.built"),
          text("ui.stats.lost"),
          text("ui.stats.destroyed"),
          text("ui.stats.remaining"),
        ],
        rows,
        text(kind === "unit" ? "ui.stats.military" : "ui.stats.structures"),
      ),
    );
  }
  const note = document.createElement("p");
  note.textContent = text("ui.stats.orders-note");
  panels[4]!.append(note);
  panels[4]!.append(
    table(
      [
        text("ui.result.force"),
        text("ui.stats.controller"),
        text("ui.stats.order-count"),
        text("ui.stats.active-time"),
        text("ui.stats.order-apm"),
      ],
      statistics.flatMap((force) =>
        (force.details?.controllers ?? []).map((controller) => [
          forceName(force.force),
          text(controller.bot ? "ui.stats.bot-seat" : "ui.stats.human-seat", {
            seat: controller.seat,
          }),
          controller.orders,
          duration(controller.ticks),
          controller.apm,
        ]),
      ),
      text("ui.stats.orders"),
    ),
  );
  activate(0);
}
