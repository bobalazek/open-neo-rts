import { type Grant, hasGrant } from "../../commands";
import { defineComponent } from "../../ecs";
import type { Kernel } from "../../kernel";
import type { NormalMatchSetup } from "../control";
import { canInspectEconomy } from "./permissions";

const MAX_AMOUNT = 0x7fffffff;
const FIELDS = {
  credits: "credits",
  materials: "materials",
  "industrial-capacity": "industrialCapacity",
  "salvage-points": "salvagePoints",
} as const;
export type StockResourceId = keyof typeof FIELDS;
export type StockBalances = Readonly<Record<StockResourceId, number>>;
/** Permission belongs to the feature charging the cost, never to ordinary army orders. */
export type SpendScope =
  | "economy.build"
  | "economy.transfer"
  | "production.queue"
  | "research.spend"
  | "unit.abilities"
  | "commander.abilities";
export type BankResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly reason:
        | "unknown_force"
        | "invalid_amounts"
        | "insufficient_funds"
        | "overflow"
        | "no_grant";
    };
export interface BankSnapshot {
  readonly force: number;
  readonly resources: StockBalances;
}
export interface ForceBanks {
  balance(force: number): StockBalances | undefined;
  spend(seat: number, force: number, amounts: unknown, scope: SpendScope): BankResult;
  /** Authoritative gameplay income, not a player command. */
  gain(force: number, amounts: unknown): BankResult;
  /** Add back a proven paid amount; the owning construction/production lifecycle prevents duplicate refunds. */
  refund(force: number, amounts: unknown): BankResult;
  /** Preflight every original Force before an atomic producer sale refunds its receipts. */
  refundBatch(payments: readonly BankSnapshot[]): BankResult;
  /** Copies only the banks this seat currently has economic permission to inspect. */
  snapshot(seat: number): BankSnapshot[];
}

/** One row per Force. Capacity resources are not spendable stock. */
export const ForceBank = defineComponent("ForceBank", {
  force: "u32",
  credits: "i32",
  materials: "i32",
  industrialCapacity: "i32",
  salvagePoints: "i32",
});
const resources = Object.keys(FIELDS).sort() as StockResourceId[];
const spendScopes: readonly SpendScope[] = [
  "economy.build",
  "economy.transfer",
  "production.queue",
  "research.spend",
  "unit.abilities",
  "commander.abilities",
];
const success: BankResult = Object.freeze({ ok: true });

/** Only own data properties on plain JSON objects count; prototype names, accessors and symbols refuse. */
function amounts(value: unknown): StockBalances | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)
    return undefined;
  const out: Record<StockResourceId, number> = {
    credits: 0,
    materials: 0,
    "industrial-capacity": 0,
    "salvage-points": 0,
  };
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string" || !Object.hasOwn(FIELDS, key)) return undefined;
    const amount: unknown = Object.getOwnPropertyDescriptor(value, key)?.value;
    if (
      typeof amount !== "number" ||
      !Number.isInteger(amount) ||
      amount < 0 ||
      amount > MAX_AMOUNT
    )
      return undefined;
    out[key as StockResourceId] = amount;
  }
  return out;
}

/** Initializes once, after starters. Only static IDs/grants are cached; balances live exclusively in World. */
export function initializeForceBanks(
  kernel: Kernel,
  forces: NormalMatchSetup["forces"],
  grants: readonly Grant[],
): ForceBanks {
  if (kernel.economy) throw new Error("Force banks are already initialized");
  const initial = [...forces]
    .sort((a, b) => a.index - b.index)
    .map((force) => ({ force: force.index, resources: amounts(force.start.resources) }));
  if (
    new Set(initial.map((force) => force.force)).size !== initial.length ||
    initial.some(
      (force) =>
        !Number.isInteger(force.force) ||
        force.force < 0 ||
        force.force > MAX_AMOUNT ||
        !force.resources,
    )
  )
    throw new Error(
      "Invalid Force bank initialization: require unique Force IDs and bounded stock resources",
    );
  const permissions = grants.map((grant) =>
    Object.freeze({ ...grant, scopes: Object.freeze([...grant.scopes]) }),
  );
  const ids = new Map<number, number>();
  const world = kernel.world;
  world.register(ForceBank);
  for (const entry of initial) {
    const id = world.create();
    const stock = entry.resources as StockBalances;
    world.add(id, ForceBank, {
      force: entry.force,
      credits: stock.credits,
      materials: stock.materials,
      industrialCapacity: stock["industrial-capacity"],
      salvagePoints: stock["salvage-points"],
    });
    ids.set(entry.force, id);
  }
  const balance = (force: number): StockBalances | undefined => {
    const id = ids.get(force);
    return id === undefined
      ? undefined
      : {
          credits: world.get(id, ForceBank, "credits"),
          materials: world.get(id, ForceBank, "materials"),
          "industrial-capacity": world.get(id, ForceBank, "industrialCapacity"),
          "salvage-points": world.get(id, ForceBank, "salvagePoints"),
        };
  };
  const change = (force: number, input: unknown, direction: 1 | -1): BankResult => {
    const id = ids.get(force);
    if (id === undefined) return { ok: false, reason: "unknown_force" };
    const requested = amounts(input);
    if (!requested) return { ok: false, reason: "invalid_amounts" };
    const next: Record<StockResourceId, number> = { ...requested };
    for (const resource of resources) {
      const value = world.get(id, ForceBank, FIELDS[resource]) + direction * requested[resource];
      if (value < 0) return { ok: false, reason: "insufficient_funds" };
      if (value > MAX_AMOUNT) return { ok: false, reason: "overflow" };
      next[resource] = value;
    }
    for (const resource of resources) world.set(id, ForceBank, FIELDS[resource], next[resource]);
    return success;
  };
  const gain = (force: number, input: unknown) => change(force, input, 1);
  const banks: ForceBanks = Object.freeze({
    balance,
    spend(seat: number, force: number, input: unknown, scope: SpendScope): BankResult {
      if (!ids.has(force)) return { ok: false, reason: "unknown_force" };
      if (!spendScopes.includes(scope) || !hasGrant(permissions, seat, force, scope, kernel.tick))
        return { ok: false, reason: "no_grant" };
      return change(force, input, -1);
    },
    gain,
    refund: gain,
    refundBatch(payments: readonly BankSnapshot[]): BankResult {
      const totals = new Map<number, Record<StockResourceId, number>>();
      for (const payment of payments) {
        const requested = amounts(payment.resources);
        const current = balance(payment.force);
        if (!current) return { ok: false, reason: "unknown_force" };
        if (!requested) return { ok: false, reason: "invalid_amounts" };
        const total = totals.get(payment.force) ?? {
          credits: 0,
          materials: 0,
          "industrial-capacity": 0,
          "salvage-points": 0,
        };
        for (const resource of resources) {
          total[resource] += requested[resource];
          if (total[resource] + current[resource] > MAX_AMOUNT)
            return { ok: false, reason: "overflow" };
        }
        totals.set(payment.force, total);
      }
      for (const [force, total] of [...totals].sort(([a], [b]) => a - b)) gain(force, total);
      return success;
    },
    snapshot(seat: number): BankSnapshot[] {
      return [...ids.keys()]
        .filter((force) => canInspectEconomy(permissions, seat, force, kernel.tick))
        .map((force) => ({ force, resources: balance(force) as StockBalances }));
    },
  });
  kernel.economy = banks;
  return banks;
}
