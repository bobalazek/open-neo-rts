// Browser-only clock and transport. All game outcomes still come from sim.step.
import {
  type Command,
  checkpointHash,
  createMatch,
  createProjection,
  type DebugSpawn,
  debugSpawnPlacement,
  type Kernel,
  type MatchSetup,
  type ProjectionMode,
  parseScenario,
  SCENARIO_FORMAT,
  SIM_VERSION,
  step,
  validateCommands,
} from "@open-neo-rts/sim";
import { createDebugDiagnostics, isOverlayOptions } from "./diagnostics";
import { isRecord, type WorkerReply } from "./protocol";

const port = globalThis as unknown as {
  onmessage: (event: MessageEvent<unknown>) => void;
  postMessage: (reply: WorkerReply) => void;
};
let kernel: Kernel | undefined;
let setup: MatchSetup;
let seat: number;
let mode: ProjectionMode;
let projection: ReturnType<typeof createProjection>;
let paused = true;
let speed = 1;
let sequence = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
let nextTickAt = 0;
let queued: { id: number; command: Command }[] = [];
let diagnostics: ReturnType<typeof createDebugDiagnostics>;
let tickMs: number | undefined;

function publish(id: number, result?: unknown) {
  if (!kernel) throw new Error("Initialize the match first");
  const snapshot = projection.snapshot(kernel);
  const overlays = diagnostics.copy(snapshot);
  port.postMessage({
    id,
    result,
    state: {
      snapshot,
      ...(overlays ? { overlays } : {}),
      paused,
      speed,
      ...(mode === "debug-no-fog" && tickMs !== undefined ? { tickMs } : {}),
      ...(mode === "debug-no-fog" ? { hash: checkpointHash(kernel) } : {}),
    },
  });
}
function tick() {
  if (!kernel) return;
  const commands = queued;
  queued = [];
  const inputs = commands.map(({ command }) => command);
  const start = performance.now();
  const entries = step(kernel, inputs);
  tickMs = performance.now() - start;
  commands.forEach(({ id }, i) => {
    port.postMessage({ id, result: entries[i]?.result });
  });
  publish(0);
}
function schedule(restart = true) {
  clearTimeout(timer);
  if (!paused) {
    const now = performance.now();
    if (restart) nextTickAt = now + 50 / speed;
    timer = setTimeout(
      () => {
        const now = performance.now();
        const interval = 50 / speed;
        // Rebase after suspension; normal ticks include publication work in their deadline.
        nextTickAt = (now - nextTickAt >= interval ? now : nextTickAt) + interval;
        tick();
        schedule(false);
      },
      Math.max(0, nextTickAt - now),
    );
  }
}

port.onmessage = ({ data }) => {
  const id =
    isRecord(data) && Number.isSafeInteger(data.id) && Number(data.id) > 0 ? Number(data.id) : 0;
  try {
    if (!id || !isRecord(data) || typeof data.type !== "string")
      throw new Error("Malformed worker request");
    if (data.type === "init") {
      if (kernel) throw new Error("Create a new worker to reload a match");
      if (!isRecord(data.options)) throw new Error("Invalid match options");
      const options = data.options;
      const scenario = parseScenario({
        format: SCENARIO_FORMAT,
        simVersion: SIM_VERSION,
        setup: options.setup,
        commands: [],
      });
      if (typeof options.seat !== "number" || !scenario.setup.seats.includes(options.seat))
        throw new Error("Unknown player seat");
      if (options.mode !== "controlled" && options.mode !== "debug-no-fog")
        throw new Error("Invalid projection mode");
      setup = scenario.setup;
      seat = options.seat;
      mode = options.mode;
      projection = createProjection(setup, seat, mode);
      kernel = createMatch(setup);
      diagnostics = createDebugDiagnostics(kernel, setup.definitions, projection.resolve);
      publish(id);
      return;
    }
    if (!kernel) throw new Error("Initialize the match first");
    switch (data.type) {
      case "overlays":
        if (!setup.debug || mode !== "debug-no-fog")
          throw new Error("Overlays require debug no-fog mode");
        if (!isOverlayOptions(data.options)) throw new Error("Invalid overlay options");
        diagnostics.configure(data.options);
        break;
      case "placement": {
        const validation = validateCommands(
          [{ tick: kernel.tick, seat, sequence: 0, type: "debug.spawn", payload: data.spawn }],
          kernel,
        )[0];
        if (!validation?.accepted || validation.command.type !== "debug.spawn")
          throw new Error("Invalid placement request");
        publish(id, {
          ...debugSpawnPlacement(
            kernel,
            setup.definitions,
            validation.command.payload as DebugSpawn,
          ),
          tick: kernel.tick,
        });
        return;
      }
      case "command": {
        if (!isRecord(data.command) || Object.keys(data.command).length !== 2)
          throw new Error("Invalid command request");
        const { type } = data.command;
        let payload = data.command.payload;
        if (isRecord(payload)) {
          payload = { ...payload };
          const fields = payload as Record<string, unknown>;
          if (type === "unit.move" || type === "unit.attackMove" || type === "unit.stop") {
            if (Array.isArray(fields.entities))
              fields.entities = fields.entities.map((handle) => projection.resolve(handle) ?? -1);
          } else if (type === "economy.build" || type === "economy.assistConstruction") {
            if (Array.isArray(fields.builders))
              fields.builders = fields.builders.map((handle) => projection.resolve(handle) ?? -1);
            if (type === "economy.assistConstruction")
              fields.entity = projection.resolve(fields.entity) ?? -1;
          } else if (
            type === "debug.remove" ||
            type === "debug.setHealth" ||
            type === "economy.power" ||
            type === "economy.cancelConstruction" ||
            type === "production.enqueue" ||
            type === "production.rally"
          )
            fields.entity = projection.resolve(fields.entity) ?? -1;
          else if (type === "production.cancel")
            fields.item = projection.resolve(fields.item) ?? -1;
        }
        const command = { tick: kernel.tick, seat, sequence: sequence++, type, payload };
        const validation = validateCommands([command], kernel)[0];
        if (!validation) throw new Error("Missing command validation");
        if (!validation.accepted) {
          publish(id, validation.code);
          return;
        }
        const accepted = validation.command;
        if (
          accepted.type === "debug.spawn" &&
          !setup.forces.some((force) => force.index === accepted.payload.force)
        ) {
          publish(id, "bad_payload");
          return;
        }
        queued.push({ id, command: validation.command });
        return;
      }
      case "pause":
        if (typeof data.paused !== "boolean") throw new Error("Invalid pause value");
        paused = data.paused;
        schedule();
        break;
      case "step":
        if (!paused) throw new Error("Pause before single-stepping");
        tick();
        break;
      case "speed":
        if (typeof data.speed !== "number" || ![0.25, 0.5, 1, 2, 4, 8].includes(data.speed))
          throw new Error("Invalid speed");
        speed = data.speed;
        schedule();
        break;
      case "export":
      case "export-session": {
        if (!setup.debug) throw new Error("Command-log export requires debug mode");
        const scenario = parseScenario({
          format: SCENARIO_FORMAT,
          simVersion: SIM_VERSION,
          setup,
          commands: kernel.log
            .filter((entry) => entry.result === "accepted")
            .map((entry) => entry.command),
        });
        publish(
          id,
          data.type === "export-session"
            ? { scenario, tick: kernel.tick, hash: checkpointHash(kernel) }
            : scenario,
        );
        return;
      }
      default:
        throw new Error("Unknown worker request");
    }
    publish(id);
  } catch (error) {
    port.postMessage({
      id,
      error: error instanceof Error ? error.message : "Worker request failed",
    });
  }
};
