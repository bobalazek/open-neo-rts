import { parseScenario, runScenario } from "@open-neo-rts/sim";
import fixture from "./eastern-collective-two-forces.json";

/** Both runs share the browser module instance to catch leaked globals between matches. */
export function scenarioGoldens() {
  const scenario = parseScenario(fixture);
  return [runScenario(scenario), runScenario(scenario)];
}
