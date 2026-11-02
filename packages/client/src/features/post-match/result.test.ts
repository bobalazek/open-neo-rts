import { expect, test } from "bun:test";
import type { VictorySnapshot } from "@open-neo-rts/sim";
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
