import { expect, test } from "bun:test";
import {
  type ForceStatisticsSnapshot,
  HISTORY_METRICS,
  type SeatSnapshot,
  STAT_COUNTERS,
} from "@open-neo-rts/sim";
import { historySeries } from "../post-match/statistics";
import { replayAnalytics } from "./analytics";

const values = Object.fromEntries(HISTORY_METRICS.map((key) => [key, 0])) as Record<
  (typeof HISTORY_METRICS)[number],
  number
>;
const statistics: ForceStatisticsSnapshot[] = [
  {
    force: 1,
    counters: Object.fromEntries(
      STAT_COUNTERS.map((key) => [key, 0]),
    ) as ForceStatisticsSnapshot["counters"],
    details: {
      controllers: [{ seat: 2, bot: true, orders: 12, ticks: 900, apm: 16 }],
      types: [],
      history: [
        { tick: 0, values: { ...values, credits: 5000, armyCredits: 800 } },
        { tick: 600, values: { ...values, credits: 5500, creditsGathered: 100, armyCredits: 900 } },
        {
          tick: 900,
          values: { ...values, credits: 5500, creditsGathered: 175, armyCredits: 1200 },
        },
      ],
    },
  },
];
test("replay/post-match graphs share actual sampled income and separate recruitment values", () => {
  expect(historySeries(statistics, "creditsIncome")[0]!.points.map((point) => point.value)).toEqual(
    [0, 200, 300],
  );
  expect(historySeries(statistics, "armyCredits")[0]!.points.map((point) => point.value)).toEqual([
    800, 900, 1200,
  ]);
  const snapshot: SeatSnapshot = { tick: 900, mode: "controlled", entities: [] };
  expect(
    replayAnalytics(
      "economy",
      "creditsIncome",
      statistics,
      snapshot,
      [],
    ).chart!.series[0]!.points.at(-1)!.value,
  ).toBe(300);
  expect(
    replayAnalytics("orders", "creditsIncome", statistics, snapshot, []).table.rows[0],
  ).toEqual(["Force 2", "Bot seat 2", "16", "12", "0:45"]);
  expect(
    replayAnalytics("production", "creditsIncome", statistics, snapshot, []).table.rows,
  ).toEqual([]);
});
