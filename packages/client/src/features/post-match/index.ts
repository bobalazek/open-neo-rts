// Canonical result summary and local rematch navigation. Phase 2.
import type { ForceStatisticsSnapshot, VictorySnapshot } from "@open-neo-rts/sim";
import { text } from "../../shared";

const columns = [
  { label: "ui.result.units", keys: ["unitsBuilt", "unitsLost", "unitsDestroyed"] },
  {
    label: "ui.result.structures",
    keys: ["structuresBuilt", "structuresLost", "structuresDestroyed"],
  },
  { label: "ui.result.credits", keys: ["creditsGathered", "creditsSpent", "creditsRefunded"] },
  {
    label: "ui.result.materials",
    keys: ["materialsGathered", "materialsSpent", "materialsRefunded"],
  },
  {
    label: "ui.hud.industrial",
    keys: ["industrialCapacityGathered", "industrialCapacitySpent", "industrialCapacityRefunded"],
  },
  {
    label: "ui.hud.salvage",
    keys: ["salvagePointsGathered", "salvagePointsSpent", "salvagePointsRefunded"],
  },
] as const;

export function matchResult(
  victory: VictorySnapshot,
  force: number,
  statistics?: ForceStatisticsSnapshot[],
) {
  if (!victory.result) return null;
  const own = victory.forces.find((entry) => entry.force === force);
  const result = victory.result;
  return {
    title: text(
      result.winner === null
        ? "ui.result.draw"
        : own?.team === result.winner
          ? "ui.result.victory"
          : "ui.result.defeat",
    ),
    winner: text(result.winner === null ? "ui.result.no-winner" : "ui.result.winner", {
      team: (result.winner ?? 0) + 1,
    }),
    duration: `${Math.floor(result.tick / 1200)}:${String(Math.floor(result.tick / 20) % 60).padStart(2, "0")}`,
    rule: text(
      victory.rule === "headquarters"
        ? "ui.result.rule-headquarters"
        : victory.rule === "baseDestruction"
          ? "ui.result.rule-base"
          : "ui.result.rule-annihilation",
    ),
    rows: victory.forces.map((entry) => {
      const counters = statistics?.find((row) => row.force === entry.force)?.counters;
      return {
        name: text(entry.force === force ? "ui.result.your-force" : "ui.result.other-force", {
          force: entry.force + 1,
        }),
        status: text(
          entry.reason === "surrendered"
            ? "ui.result.surrendered"
            : entry.reason === "eliminated"
              ? "ui.result.eliminated"
              : "ui.result.survived",
        ),
        ...(counters && {
          totals: columns.map(({ keys }) => keys.map((key) => counters[key]).join(" / ")),
        }),
      };
    }),
  };
}

/** The worker owns the result; the modal only offers fresh-session navigation. */
export function postMatchScreen(
  root: HTMLElement,
  victory: VictorySnapshot,
  force: number,
  rematch: () => void,
  home: () => void,
  statistics?: ForceStatisticsSnapshot[],
  saveReplay?: () => Promise<void>,
) {
  const result = matchResult(victory, force, statistics);
  if (!result) throw new Error("Cannot present an unfinished match");
  const dialog = document.createElement("dialog");
  dialog.className = "match-result";
  dialog.setAttribute("aria-labelledby", "match-result-title");
  dialog.innerHTML = `<p class="eyebrow">${text("ui.result.title")}</p><h1 id="match-result-title"></h1><p data-result-summary></p><table><thead><tr><th scope="col">${text("ui.result.force")}</th><th scope="col">${text("ui.result.outcome")}</th></tr></thead><tbody></tbody></table><div class="setup-actions"><button type="button" class="primary" data-rematch>${text("ui.result.rematch")}</button><button type="button" data-home>${text("ui.result.home")}</button></div>`;
  const table = dialog.querySelector("table")!;
  const scroll = document.createElement("div");
  scroll.className = "result-totals";
  table.before(scroll);
  scroll.append(table);
  const shown = columns
    .map((column, index) => ({ ...column, index }))
    .filter(
      ({ keys, index }) =>
        index < 4 || statistics?.some((row) => keys.some((key) => row.counters[key] > 0)),
    );
  if (statistics) {
    dialog.classList.add("has-totals");
    const caption = document.createElement("p");
    caption.id = "match-totals-legend";
    caption.className = "result-totals-legend";
    caption.textContent = text("ui.result.totals-legend");
    scroll.before(caption);
    table.setAttribute("aria-describedby", caption.id);
    scroll.tabIndex = 0;
    scroll.setAttribute("role", "region");
    scroll.setAttribute("aria-label", text("ui.result.totals"));
    for (const column of shown) {
      const heading = document.createElement("th");
      heading.scope = "col";
      heading.textContent = text(column.label);
      table.tHead?.rows[0]?.append(heading);
    }
  }
  dialog.querySelector("h1")!.textContent = result.title;
  dialog.querySelector("[data-result-summary]")!.textContent = text("ui.result.summary", {
    winner: result.winner,
    rule: result.rule,
    time: result.duration,
  });
  const body = dialog.querySelector("tbody")!;
  for (const entry of result.rows) {
    const row = body.insertRow();
    row.insertCell().textContent = entry.name;
    row.insertCell().textContent = entry.status;
    if (statistics)
      for (const { index } of shown) row.insertCell().textContent = entry.totals?.[index] ?? "—";
  }
  dialog.addEventListener("keydown", (event) => event.stopPropagation());
  dialog.addEventListener("cancel", (event) => event.preventDefault());
  dialog.querySelector("[data-rematch]")!.addEventListener("click", rematch);
  dialog.querySelector("[data-home]")!.addEventListener("click", home);
  if (saveReplay) {
    const button = document.createElement("button"),
      status = document.createElement("p");
    button.type = "button";
    button.textContent = text("ui.result.save-replay");
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    dialog.querySelector(".setup-actions")?.prepend(button);
    dialog.append(status);
    button.addEventListener("click", async () => {
      if (button.disabled) return;
      button.disabled = true;
      status.setAttribute("role", "status");
      status.textContent = text("ui.result.preparing-replay");
      try {
        await saveReplay();
        if (dialog.isConnected) status.textContent = text("ui.result.replay-download");
      } catch {
        if (dialog.isConnected) {
          status.setAttribute("role", "alert");
          status.textContent = text("ui.result.replay-failed");
        }
      } finally {
        button.disabled = false;
      }
    });
  }
  root.append(dialog);
  dialog.showModal();
  return dialog;
}
