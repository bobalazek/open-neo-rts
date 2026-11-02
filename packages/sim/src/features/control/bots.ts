import {
  type BotProgram,
  basicSkirmishProgram,
  type DecisionState,
  idleProgram,
  runDecision,
  type SkirmishMemory,
} from "@open-neo-rts/ai";
import { arr, bool, int, opt, type Schema, str, unknown, validate } from "@open-neo-rts/content";
import { addString, type Hasher, type Stream } from "@open-neo-rts/deterministic";
import { type Command, type Scope, validateCommands } from "../../commands";
import { type ControllerCommand, type Kernel, registerController, stream } from "../../kernel";
import type { MatchSetup } from "../../match";
import type { ProjectionState, SeatSnapshot } from "../../projection";
import { strictObject } from "../../snapshots/schema";
import { ConstructionRequest } from "../construction";
import { OwnerForce } from "../entities";
import { ProductionItem } from "../production";
import { skirmishPolicy } from "./skirmish";

/** Provisional counted candidate evaluations per seat per tick, independent of machine speed. */
export const BOT_WORK_BUDGET = 64;
const COMMAND_LIMIT = 64;
export type SeatBotProgram = BotProgram<Readonly<SeatSnapshot>, ControllerCommand, SkirmishMemory>;
type State = DecisionState<ControllerCommand, SkirmishMemory>;
interface HostedBot {
  seat: number;
  program: string;
  budget: number;
  used: number;
  lastTick: number;
  state: State;
  decide: SeatBotProgram;
}
export interface BotSeatState {
  seat: number;
  program: string;
  budget: number;
  used: number;
  lastTick: number;
  state: State;
  random: Stream;
  projection: ProjectionState;
}
export interface BotSeatsState {
  format: 1;
  tick: number;
  bots: BotSeatState[];
  /** Only these seats' already resolved canonical next-tick commands. */
  queued: Command[];
}
const canonical = (value: unknown) =>
  JSON.stringify(value, (_key, entry: unknown) =>
    entry !== null && typeof entry === "object" && !Array.isArray(entry)
      ? Object.fromEntries(Object.entries(entry).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : entry,
  );
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const emptyState = (): State => ({ cursor: 0, target: null, pending: [] });
const commandList = (value: unknown): ControllerCommand[] => {
  if (!Array.isArray(value) || value.length > COMMAND_LIMIT)
    throw new Error("Invalid bot commands");
  for (const command of value) {
    if (
      typeof command !== "object" ||
      command === null ||
      Array.isArray(command) ||
      Object.keys(command).length !== 2 ||
      !Object.hasOwn(command, "type") ||
      !Object.hasOwn(command, "payload") ||
      typeof command.payload !== "object" ||
      command.payload === null ||
      Array.isArray(command.payload)
    )
      throw new Error("Invalid bot command shape");
    const payload = { ...command.payload } as Record<string, unknown>;
    for (const field of ["entities", "builders", "entity", "item"])
      if (Object.hasOwn(payload, field)) {
        const handles =
          field === "entities" || field === "builders" ? payload[field] : [payload[field]];
        if (
          !Array.isArray(handles) ||
          ![...handles].every(
            (handle) => typeof handle === "string" && /^e[1-9][0-9]*$/.test(handle),
          )
        )
          throw new Error("Bots must use live opaque handles");
        payload[field] = field === "entities" || field === "builders" ? handles.map(() => 1) : 1;
      }
    const validation = validateCommands(
      [{ type: command.type, payload, tick: 0, seat: 1, sequence: 0 }],
      { debug: false },
    )[0];
    if (!validation?.accepted) throw new Error("Invalid bot command payload");
  }
  return copy(value as ControllerCommand[]);
};
function decisionState(value: unknown): State {
  const schema = strictObject({
    cursor: int(0, 0xffffffff),
    target: {
      json: {},
      check(target, path, issues) {
        if (target !== null && (typeof target !== "string" || !/^[eg][1-9][0-9]*$/.test(target)))
          issues.push({ path, message: "invalid remembered handle" });
      },
    },
    pending: unknown(),
    memory: opt(unknown()),
  });
  if (validate(schema, value).length) throw new Error("Invalid bot decision state");
  const state = value as State;
  if (state.memory !== undefined) {
    const handle = () => str(/^e[1-9][0-9]*$/);
    const target = () => str(/^[eg][1-9][0-9]*$/);
    const coordinate = () => int(0, (1 << 19) - 1);
    const nullable = (schema: Schema): Schema => ({
      json: {},
      check(value, path, issues) {
        if (value !== null) schema.check(value, path, issues);
      },
    });
    const memory = strictObject({
      stage: int(0, 4),
      nextPlan: int(0, 0xffffffff),
      buildAfter: int(0, 0xffffffff),
      placement: int(0, 1088),
      scout: int(0, 512 * 512 - 1),
      scoutWork: int(0, 8),
      owned: arr(handle(), 0, 10000),
      enemy: nullable(target()),
      goal: nullable(
        strictObject({
          x: coordinate(),
          y: coordinate(),
          until: int(0, 0xffffffff),
          handle: nullable(target()),
        }),
      ),
      avoid: nullable(strictObject({ handle: target(), until: int(0, 0xffffffff) })),
      site: nullable(
        strictObject({ handle: handle(), work: int(0, 0xffffffff), until: int(0, 0xffffffff) }),
      ),
      orders: arr(
        strictObject({
          handle: handle(),
          x: coordinate(),
          y: coordinate(),
          until: int(0, 0xffffffff),
          retreat: bool(),
        }),
        0,
        10000,
      ),
    });
    if (
      validate(memory, state.memory).length ||
      new Set(state.memory.owned).size !== state.memory.owned.length ||
      new Set(state.memory.orders.map((order) => order.handle)).size !== state.memory.orders.length
    )
      throw new Error("Invalid skirmish memory");
  }
  return {
    cursor: state.cursor,
    target: state.target,
    pending: commandList(state.pending),
    ...(state.memory !== undefined && { memory: copy(state.memory) }),
  };
}
const randomWords = (value: unknown): Stream => {
  const schema = strictObject({
    a: int(-0x80000000, 0xffffffff),
    b: int(-0x80000000, 0xffffffff),
    c: int(-0x80000000, 0xffffffff),
    d: int(-0x80000000, 0xffffffff),
  });
  if (validate(schema, value).length) throw new Error("Invalid bot random stream");
  const random = value as Stream;
  return { a: random.a >>> 0, b: random.b >>> 0, c: random.c >>> 0, d: random.d >>> 0 };
};

/** Trusted seat host: AI gets copied observations/state/randomness; only this owner applies results. */
export class BotSeats {
  private readonly seats = new Map<number, HostedBot>();
  constructor(
    private readonly kernel: Kernel,
    private readonly setup: MatchSetup,
  ) {}
  hasSeat(seat: number): boolean {
    return this.seats.has(seat);
  }

  register(
    config: { seat: number; program: string; budget?: number },
    decide: SeatBotProgram,
  ): void {
    const { seat, program } = config,
      budget = config.budget ?? BOT_WORK_BUDGET;
    if (
      !this.setup.normal ||
      !this.setup.seats.includes(seat) ||
      this.seats.has(seat) ||
      this.kernel.controllers.has(seat) ||
      !/^[a-z][a-z0-9-]*$/.test(program) ||
      !Number.isInteger(budget) ||
      budget < 1 ||
      budget > 4096 ||
      !this.kernel.visibility?.forcesForSeat(seat).length ||
      !this.kernel.observationProjections?.has(seat)
    )
      throw new Error("Invalid or duplicate bot seat");
    const bot: HostedBot = {
      seat,
      program,
      budget,
      used: 0,
      lastTick: this.kernel.tick,
      state: emptyState(),
      decide,
    };
    this.seats.set(seat, bot);
    stream(this.kernel, `ai:${seat}`);
    registerController(this.kernel, seat, ({ observation }) => {
      if (!this.kernel.visibility?.forcesForSeat(seat).length) {
        bot.used = 0;
        bot.lastTick = this.kernel.tick;
        return [];
      }
      const result = runDecision(
        bot.decide,
        observation,
        copy(bot.state),
        stream(this.kernel, `ai:${seat}`),
        bot.budget,
      );
      const state = decisionState(result.state),
        commands = commandList(result.commands),
        random = randomWords(result.random);
      if (commands.length > result.used) throw new Error("Bot commands exceed counted work");
      // Validate every result before applying any state or stream mutation.
      bot.state = state;
      bot.used = result.used;
      bot.lastTick = this.kernel.tick;
      Object.assign(stream(this.kernel, `ai:${seat}`), random);
      return commands.filter((command) => this.permitted(bot.seat, command));
    });
  }

  private permitted(seat: number, command: ControllerCommand): boolean {
    const payload = this.kernel.controllerPayload?.(seat, command);
    const checked = validateCommands(
      [{ type: command.type, payload, tick: this.kernel.tick + 1, seat, sequence: 0 }],
      this.kernel,
    )[0];
    if (!checked?.accepted) return false;
    return this.authorized(checked.command, this.kernel.tick, this.kernel.tick + 1);
  }
  private grantedFor(command: Command, now: number, execution: number): (force: number) => boolean {
    const { seat } = command;
    const scopes: readonly Scope[] = command.type.startsWith("unit.")
      ? ["unit.orders"]
      : command.type.startsWith("production.")
        ? ["production.queue"]
        : command.type === "economy.power"
          ? ["economy.build", "economy.transfer", "production.queue", "research.spend"]
          : ["economy.build"];
    return (force: number) =>
      scopes.some(
        (scope) =>
          this.kernel.visibility?.permits(seat, force, scope, now) &&
          this.kernel.visibility.permits(seat, force, scope, execution),
      );
  }
  private authorized(command: Command, now: number, execution: number): boolean {
    const { seat } = command;
    const fields = command.payload as unknown as Record<string, unknown>;
    const allowed = this.grantedFor(command, now, execution);
    if (typeof fields.force === "number" && !allowed(fields.force)) return false;
    // Attack targets need current sight; combat checks hostility and weapon eligibility at dispatch.
    if (
      command.type === "unit.attack" &&
      !this.kernel.visibility?.canSeeEntity(seat, command.payload.entity)
    )
      return false;
    const ids: number[] = [];
    for (const field of ["entities", "builders", "entity", "item"]) {
      if (command.type === "unit.attack" && field === "entity") continue;
      const value = fields[field];
      if (Array.isArray(value)) ids.push(...value);
      else if (typeof value === "number") ids.push(value);
    }
    return ids.every((id) => {
      const world = this.kernel.world;
      if (!world.isAlive(id)) return false;
      const component = world.has(id, OwnerForce)
        ? OwnerForce
        : world.has(id, ConstructionRequest)
          ? ConstructionRequest
          : world.has(id, ProductionItem)
            ? ProductionItem
            : undefined;
      return (
        component !== undefined &&
        allowed(world.get(id, component, "force")) &&
        (component === ConstructionRequest ||
          component === ProductionItem ||
          this.kernel.visibility?.canSeeEntity(seat, id) === true)
      );
    });
  }

  serialize(): BotSeatsState {
    return {
      format: 1,
      tick: this.kernel.tick,
      bots: [...this.seats.values()]
        .sort((a, b) => a.seat - b.seat)
        .map((bot) => ({
          seat: bot.seat,
          program: bot.program,
          budget: bot.budget,
          used: bot.used,
          lastTick: bot.lastTick,
          state: copy(bot.state),
          random: randomWords(stream(this.kernel, `ai:${bot.seat}`)),
          projection: this.projection(bot.seat).serialize(),
        })),
      queued: copy(
        this.kernel.queued.filter(
          (value): value is Command =>
            typeof value === "object" &&
            value !== null &&
            "seat" in value &&
            typeof value.seat === "number" &&
            this.seats.has(value.seat),
        ),
      ),
    };
  }
  private projection(seat: number) {
    const projection = this.kernel.observationProjections?.get(seat);
    if (!projection) throw new Error("Bot projection missing");
    return projection;
  }

  /** Same-match host restore after World/vision memory. Validation completes before replacing live state. */
  load(value: unknown): void {
    const schema = strictObject({
      format: int(1, 1),
      tick: int(this.kernel.tick, this.kernel.tick),
      bots: arr(
        strictObject({
          seat: int(1, 0x7fffffff),
          program: str(/^[a-z][a-z0-9-]*$/),
          budget: int(1, 4096),
          used: int(0, 4096),
          lastTick: int(0, this.kernel.tick),
          state: unknown(),
          random: unknown(),
          projection: unknown(),
        }),
        this.seats.size,
        this.seats.size,
      ),
      queued: arr(unknown(), 0, this.seats.size * COMMAND_LIMIT),
    });
    if (validate(schema, value).length) throw new Error("Invalid bot host state");
    const saved = value as BotSeatsState;
    const bots = [...this.seats.values()].sort((a, b) => a.seat - b.seat);
    const prepared = saved.bots.map((row, index) => {
      const bot = bots[index];
      if (
        !bot ||
        bot.seat !== row.seat ||
        bot.program !== row.program ||
        bot.budget !== row.budget ||
        row.used > row.budget
      )
        throw new Error("Bot host identity/budget mismatch");
      const projection = this.kernel.observationProjections?.get(row.seat);
      if (!projection) throw new Error("Bot projection missing");
      return {
        bot,
        row,
        state: decisionState(row.state),
        random: randomWords(row.random),
        projection,
        mapping: projection.validateState(row.projection, this.kernel),
      };
    });
    const results = validateCommands(saved.queued, this.kernel);
    if (results.some((result) => !result.accepted)) throw new Error("Invalid queued bot commands");
    // References were resolved before later phases; dispatch rechecks live ownership/legality.
    for (const command of saved.queued) {
      const allowed = this.grantedFor(command, this.kernel.tick, this.kernel.tick);
      const fields = command.payload as unknown as Record<string, unknown>;
      if (
        !this.seats.has(command.seat) ||
        command.tick !== this.kernel.tick ||
        !(typeof fields.force === "number"
          ? allowed(fields.force)
          : this.setup.forces.some((force) => allowed(force.index)))
      )
        throw new Error("Invalid queued bot seat/tick/grant");
    }
    const remaining = this.kernel.queued.filter(
      (entry): entry is Command =>
        typeof entry === "object" &&
        entry !== null &&
        "seat" in entry &&
        typeof entry.seat === "number" &&
        !this.seats.has(entry.seat),
    );
    if (saved.queued.some((entry) => remaining.some((other) => other.sequence === entry.sequence)))
      throw new Error("Queued bot sequence collision");
    for (const next of prepared) {
      next.bot.state = next.state;
      next.bot.used = next.row.used;
      next.bot.lastTick = next.row.lastTick;
      Object.assign(stream(this.kernel, `ai:${next.bot.seat}`), next.random);
      next.projection.load(next.mapping, this.kernel);
    }
    this.kernel.queued = [...remaining, ...copy(saved.queued)].sort(
      (a, b) => a.sequence - b.sequence,
    );
    this.kernel.captureObservations?.();
  }
  hashInto(hasher: Hasher): void {
    addString(hasher, canonical(this.serialize()));
  }
}

/** Trusted registration seam for policy implementations and focused fixtures; never a client-supplied callback. */
export function registerBotSeat(
  kernel: Kernel,
  setup: MatchSetup,
  config: { seat: number; program: string; budget?: number },
  decide: SeatBotProgram,
): BotSeats {
  const host = kernel.bots ?? new BotSeats(kernel, setup);
  host.register(config, decide);
  kernel.bots = host;
  return host;
}
export function initializeBotSeats(kernel: Kernel, setup: MatchSetup): void {
  for (const bot of setup.normal?.bots ?? []) {
    const decide =
      bot.kind === "basic-skirmish"
        ? basicSkirmishProgram(skirmishPolicy(setup, bot.force as number))
        : undefined;
    const program: SeatBotProgram = decide
      ? ({ state, ...input }) => decide({ ...input, state: { ...state, pending: [] } })
      : idleProgram();
    registerBotSeat(kernel, setup, { seat: bot.seat, program: bot.kind }, program);
  }
}
