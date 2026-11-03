import { checkpointHash, type Kernel } from "../kernel";
import { createMatch, type MatchSetup } from "../match";
import type { MatchSnapshot } from "./match-snapshot";
import { canonicalJson } from "./schema";

/** Internal: caller must have captured or history-verified the snapshot, not merely checked its checksum. */
export function restoreCanonicalState(saved: MatchSnapshot, setup: MatchSetup): Kernel {
  const kernel = createMatch(setup);
  const bytes = new Uint8Array(Math.floor(saved.world.length / 2));
  for (let i = 0; i < bytes.length; i++)
    bytes[i] = Number.parseInt(saved.world.slice(i * 2, i * 2 + 2), 16);
  // Initial map resource rows may exceed the ordinary dynamic-row allowance.
  kernel.world.replace(bytes, kernel.world.query().length + 65536);
  kernel.tick = saved.tick;
  kernel.streams.clear();
  for (const { name, ...words } of saved.streams) kernel.streams.set(name, { ...words });
  kernel.movement?.load(saved.movement);
  kernel.vision?.load(saved.vision);
  kernel.visibility?.load(saved.visibility);
  kernel.bots?.load(saved.bots);
  const commands = JSON.parse(
    JSON.stringify(saved.scenario.commands),
  ) as typeof saved.scenario.commands;
  kernel.log.push(
    ...commands.map((command) => ({
      tick: command.tick,
      source: "input" as const,
      command,
      result: "accepted" as const,
    })),
  );
  kernel.combatEvents = [];
  kernel.productionExits?.clear();
  kernel.captureObservations?.();
  if (checkpointHash(kernel) !== saved.hash) throw new Error("Canonical snapshot hash mismatch");
  if (canonicalJson(kernel.movement?.snapshot() ?? null) !== canonicalJson(saved.movement))
    throw new Error("Canonical movement cache mismatch");
  return kernel;
}
