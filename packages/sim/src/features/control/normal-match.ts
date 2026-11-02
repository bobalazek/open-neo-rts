import {
  arr,
  bool,
  type GroundDomain,
  idOf,
  int,
  MATCH_SETTINGS,
  oneOf,
  opt,
  RESOURCES,
  rec,
  str,
  UNIT_ROLES,
  validate,
} from "@open-neo-rts/content";
import { type Grant, hasGrant } from "../../commands";
import type { Kernel } from "../../kernel";
import type { MatchSetup } from "../../match";
import { compileOreCells } from "../../match-map";
import { strictObject } from "../../snapshots/schema";
import { KitStructure } from "../construction/repair";
import { type Definition, type GameplayCatalog, spawnEntity } from "../entities";
import { checkSpawnPlacement } from "../entities/placement";
import {
  compileNavigation,
  type NavigationGrid,
  type NavigationObject,
} from "../movement/navigation";
import { labelReachability } from "../movement/reachability";
import { ELIMINATION_RULES, type EliminationRule } from "../victory";
import { FOG_MODES, type FogMode } from "../vision";
import { skirmishPolicy } from "./skirmish";

export interface NormalMatchSettings {
  readonly startingCredits: number;
  readonly popCap: number;
  readonly structureCap: number;
  readonly fog?: FogMode;
  readonly friendlyFire?: boolean;
  readonly highGroundMissPerMille?: number;
  readonly elimination?: EliminationRule;
}

export interface NormalMatchSetup {
  readonly gameplayHash: string;
  readonly mapSupport: {
    readonly start: "faction";
    readonly players: { readonly min: number; readonly max: number };
  };
  readonly settings: NormalMatchSettings;
  readonly bots?: readonly {
    readonly seat: number;
    readonly kind: "idle" | "basic-skirmish";
    readonly force?: number;
  }[];
  readonly forces: readonly {
    readonly index: number;
    readonly team: number;
    readonly spawn: string;
    readonly start: {
      readonly structures: readonly string[];
      readonly units: readonly {
        readonly unit: string;
        readonly count: number;
        readonly pop: number;
        readonly role: string;
      }[];
      /** Initial balances only; operating banks are an economy feature. */
      readonly resources: Readonly<Record<string, number>>;
    };
  }[];
}

export interface NormalMatchOptions {
  readonly map: MatchSetup["map"];
  readonly mapSupport: NormalMatchSetup["mapSupport"];
  readonly seed: number;
  readonly catalog: GameplayCatalog;
  readonly forces: readonly {
    readonly index: number;
    readonly faction: string;
    readonly spawn: string;
    readonly team: number;
  }[];
  readonly seats: readonly number[];
  readonly grants: readonly Grant[];
  readonly settings?: Partial<NormalMatchSettings>;
  readonly bots?: NormalMatchSetup["bots"];
}

const required = <T>(value: T | undefined): T =>
  value === undefined ? refuse("incomplete normal-match setup") : value;
const setting = (
  id: "startingCredits" | "popCap" | "structureCap" | "friendlyFire" | "highGroundMissPerMille",
) => required(MATCH_SETTINGS.find((entry) => entry.id === id));
const settingSchema = (id: "startingCredits" | "popCap" | "structureCap") =>
  int(setting(id).min, setting(id).max);
const index = () => int(0, 0x7fffffff);
const scopes = [
  "unit.orders",
  "unit.abilities",
  "economy.transfer",
  "economy.build",
  "production.queue",
  "research.spend",
  "diplomacy.propose",
  "diplomacy.accept",
  "commander.abilities",
  "surrender",
  "team.admin",
] as const;

const identitySchema = strictObject({
  forces: arr(strictObject({ index: index(), faction: idOf("faction") }), 1, 8),
  seats: arr(int(1, 0x7fffffff), 1, 16),
  grants: arr(
    strictObject({
      seat: int(1, 0x7fffffff),
      force: index(),
      scopes: arr(oneOf(scopes)),
      grantedAtTick: index(),
      revokedAtTick: opt(index()),
      expiresAtTick: opt(index()),
    }),
  ),
});

export const normalMatchSchema = strictObject({
  gameplayHash: str(/^[0-9a-f]{16}$/),
  mapSupport: strictObject({
    start: oneOf(["faction"]),
    players: strictObject({ min: int(1, 8), max: int(1, 8) }),
  }),
  settings: strictObject({
    startingCredits: settingSchema("startingCredits"),
    popCap: settingSchema("popCap"),
    structureCap: settingSchema("structureCap"),
    fog: opt(oneOf(FOG_MODES)),
    friendlyFire: opt(bool()),
    highGroundMissPerMille: opt(int(0, 1000)),
    elimination: opt(oneOf(ELIMINATION_RULES)),
  }),
  bots: opt(
    arr(
      strictObject({
        seat: int(1, 0x7fffffff),
        kind: oneOf(["idle", "basic-skirmish"]),
        force: opt(index()),
      }),
      0,
      16,
    ),
  ),
  forces: arr(
    strictObject({
      index: index(),
      team: index(),
      spawn: str(/^[a-z0-9]+(-[a-z0-9]+)*$/),
      start: strictObject({
        structures: arr(idOf("structure"), 1, 1),
        units: arr(
          strictObject({
            unit: idOf("unit"),
            count: int(1, 50),
            pop: int(0, 500),
            role: oneOf(UNIT_ROLES),
          }),
          1,
        ),
        resources: rec(
          int(0, 0x7fffffff),
          new RegExp(`^(${RESOURCES.map((r) => r.id).join("|")})$`),
        ),
      }),
    }),
    1,
    8,
  ),
});

function refuse(message: string): never {
  throw new Error(`Invalid normal match: ${message}`);
}

/** Resolve the authored starting kit into the same serializable setup used by workers and replays. */
export function createNormalMatchSetup(options: NormalMatchOptions): MatchSetup {
  const { catalog } = options;
  if (
    Object.keys(options.settings ?? {}).some(
      (id) =>
        ![
          "startingCredits",
          "popCap",
          "structureCap",
          "fog",
          "friendlyFire",
          "highGroundMissPerMille",
          "elimination",
        ].includes(id),
    )
  )
    refuse("unsupported starting setting");
  const settings = {
    ...Object.fromEntries(
      (["startingCredits", "popCap", "structureCap"] as const).map((id) => [
        id,
        options.settings?.[id] === undefined ? setting(id).default : options.settings[id],
      ]),
    ),
    fog: options.settings?.fog ?? "standard",
    friendlyFire: options.settings?.friendlyFire ?? setting("friendlyFire").default,
    highGroundMissPerMille:
      options.settings?.highGroundMissPerMille ?? setting("highGroundMissPerMille").default,
    elimination: options.settings?.elimination ?? "annihilation",
  } as unknown as NormalMatchSettings;
  const definitions: Definition[] = catalog.definitions.map((def) => ({
    id: def.id,
    health: def.health,
    speed: def.speed,
    turnRate: def.turnRate,
    ...(def.visionSubcells !== undefined && { visionSubcells: def.visionSubcells }),
    ...(def.power !== undefined && { power: def.power }),
    ...(def.role !== undefined && { role: def.role }),
    ...(def.tags.length && { tags: def.tags }),
    ...(def.repair && { repair: def.repair }),
    ...(def.harvestCapacity !== undefined && { harvestCapacity: def.harvestCapacity }),
    ...(def.harvestAmountPerSecond !== undefined && {
      harvestAmountPerSecond: def.harvestAmountPerSecond,
    }),
    ...(def.dock !== undefined && { dock: def.dock }),
    ...(def.armor !== undefined && { armor: def.armor }),
    ...(def.resistPerMille && { resistPerMille: def.resistPerMille }),
    ...(def.weapons.length && { weapons: def.weapons }),
    ...(def.turretTurnAnglePerTick !== undefined && {
      turretTurnAnglePerTick: def.turretTurnAnglePerTick,
    }),
    ...(def.construction && { construction: def.construction }),
    ...(def.requires.length && { requires: def.requires }),
    ...(def.role === "builder" && { builds: def.builds }),
    ...(def.produces.length && { produces: def.produces }),
    ...(def.spawnsWith.length && { spawnsWith: def.spawnsWith }),
    ...(def.pop !== undefined && { pop: def.pop }),
    ...(def.productionSlots !== undefined && { productionSlots: def.productionSlots }),
    ...(def.exits && { exits: def.exits }),
    ...(def.domain !== undefined && { domain: def.domain }),
    ...(def.radiusSubcells !== undefined && { radiusSubcells: def.radiusSubcells }),
    ...(def.domains && { domains: def.domains }),
    ...(def.footprint && { footprint: def.footprint }),
    ...(def.cells && { cells: def.cells }),
    ...(def.nodeKinds && { nodeKinds: def.nodeKinds }),
    ...(def.extraction && { extraction: def.extraction }),
    ...(def.blocks !== undefined && { blocks: def.blocks }),
  }));
  const forces = options.forces.map((force) => {
    const faction = catalog.factions.find((entry) => entry.id === force.faction);
    if (!faction) refuse(`unknown faction ${force.faction}`);
    if (faction.start.structures.length !== 1)
      refuse(`${force.faction} requires one placed starting headquarters`);
    const headquarters = catalog.definitions.find((def) => def.id === faction.start.structures[0]);
    if (headquarters?.kind !== "structure" || headquarters.role !== "headquarters")
      refuse(`${force.faction} starting structure must be its headquarters`);
    return {
      index: force.index,
      team: force.team,
      spawn: force.spawn,
      start: {
        structures: [...faction.start.structures],
        units: faction.start.units.map(({ unit, count }) => {
          const def = catalog.definitions.find((entry) => entry.id === unit);
          if (def?.kind !== "unit" || def.pop === undefined || !def.role)
            refuse(`starting unit ${unit} requires population and role metadata`);
          return { unit, count, pop: def.pop, role: def.role };
        }),
        resources: { ...faction.start.resources, credits: settings.startingCredits },
      },
    };
  });
  const setup: MatchSetup = {
    map: options.map,
    seed: options.seed,
    debug: false,
    forces: options.forces.map(({ index, faction }) => ({ index, faction })),
    seats: options.seats,
    grants: options.grants,
    definitions,
    normal: {
      gameplayHash: catalog.gameplayHash,
      mapSupport: options.mapSupport,
      settings,
      ...(options.bots?.length && { bots: options.bots }),
      forces,
    },
  };
  checkNormalMatchSetup(setup);
  return copyNormalMatchSetup(setup);
}

/** Validate direct callers as well as the untrusted scenario/worker boundary. */
export function checkNormalMatchSetup(setup: MatchSetup): void {
  const normal = setup.normal;
  if (normal === undefined) return;
  const issues = [
    ...validate(normalMatchSchema, normal),
    ...validate(identitySchema, { forces: setup.forces, seats: setup.seats, grants: setup.grants }),
  ];
  if (issues.length) refuse(issues.map((issue) => `${issue.path} ${issue.message}`).join("; "));
  if (setup.debug) refuse("normal starting kits cannot enable debug commands");
  if (setup.map.objects.length)
    refuse("authored map objects are not supported by normal initialization yet");
  const { min, max } = normal.mapSupport.players;
  if (min > max || setup.forces.length < min || setup.forces.length > max)
    refuse("Force count is outside the map's supported player range");
  const forceIds = new Set(setup.forces.map((force) => force.index));
  const seats = new Set(setup.seats);
  const botSeats = new Set<number>();
  for (const bot of normal.bots ?? []) {
    if (
      !seats.has(bot.seat) ||
      botSeats.has(bot.seat) ||
      !setup.grants.some(
        (grant) =>
          grant.seat === bot.seat &&
          grant.scopes.length > 0 &&
          grant.grantedAtTick === 0 &&
          (grant.expiresAtTick === undefined || grant.expiresAtTick > 0) &&
          (grant.revokedAtTick === undefined || grant.revokedAtTick > 0),
      )
    )
      refuse("bot seats must be unique declared seats with an active initial grant");
    botSeats.add(bot.seat);
    if (bot.kind === "idle" && bot.force !== undefined)
      refuse("idle bots have no Force policy selection");
    if (bot.kind === "basic-skirmish") {
      if (
        bot.force === undefined ||
        !forceIds.has(bot.force) ||
        !(["unit.orders", "economy.build", "production.queue"] as const).every((scope) =>
          hasGrant(setup.grants, bot.seat, bot.force as number, scope, 0),
        )
      )
        refuse("basic skirmish needs one declared Force with initial unit/build/production grants");
      skirmishPolicy(setup, bot.force);
    }
  }
  if (forceIds.size !== setup.forces.length || seats.size !== setup.seats.length)
    refuse("Force and seat IDs must be unique");
  const slots = new Set(normal.forces.map((force) => force.index));
  if (
    slots.size !== normal.forces.length ||
    slots.size !== forceIds.size ||
    [...slots].some((id) => !forceIds.has(id))
  )
    refuse("starting kits must name each declared Force exactly once");
  const spawns = new Set(normal.forces.map((force) => force.spawn));
  if (spawns.size !== normal.forces.length) refuse("starting spawns must be unique");
  for (const grant of setup.grants)
    if (!forceIds.has(grant.force) || !seats.has(grant.seat))
      refuse("grants must reference declared seats and Forces");
  for (const force of normal.forces) {
    if (!setup.map.spawns.some((spawn) => spawn.id === force.spawn))
      refuse(`unknown spawn ${force.spawn}`);
    if (!setup.seats.some((seat) => hasGrant(setup.grants, seat, force.index, "unit.orders", 0)))
      refuse(`Force ${force.index} needs an initial unit.orders controller`);
    if (
      force.start.structures.length > normal.settings.structureCap ||
      force.start.units.reduce((sum, unit) => sum + unit.count * unit.pop, 0) >
        normal.settings.popCap
    )
      refuse(`Force ${force.index} starting kit exceeds its caps`);
    if (new Set(force.start.units.map((unit) => unit.unit)).size !== force.start.units.length)
      refuse("starting unit entries must be unique");
    if (force.start.resources.credits !== normal.settings.startingCredits)
      refuse("starting credits must match the resolved setting");
    for (const id of force.start.structures)
      if (!setup.definitions.some((def) => def.id === id && def.footprint))
        refuse(`missing headquarters definition ${id}`);
    for (const { unit } of force.start.units) {
      const def = setup.definitions.find((entry) => entry.id === unit);
      if (
        !def ||
        def.domain === undefined ||
        def.domain === "air" ||
        def.radiusSubcells === undefined ||
        def.speed <= 0
      )
        refuse(`starting unit ${unit} requires supported ground movement`);
    }
  }
}

/** Canonical copies own all permission/setup arrays used by normal initialization and later commands. */
export function copyNormalMatchSetup(setup: MatchSetup): MatchSetup {
  if (!setup.normal) return setup;
  const normal = setup.normal;
  const grants = setup.grants
    .map((grant) =>
      Object.freeze({
        seat: grant.seat,
        force: grant.force,
        scopes: Object.freeze([...grant.scopes].sort()),
        grantedAtTick: grant.grantedAtTick,
        ...(grant.revokedAtTick !== undefined && { revokedAtTick: grant.revokedAtTick }),
        ...(grant.expiresAtTick !== undefined && { expiresAtTick: grant.expiresAtTick }),
      }),
    )
    .sort((a, b) => {
      const left = JSON.stringify(a),
        right = JSON.stringify(b);
      return left < right ? -1 : left > right ? 1 : 0;
    });
  return {
    ...setup,
    forces: Object.freeze(
      [...setup.forces]
        .sort((a, b) => a.index - b.index)
        .map((force) => Object.freeze({ index: force.index, faction: force.faction })),
    ),
    seats: Object.freeze([...setup.seats].sort((a, b) => a - b)),
    grants: Object.freeze(grants),
    normal: Object.freeze({
      gameplayHash: normal.gameplayHash,
      mapSupport: Object.freeze({
        start: normal.mapSupport.start,
        players: Object.freeze({
          min: normal.mapSupport.players.min,
          max: normal.mapSupport.players.max,
        }),
      }),
      settings: Object.freeze({
        startingCredits: normal.settings.startingCredits,
        popCap: normal.settings.popCap,
        structureCap: normal.settings.structureCap,
        fog: normal.settings.fog ?? "standard",
        friendlyFire: normal.settings.friendlyFire ?? (setting("friendlyFire").default as boolean),
        highGroundMissPerMille:
          normal.settings.highGroundMissPerMille ??
          (setting("highGroundMissPerMille").default as number),
        elimination: normal.settings.elimination ?? "annihilation",
      }),
      ...(normal.bots?.length && {
        bots: Object.freeze(
          [...normal.bots]
            .sort((a, b) => a.seat - b.seat)
            .map((bot) =>
              Object.freeze({
                seat: bot.seat,
                kind: bot.kind,
                ...(bot.force !== undefined && { force: bot.force }),
              }),
            ),
        ),
      }),
      forces: Object.freeze(
        [...normal.forces]
          .sort((a, b) => a.index - b.index)
          .map((force) =>
            Object.freeze({
              index: force.index,
              team: force.team,
              spawn: force.spawn,
              start: Object.freeze({
                structures: Object.freeze([...force.start.structures].sort()),
                units: Object.freeze(
                  [...force.start.units]
                    .sort((a, b) => (a.unit < b.unit ? -1 : a.unit > b.unit ? 1 : 0))
                    .map((unit) =>
                      Object.freeze({
                        unit: unit.unit,
                        count: unit.count,
                        pop: unit.pop,
                        role: unit.role,
                      }),
                    ),
                ),
                resources: Object.freeze(
                  Object.fromEntries(
                    Object.entries(force.start.resources).sort(([a], [b]) =>
                      a < b ? -1 : a > b ? 1 : 0,
                    ),
                  ),
                ),
              }),
            }),
          ),
      ),
    }),
  };
}

export function normalMatchIdentity(setup: MatchSetup): string | undefined {
  return setup.normal
    ? JSON.stringify(
        {
          seed: setup.seed,
          normal: setup.normal,
          forces: setup.forces,
          seats: setup.seats,
          grants: setup.grants,
          definitions: setup.definitions,
        },
        (_key, value: unknown) =>
          value !== null && typeof value === "object" && !Array.isArray(value)
            ? Object.fromEntries(
                Object.entries(value).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
              )
            : value,
      )
    : undefined;
}

/** Initialization is direct ECS state, never a debug command or paid construction operation. */
export function initializeNormalMatch(kernel: Kernel, setup: MatchSetup): void {
  const normal = setup.normal;
  const map = kernel.map;
  if (!normal || !map) return;
  kernel.world.register(KitStructure);
  const ore = compileOreCells(map);
  const staticObjects: NavigationObject[] = [];
  const placed: { x: number; y: number; radius: number }[] = [];
  const bases = new Map<number, { x: number; y: number; width: number; depth: number }>();
  for (const force of normal.forces) {
    const spawn = required(map.spawns.find((entry) => entry.id === force.spawn));
    const id = required(force.start.structures[0]);
    const index = setup.definitions.findIndex((def) => def.id === id);
    const def = required(setup.definitions[index]);
    const facing = (Math.floor((spawn.facing + 0x2000) / 0x4000) & 3) * 0x4000;
    const rotation = (((facing >>> 14) + 3) & 3) * 90;
    const [w, d] = required(def.footprint);
    const width = rotation % 180 ? d : w,
      depth = rotation % 180 ? w : d;
    const x = Math.floor((spawn.position[0] - width * 512 + 511) / 1024) * 1024;
    const y = Math.floor((spawn.position[1] - depth * 512 + 511) / 1024) * 1024;
    const payload = { definition: id, force: force.index, x, y, facing };
    if (!checkSpawnPlacement(kernel, setup.definitions, payload).ok)
      refuse(`headquarters does not fit spawn ${spawn.id}`);
    const entity = spawnEntity(kernel, index, def, payload);
    kernel.world.add(entity, KitStructure);
    staticObjects.push({ definition: id, position: [x, y], rotation, owner: spawn.id });
    bases.set(force.index, { x: Math.floor(x / 1024), y: Math.floor(y / 1024), width, depth });
  }
  const profiles = new Map<
    string,
    { grid: NavigationGrid; labels: Uint32Array; component?: number }
  >();
  for (const force of normal.forces) {
    const spawn = required(map.spawns.find((entry) => entry.id === force.spawn));
    const base = required(bases.get(force.index));
    const margin = force.start.units.reduce((sum, unit) => {
      const radius = required(
        required(setup.definitions.find((def) => def.id === unit.unit)).radiusSubcells,
      );
      return sum + unit.count * Math.max(1, Math.floor((2 * radius + 1023) / 1024));
    }, 0);
    for (const unit of force.start.units) {
      const index = setup.definitions.findIndex((def) => def.id === unit.unit);
      const def = required(setup.definitions[index]);
      const radius = required(def.radiusSubcells);
      const key = `${def.domain}:${radius}`;
      let profile = profiles.get(key);
      if (!profile) {
        const grid = compileNavigation(
          map,
          setup.definitions,
          { domain: def.domain as GroundDomain, radiusSubcells: radius },
          staticObjects,
        );
        profile = { grid, labels: labelReachability(grid) };
        profiles.set(key, profile);
      }
      const candidates: { x: number; y: number; cell: number; distance: number }[] = [];
      for (
        let y = Math.max(0, base.y - margin);
        y < Math.min(map.terrain.height, base.y + base.depth + margin);
        y++
      )
        for (
          let x = Math.max(0, base.x - margin);
          x < Math.min(map.terrain.width, base.x + base.width + margin);
          x++
        ) {
          const cell = y * map.terrain.width + x;
          if (!profile.grid.cost[cell]) continue;
          const px = x * 1024 + 512,
            py = y * 1024 + 512;
          candidates.push({
            x: px,
            y: py,
            cell,
            distance: (px - spawn.position[0]) ** 2 + (py - spawn.position[1]) ** 2,
          });
        }
      candidates.sort((a, b) => a.distance - b.distance || a.cell - b.cell);
      const anchor = candidates[0];
      if (!anchor) refuse(`no reachable starting area at ${spawn.id} for ${unit.unit}`);
      const labels = profile.labels;
      const component = required(labels[anchor.cell]);
      if (profile.component !== undefined && profile.component !== component)
        refuse(`starting spawns are disconnected for ${unit.unit}`);
      profile.component = component;
      if (
        unit.role === "harvester" &&
        !ore.some(({ cell, cap }) => cap > 0 && labels[cell] === component)
      )
        refuse(`starting harvester at ${spawn.id} cannot reach ore`);
      for (let count = 0; count < unit.count; count++) {
        const candidate = candidates.find(
          (point) =>
            labels[point.cell] === component &&
            placed.every(
              (other) =>
                (point.x - other.x) ** 2 + (point.y - other.y) ** 2 >= (radius + other.radius) ** 2,
            ),
        );
        if (!candidate) refuse(`starting kit does not fit the local area at ${spawn.id}`);
        const payload = {
          definition: unit.unit,
          force: force.index,
          x: candidate.x,
          y: candidate.y,
          facing: spawn.facing,
        };
        if (!checkSpawnPlacement(kernel, setup.definitions, payload).ok)
          refuse(`invalid starting unit placement at ${spawn.id}`);
        spawnEntity(kernel, index, def, payload);
        placed.push({ x: candidate.x, y: candidate.y, radius });
      }
    }
  }
}
