// Canonical result summary and local rematch navigation. Phase 2.
import type { VictorySnapshot } from "@open-neo-rts/sim";
import { text } from "../../shared";

export function matchResult(victory: VictorySnapshot, force: number) {
  if (!victory.result) return null;
  const own = victory.forces.find((entry) => entry.force === force);
  const result = victory.result;
  return {
    title: text(result.winner === null ? "ui.result.draw" : own?.team === result.winner ? "ui.result.victory" : "ui.result.defeat"),
    winner: text(result.winner === null ? "ui.result.no-winner" : "ui.result.winner", { team: (result.winner ?? 0) + 1 }),
    duration: `${Math.floor(result.tick / 1200)}:${String(Math.floor(result.tick / 20) % 60).padStart(2, "0")}`,
    rule: text(victory.rule === "headquarters" ? "ui.result.rule-headquarters" : victory.rule === "baseDestruction" ? "ui.result.rule-base" : "ui.result.rule-annihilation"),
    rows: victory.forces.map((entry) => ({
      name: text(entry.force === force ? "ui.result.your-force" : "ui.result.other-force", { force: entry.force + 1 }),
      status: text(entry.reason === "surrendered" ? "ui.result.surrendered" : entry.reason === "eliminated" ? "ui.result.eliminated" : "ui.result.survived"),
    })),
  };
}

/** The worker owns the result; the modal only offers fresh-session navigation. */
export function postMatchScreen(root: HTMLElement, victory: VictorySnapshot, force: number, rematch: () => void, home: () => void) {
  const result = matchResult(victory, force);
  if (!result) throw new Error("Cannot present an unfinished match");
  const dialog = document.createElement("dialog");
  dialog.className = "match-result";
  dialog.setAttribute("aria-labelledby", "match-result-title");
  dialog.innerHTML = `<p class="eyebrow">${text("ui.result.title")}</p><h1 id="match-result-title"></h1><p data-result-summary></p><table><thead><tr><th scope="col">${text("ui.result.force")}</th><th scope="col">${text("ui.result.outcome")}</th></tr></thead><tbody></tbody></table><div class="setup-actions"><button type="button" class="primary" data-rematch>${text("ui.result.rematch")}</button><button type="button" data-home>${text("ui.result.home")}</button></div>`;
  dialog.querySelector("h1")!.textContent = result.title;
  dialog.querySelector("[data-result-summary]")!.textContent = text("ui.result.summary", { winner: result.winner, rule: result.rule, time: result.duration });
  const body = dialog.querySelector("tbody")!;
  for (const entry of result.rows) {
    const row = body.insertRow();
    row.insertCell().textContent = entry.name;
    row.insertCell().textContent = entry.status;
  }
  dialog.addEventListener("keydown", (event) => event.stopPropagation());
  dialog.addEventListener("cancel", (event) => event.preventDefault());
  dialog.querySelector("[data-rematch]")!.addEventListener("click", rematch);
  dialog.querySelector("[data-home]")!.addEventListener("click", home);
  root.append(dialog);
  dialog.showModal();
  return dialog;
}
