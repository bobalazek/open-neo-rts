import type { ArmorClass, ResolvedCatalog, ResourceId } from "@open-neo-rts/content";
import { type Definition, type RepairDefinition, toDefinition } from "./definitions";
import type { GameplayWeapon } from "./weapons";

export type { GameplayWarhead, GameplayWeapon } from "./weapons";

type Data = Readonly<Record<string, unknown>>;
export type GameplayCost = Readonly<Partial<Record<ResourceId, number>>>;

export interface GameplayRecipe {
  readonly cost: GameplayCost;
  readonly buildTicks: number;
}

export interface GameplayEffect {
  readonly type: string;
  readonly scope?: string;
  readonly stat?: string;
  readonly target?: { readonly tags: readonly string[] };
  readonly perMille?: number;
  readonly amount?: { readonly value: number; readonly unit: string };
  readonly radiusSubcells?: number;
  readonly durationTicks?: number;
  readonly unit?: string;
}

export interface GameplayAbility {
  readonly id: string;
  readonly target: string;
  readonly cooldownTicks: number;
  readonly rangeSubcells?: number;
  readonly autoCast?: boolean;
  readonly cost?: GameplayCost;
  readonly effects: readonly GameplayEffect[];
}

export interface GameplayResearch {
  readonly id: string;
  readonly cost: GameplayCost;
  readonly researchTicks: number;
  readonly requires: readonly string[];
  readonly effects: readonly GameplayEffect[];
}

export type GameplayRepair = RepairDefinition;

/** Authored gameplay inputs only; compilation does not make a definition playable. */
export interface GameplayDefinition extends Definition {
  readonly kind: "unit" | "structure" | "prop";
  readonly role?: string;
  readonly family?: string;
  readonly tags: readonly string[];
  readonly armor?: ArmorClass;
  readonly resistPerMille?: Readonly<Record<string, number>>;
  readonly power?: number;
  readonly pop?: number;
  /** null means no authored paid construction recipe, never free construction. */
  readonly construction: GameplayRecipe | null;
  readonly requires: readonly string[];
  readonly producedBy: readonly string[];
  readonly produces: readonly string[];
  readonly builds: readonly string[];
  readonly spawnsWith: readonly string[];
  readonly weapons: readonly GameplayWeapon[];
  readonly abilities: readonly GameplayAbility[];
  readonly research: readonly GameplayResearch[];
  readonly turretTurnAnglePerTick?: number;
  readonly harvestCapacity?: number;
  readonly harvestAmountPerSecond?: number;
  readonly harvestResource?: ResourceId;
  readonly harvestAmount?: number;
  readonly crushable?: boolean;
  readonly transportSlots?: number;
  readonly ammo?: number;
  readonly dock?: boolean;
  readonly pads?: number;
  readonly garrisonSlots?: number;
  readonly repair?: GameplayRepair;
  readonly adjacency: readonly {
    readonly tags: readonly string[];
    readonly radiusSubcells: number;
    readonly stat: string;
    readonly perMille: number;
    readonly maxSources: number;
  }[];
}

export interface GameplayFaction {
  readonly id: string;
  readonly start: {
    readonly structures: readonly string[];
    readonly units: readonly { readonly unit: string; readonly count: number }[];
    readonly resources: GameplayCost;
  };
}

export interface GameplayCatalog {
  readonly gameplayHash: string;
  readonly definitions: readonly GameplayDefinition[];
  readonly factions: readonly GameplayFaction[];
}

const data = (value: unknown) => value as Data;
const list = (value: unknown) => (value ?? []) as readonly Data[];
const strings = (value: unknown) => [...((value ?? []) as readonly string[])];

function quantity(value: unknown, scale = 1, divisor = 1): number {
  const converted = Math.round(((value as number) * scale) / divisor);
  if (!Number.isSafeInteger(converted) || Math.abs(converted) > 0x7fffffff)
    throw new RangeError(`Gameplay quantity is outside the signed 32-bit range: ${value}`);
  return converted;
}

function numbers(value: unknown, scale = 1): Record<string, number> {
  return Object.fromEntries(
    Object.entries(data(value)).map(([key, amount]) => [key, quantity(amount, scale)]),
  );
}

function optionalNumber(
  source: Data,
  key: string,
  output: string,
  scale = 1,
  divisor = 1,
): Record<string, number> {
  return source[key] === undefined ? {} : { [output]: quantity(source[key], scale, divisor) };
}

function optionalValue(source: Data, key: string): Data {
  return source[key] === undefined ? {} : { [key]: source[key] };
}

/** Convert once at the content boundary. Raw catalog snapshots remain untouched. */
export function compileGameplayCatalog(catalog: ResolvedCatalog): GameplayCatalog {
  const qualify = (pack: string, reference: unknown): string => {
    const ref = reference as string;
    const prefix = ref.slice(0, ref.indexOf(":"));
    const qualified = prefix.includes(".");
    for (const scope of catalog.referenceScopes.get(pack) ?? []) {
      const id = qualified ? ref : `${scope}.${ref}`;
      if (qualified && !ref.startsWith(`${scope}.`)) continue;
      if (catalog.definitions.has(id)) return id;
    }
    throw new Error(`Unresolved gameplay reference from ${pack}: ${ref}`);
  };
  const refs = (pack: string, value: unknown) => strings(value).map((v) => qualify(pack, v));
  const effect = (pack: string, raw: Data): GameplayEffect => {
    let amount: GameplayEffect["amount"];
    if (raw.amount !== undefined) {
      const stat = raw.stat as string;
      const type = raw.type as string;
      if (type === "modifyStat" && ["range", "vision"].includes(stat))
        amount = { value: quantity(raw.amount, 1024), unit: "subcells" };
      else if (type === "modifyStat" && stat === "speed")
        amount = { value: quantity(raw.amount, 1024, 20), unit: "subcells-per-tick" };
      else if (type === "modifyStat" && stat === "reload")
        amount = { value: quantity(raw.amount, 20), unit: "ticks" };
      else if (["damageArea", "heal", "grantResource"].includes(type))
        amount = {
          value: quantity(raw.amount),
          unit: type === "grantResource" ? "resource" : "health",
        };
      else if (
        type === "modifyStat" &&
        ["damage", "health", "power", "cost", "shieldStrength"].includes(stat)
      )
        amount = { value: quantity(raw.amount), unit: stat };
      else throw new Error(`Unsupported gameplay effect amount: ${type}/${stat}`);
    }
    let target: GameplayEffect["target"];
    if (raw.target !== undefined) {
      const filter = data(raw.target);
      if (
        !filter ||
        typeof filter !== "object" ||
        Array.isArray(filter) ||
        Object.keys(filter).some((key) => key !== "tags") ||
        (filter.tags !== undefined &&
          (!Array.isArray(filter.tags) || filter.tags.some((tag) => typeof tag !== "string")))
      )
        throw new Error("Unsupported gameplay effect target filter");
      target = { tags: strings(filter.tags) };
    }
    return {
      type: raw.type as string,
      ...optionalValue(raw, "scope"),
      ...optionalValue(raw, "stat"),
      ...(target && { target }),
      ...optionalNumber(raw, "percent", "perMille", 10),
      ...(amount && { amount }),
      ...optionalNumber(raw, "radius", "radiusSubcells", 1024),
      ...optionalNumber(raw, "duration", "durationTicks", 20),
      ...(raw.unit !== undefined && { unit: qualify(pack, raw.unit) }),
    };
  };
  const weapon = (pack: string, raw: Data): GameplayWeapon => {
    const projectile = data(raw.projectile);
    const range = raw.range as readonly number[];
    if ((range[0] as number) > (range[1] as number))
      throw new Error(`Weapon ${raw.id} has an inverted range`);
    return {
      id: raw.id as string,
      targets: strings(raw.targets),
      rangeSubcells: [quantity(range[0], 1024), quantity(range[1], 1024)],
      reloadTicks: quantity(raw.reload, 20),
      ...(raw.burst !== undefined && {
        burst: {
          count: quantity(data(raw.burst).count),
          delayTicks: quantity(data(raw.burst).delay, 20),
        },
      }),
      ...optionalNumber(raw, "accuracy", "scatterSubcells", 1024),
      ...optionalValue(raw, "aim"),
      ...optionalNumber(raw, "arc", "arcAngle", 0x10000, 360),
      ...optionalValue(raw, "socket"),
      projectile: {
        kind: projectile.kind as string,
        ...optionalNumber(projectile, "speed", "speedSubcellsPerTick", 1024, 20),
        ...optionalNumber(projectile, "gravity", "gravityPerMille", 1000),
        ...optionalNumber(projectile, "turnRate", "turnAnglePerTick", 0x10000, 7200),
        ...optionalNumber(projectile, "flightTime", "flightTicks", 20),
        ...optionalNumber(projectile, "fuse", "fuseTicks", 20),
        ...(projectile.blockedBy !== undefined && { blockedBy: strings(projectile.blockedBy) }),
        ...optionalValue(projectile, "interceptable"),
      },
      warheads: list(raw.warheads).map((w) => ({
        type: w.type as string,
        ...optionalNumber(w, "amount", w.type === "burn" ? "amountPerSecond" : "amount"),
        ...(w.versus !== undefined && { versusPerMille: numbers(w.versus, 10) }),
        ...optionalNumber(w, "radius", "radiusSubcells", 1024),
        ...(w.falloff !== undefined && {
          falloffPerMille: (w.falloff as number[]).map((n) => quantity(n, 10)),
        }),
        ...optionalNumber(w, "delay", "delayTicks", 20),
        ...optionalNumber(w, "duration", "durationTicks", 20),
        ...optionalNumber(w, "percent", "perMille", 10),
        ...(w.unit !== undefined && { unit: qualify(pack, w.unit) }),
        ...optionalNumber(w, "count", "count"),
        ...optionalValue(w, "friendlyFire"),
        tags: strings(w.tags),
      })),
    };
  };
  const definitions: GameplayDefinition[] = [];
  const factions: GameplayFaction[] = [];
  for (const [id, raw] of [...catalog.definitions].sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0,
  )) {
    const pack = id.slice(0, id.indexOf("."));
    const kind = (raw.id as string).split(":")[0];
    if (kind === "faction") {
      const start = data(raw.start);
      factions.push({
        id,
        start: {
          structures: refs(pack, start.structures),
          units: list(start.units).map((u) => ({
            unit: qualify(pack, u.unit),
            count: quantity(u.count),
          })),
          resources: numbers(start.resources),
        },
      });
      continue;
    }
    if (kind !== "unit" && kind !== "structure" && kind !== "prop") continue;
    if (raw.eras !== undefined || raw.eraVariants !== undefined)
      throw new Error(`${id}: era selection is not supported by gameplay compilation`);
    if ((raw.cost === undefined) !== (raw.buildTime === undefined))
      throw new Error(`${id}: construction requires both cost and buildTime`);
    const repair = raw.repair === undefined ? undefined : data(raw.repair);
    const targets = repair && data(repair.targets);
    const harvest = raw.harvest === undefined ? undefined : data(raw.harvest);
    definitions.push({
      ...toDefinition({ ...raw, id }),
      kind,
      ...optionalValue(raw, "role"),
      ...optionalValue(raw, "family"),
      tags: strings(raw.tags),
      ...(raw.armor !== undefined && { armor: raw.armor as ArmorClass }),
      ...(raw.resist !== undefined && { resistPerMille: numbers(raw.resist, 10) }),
      ...optionalNumber(raw, "power", "power"),
      ...optionalNumber(raw, "pop", "pop"),
      construction:
        raw.cost === undefined
          ? null
          : { cost: numbers(raw.cost), buildTicks: quantity(raw.buildTime, 20) },
      requires: refs(pack, raw.requires),
      producedBy: refs(pack, raw.producedBy),
      produces: [],
      builds: [],
      spawnsWith: refs(pack, raw.spawnsWith),
      weapons: list(raw.weapons).map((w) => weapon(pack, w)),
      abilities: list(raw.abilities).map((a) => ({
        id: a.id as string,
        target: a.target as string,
        cooldownTicks: quantity(a.cooldown, 20),
        ...optionalNumber(a, "range", "rangeSubcells", 1024),
        ...optionalValue(a, "autoCast"),
        ...(a.cost !== undefined && { cost: numbers(a.cost) }),
        effects: list(a.effects).map((e) => effect(pack, e)),
      })),
      research: list(raw.research).map((r) => ({
        id: r.id as string,
        cost: numbers(r.cost),
        researchTicks: quantity(r.researchTime, 20),
        requires: refs(pack, r.requires),
        effects: list(r.effects).map((e) => effect(pack, e)),
      })),
      ...(raw.turret !== undefined && {
        turretTurnAnglePerTick: quantity(data(raw.turret).turnRate, 0x10000, 7200),
      }),
      ...(harvest?.capacity !== undefined && { harvestCapacity: quantity(harvest.capacity) }),
      ...(harvest?.amountPerSecond !== undefined && {
        harvestAmountPerSecond: quantity(harvest.amountPerSecond),
      }),
      ...(harvest?.resource !== undefined && { harvestResource: harvest.resource as ResourceId }),
      ...(harvest?.amount !== undefined && { harvestAmount: quantity(harvest.amount) }),
      ...(raw.destructible !== undefined && optionalValue(data(raw.destructible), "crushable")),
      ...(raw.transport !== undefined && { transportSlots: quantity(data(raw.transport).slots) }),
      ...optionalNumber(raw, "ammo", "ammo"),
      ...optionalValue(raw, "dock"),
      ...optionalNumber(raw, "pads", "pads"),
      ...(raw.garrison !== undefined && { garrisonSlots: quantity(data(raw.garrison).slots) }),
      ...(repair &&
        targets && {
          repair: {
            targets: {
              families: strings(targets.families),
              roles: strings(targets.roles),
              tags: strings(targets.tags),
              ...optionalValue(targets, "structures"),
            },
            rateMilliHealthPerSecond: quantity(repair.rate, 1000),
            ...optionalNumber(repair, "range", "rangeSubcells", 1024),
            ...optionalNumber(repair, "costPercent", "costPerMille", 10),
            ...optionalValue(repair, "automatic"),
          },
        }),
      adjacency: list(raw.adjacency).map((a) => ({
        tags: strings(a.tags),
        radiusSubcells: quantity(a.radius, 1024),
        stat: a.stat as string,
        perMille: quantity(a.percent, 10),
        maxSources: quantity(a.maxSources),
      })),
    });
  }
  return {
    gameplayHash: catalog.gameplayHash,
    definitions: definitions.map((definition) => {
      const pack = definition.id.slice(0, definition.id.indexOf("."));
      const owner = definition.id.slice(definition.id.indexOf(":") + 1).split("/")[0];
      return {
        ...definition,
        produces: definitions.filter((d) => d.producedBy.includes(definition.id)).map((d) => d.id),
        builds:
          definition.role !== "builder"
            ? []
            : definitions
                .filter(
                  (d) =>
                    d.kind === "structure" &&
                    d.construction !== null &&
                    (d.id.startsWith(`${pack}.structure:${owner}/`) ||
                      (catalog.referenceScopes.get(pack) ?? []).some((scope) =>
                        d.id.startsWith(`${scope}.structure:neutral/`),
                      )),
                )
                .map((d) => d.id),
      };
    }),
    factions,
  };
}
