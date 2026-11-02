import { expect, test } from "bun:test";
import {
  type ForceStatisticsSnapshot,
  STAT_COUNTERS,
  type VictorySnapshot,
} from "@open-neo-rts/sim";
import { matchResult } from ".";

const victory: VictorySnapshot = {
  rule: "annihilation",
  forces: [
    { force: 0, team: 3, reason: "active", tick: null },
    { force: 1, team: 8, reason: "surrendered", tick: 1501 },
  ],
  result: { winner: 3, reason: "lastManStanding", tick: 1501 },
};

test("result uses winning team, real duration and per-Force surrender reason", () => {
  const before = JSON.stringify(victory);
  expect(matchResult(victory, 0)).toEqual({
    title: "Victory",
    winner: "Team 4 wins",
    duration: "1:15",
    rule: "Last Man Standing · all units and structures",
    rows: [
      { name: "Your Force", status: "Survived" },
      { name: "Force 2", status: "Surrendered" },
    ],
  });
  expect(matchResult(victory, 1)?.title).toBe("Defeat");
  expect(JSON.stringify(victory)).toBe(before);
});

test("draw and unfinished matches cannot become a fabricated win", () => {
  expect(matchResult({ ...victory, result: null }, 0)).toBeNull();
  const draw = matchResult({ ...victory, result: { tick: 20, winner: null, reason: "draw" } }, 0);
  expect(draw?.title).toBe("Draw");
  expect(draw?.winner).toBe("No team remains");
  expect(draw?.duration).toBe("0:01");
});

test("final totals match Force IDs and preserve separate production, combat and resource counts", () => {
  const counters = Object.fromEntries(
    STAT_COUNTERS.map((key) => [key, 0]),
  ) as ForceStatisticsSnapshot["counters"];
  const statistics = [
    {
      force: 1,
      counters: {
        ...counters,
        unitsBuilt: 2,
        unitsLost: 1,
        unitsDestroyed: 5,
        creditsGathered: 90,
        creditsSpent: 70,
        creditsRefunded: 10,
        materialsGathered: 3,
        materialsSpent: 1,
      },
    },
  ];
  const before = JSON.stringify(statistics);
  const result = matchResult(victory, 0, statistics);
  expect(result?.rows[0]?.totals).toBeUndefined();
  expect(result?.rows[1]?.totals).toEqual([
    "2 / 1 / 5",
    "0 / 0 / 0",
    "90 / 70 / 10",
    "3 / 1 / 0",
    "0 / 0 / 0",
    "0 / 0 / 0",
  ]);
  expect(JSON.stringify(statistics)).toBe(before);
});
