import type { ReplayHudContent } from "@open-neo-rts/render";
import type { ForceStatisticsSnapshot, SeatSnapshot } from "@open-neo-rts/sim";
import { text } from "../../shared";
import { workState } from "../match/hud";
import { type ChartMetric, colors, historySeries, metricLabels } from "../post-match/statistics";
import { replayTime } from "./storage";

export const STATISTIC_VIEWS = ["economy", "military", "production", "orders"] as const;
export type StatisticView = (typeof STATISTIC_VIEWS)[number];
export const replayMetrics: Record<"economy" | "military", readonly ChartMetric[]> = {
  economy: [
    "creditsIncome",
    "materialsIncome",
    "industrialIncome",
    "salvageIncome",
    "credits",
    "materials",
    "industrialCapacity",
    "salvagePoints",
  ],
  military: [
    "armyCredits",
    "armyMaterials",
    "armyIndustrialCapacity",
    "armySalvagePoints",
    "armyUnits",
    "units",
  ],
};
export const viewLabel = (view: StatisticView) =>
  text(view === "production" || view === "orders" ? `ui.replays.${view}` : `ui.stats.${view}`);
const forceName = (force: number) => text("ui.result.other-force", { force: force + 1 });

/** Presentation consumes only current, permitted copies from the isolated replay host. */
export function replayAnalytics(
  view: StatisticView,
  metric: ChartMetric,
  statistics: readonly ForceStatisticsSnapshot[],
  snapshot: SeatSnapshot,
  definitions: readonly { id: string; name: string; image?: string }[],
): NonNullable<ReplayHudContent["statistics"]> {
  const label = (id: string) => definitions.find((definition) => definition.id === id)?.name ?? id;
  if (view === "economy" || view === "military") {
    const series = historySeries(statistics, metric);
    return {
      chart: {
        tick: snapshot.tick,
        series: series.map((row, index) => ({
          ...row,
          label: forceName(row.force),
          color: colors[index % colors.length]!,
        })),
      },
      table: {
        kind: "table",
        id: "statistics-values",
        caption: text(metricLabels[metric]),
        headers: [text("ui.result.force"), text("ui.stats.time"), text(metricLabels[metric])],
        rows: series.flatMap((row) =>
          row.points.map((point) => [
            forceName(row.force),
            replayTime(point.tick),
            String(point.value),
          ]),
        ),
      },
    };
  }
  return {
    ...(view === "production" && {
      production: snapshot.entities
        .filter((entity) => entity.production?.queue.length)
        .map((entity) => ({
          id: entity.handle,
          label: `${forceName(entity.force)} · ${label(entity.definition)}`,
          items: entity.production!.queue.map((item) => ({
            id: item.handle,
            image: definitions.find((definition) => definition.id === item.definition)?.image,
            label: label(item.definition),
            state: workState(item.state),
            progress: Math.floor((item.completedTicks * 100) / item.totalTicks),
          })),
        })),
    }),
    table: {
      kind: "table",
      id: "statistics-values",
      caption: viewLabel(view),
      headers:
        view === "orders"
          ? [
              text("ui.result.force"),
              text("ui.stats.controller"),
              text("ui.stats.order-apm"),
              text("ui.stats.order-count"),
              text("ui.stats.active-time"),
            ]
          : [
              text("ui.result.force"),
              text("ui.replays.producer"),
              text("ui.stats.type"),
              text("ui.replays.production-state"),
              text("ui.replays.progress"),
            ],
      rows:
        view === "orders"
          ? statistics.flatMap((force) =>
              (force.details?.controllers ?? []).map((controller) => [
                forceName(force.force),
                text(controller.bot ? "ui.stats.bot-seat" : "ui.stats.human-seat", {
                  seat: controller.seat,
                }),
                String(controller.apm),
                String(controller.orders),
                replayTime(controller.ticks),
              ]),
            )
          : snapshot.entities.flatMap((entity) =>
              (entity.production?.queue ?? []).map((item) => [
                forceName(entity.force),
                label(entity.definition),
                label(item.definition),
                workState(item.state),
                `${Math.floor((item.completedTicks * 100) / item.totalTicks)}%`,
              ]),
            ),
    },
  };
}
