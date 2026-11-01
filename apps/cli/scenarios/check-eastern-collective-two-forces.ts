import { parseScenario, runScenario, traceScenario } from "@open-neo-rts/sim";
import fixture from "./eastern-collective-two-forces.json";

/** Both runs share the browser module instance to catch leaked globals between matches. */
export function scenarioGoldens() {
  const scenario = parseScenario(fixture);
  return [runScenario(scenario), runScenario(scenario)];
}

/** Captures two per-tick replays only after a browser golden mismatch. */
export function scenarioTraces() {
  const scenario = parseScenario(fixture);
  return [traceScenario(scenario, { ticks: 10_000 }), traceScenario(scenario, { ticks: 10_000 })];
}
