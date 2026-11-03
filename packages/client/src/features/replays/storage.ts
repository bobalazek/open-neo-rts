import type { PackIdentity } from "@open-neo-rts/content";
import type { MatchRecord } from "@open-neo-rts/sim";
import { SIM_VERSION } from "@open-neo-rts/sim";
import { isRecord } from "../../worker/protocol";
import { type SkirmishSetup, validateSkirmish } from "../skirmish/setup";

export const MAX_REPLAY_BYTES = 64 * 1024 * 1024;
export interface SavedReplay {
  format: 1;
  id: string;
  name: string;
  createdAt: number;
  config: SkirmishSetup;
  packs: readonly PackIdentity[];
  cosmeticHash: string;
  winner: number | null;
  record: MatchRecord;
}
const fields = [
  "format",
  "id",
  "name",
  "createdAt",
  "config",
  "packs",
  "cosmeticHash",
  "winner",
  "record",
];
/** Cheap metadata check only; all imported histories must pass the isolated replay worker. */
export function parseSavedReplay(value: unknown): SavedReplay {
  if (
    !isRecord(value) ||
    Object.keys(value).length !== fields.length ||
    Object.keys(value).some((key) => !fields.includes(key)) ||
    value.format !== 1 ||
    typeof value.id !== "string" ||
    !/^[a-zA-Z0-9-]{1,80}$/.test(value.id) ||
    typeof value.name !== "string" ||
    !value.name.trim() ||
    value.name.length > 96 ||
    !Number.isSafeInteger(value.createdAt) ||
    Number(value.createdAt) < 0 ||
    Number(value.createdAt) > 8640000000000000 ||
    typeof value.cosmeticHash !== "string" ||
    !/^[a-f0-9]{16}$/.test(value.cosmeticHash) ||
    !(
      value.winner === null ||
      (Number.isSafeInteger(value.winner) &&
        Number(value.winner) >= 0 &&
        Number(value.winner) <= 0x7fffffff)
    ) ||
    !Array.isArray(value.packs) ||
    value.packs.length > 64 ||
    !value.packs.every(
      (pack) =>
        isRecord(pack) &&
        typeof pack.id === "string" &&
        typeof pack.version === "string" &&
        typeof pack.gameplay === "boolean" &&
        (pack.gameplayHash === null || typeof pack.gameplayHash === "string") &&
        typeof pack.cosmeticHash === "string",
    ) ||
    !isRecord(value.record) ||
    value.record.format !== 1 ||
    !Number.isSafeInteger(value.record.tick) ||
    Number(value.record.tick) < 1 ||
    Number(value.record.tick) > 144000 ||
    typeof value.record.hash !== "string" ||
    !/^[a-f0-9]{16}$/.test(value.record.hash) ||
    !isRecord(value.record.scenario) ||
    !Number.isSafeInteger(value.record.scenario.simVersion) ||
    !isRecord(value.record.scenario.setup) ||
    value.record.scenario.setup.debug !== false ||
    !isRecord(value.record.scenario.setup.normal) ||
    !Array.isArray(value.record.scenario.commands) ||
    value.record.scenario.commands.length > 100000
  )
    throw new Error("Invalid replay file");
  validateSkirmish(value.config);
  return value as unknown as SavedReplay;
}
export function replayCompatibility(
  replay: SavedReplay,
  packs: readonly PackIdentity[],
  cosmeticHash?: string | null,
) {
  if (replay.record.scenario.simVersion !== SIM_VERSION)
    return `Requires simulation ${replay.record.scenario.simVersion}; this version is ${SIM_VERSION}.`;
  const identity = (values: readonly PackIdentity[]) =>
    values
      .map((pack) => [pack.id, pack.version, pack.gameplay, pack.gameplayHash, pack.cosmeticHash])
      .sort((a, b) => (String(a[0]) < String(b[0]) ? -1 : String(a[0]) > String(b[0]) ? 1 : 0));
  if (
    replay.cosmeticHash !== cosmeticHash ||
    JSON.stringify(identity(replay.packs)) !== JSON.stringify(identity(packs))
  )
    return "Requires different installed content. Keep the original game version to watch this replay.";
  return null;
}
/** Legacy terminal record exports contain the resolved local setup, but no browser metadata. */
export function replayConfig(record: MatchRecord): SkirmishSetup {
  const normal = record.scenario.setup.normal;
  return validateSkirmish({
    format: 1,
    seed: record.scenario.setup.seed,
    yourSpawn: normal?.forces.find((force) => force.index === 0)?.spawn,
    otherSpawn: normal?.forces.find((force) => force.index === 1)?.spawn,
    startingCredits: normal?.settings.startingCredits,
    popCap: normal?.settings.popCap,
    structureCap: normal?.settings.structureCap,
    veterancy: normal?.settings.veterancy ?? true,
  });
}
export function replayTime(tick: number) {
  return `${Math.floor(tick / 1200)}:${String(Math.floor(tick / 20) % 60).padStart(2, "0")}`;
}
async function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let blocked = false;
    const request = indexedDB.open("open-neo-rts.replays", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("replays", { keyPath: "id" });
    request.onerror = () => reject(request.error ?? new Error("Replay storage unavailable"));
    request.onblocked = () => {
      blocked = true;
      reject(new Error("Close other game tabs to upgrade replay storage"));
    };
    request.onsuccess = () => {
      if (blocked) {
        request.result.close();
        return;
      }
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
  });
}
async function transaction<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await database();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction("replays", mode),
        request = action(tx.objectStore("replays"));
      tx.oncomplete = () => resolve(request.result);
      tx.onabort = tx.onerror = () =>
        reject(tx.error ?? request.error ?? new Error("Replay storage failed"));
    });
  } finally {
    db.close();
  }
}
async function change(id: IDBValidKey, expected: unknown, replacement?: SavedReplay) {
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("replays", "readwrite"),
        store = tx.objectStore("replays");
      let changed = false;
      const read = store.get(id);
      read.onsuccess = () => {
        if (JSON.stringify(read.result) !== JSON.stringify(expected)) {
          changed = true;
          tx.abort();
        } else if (replacement) store.put(replacement);
        else store.delete(id);
      };
      tx.oncomplete = () => resolve();
      tx.onabort = tx.onerror = () =>
        reject(
          new Error(
            changed
              ? "Replay changed in another tab. Refresh and try again."
              : "Replay storage failed",
          ),
        );
    });
  } finally {
    db.close();
  }
}
export const replayStore = {
  list: () => transaction<unknown[]>("readonly", (store) => store.getAll()),
  read: (id: string) =>
    transaction<unknown>("readonly", (store) => store.get(id)).then(parseSavedReplay),
  write: (replay: SavedReplay, expected?: unknown) => {
    parseSavedReplay(replay);
    return change(replay.id, expected, replay);
  },
  remove: (id: IDBValidKey, expected: unknown) => change(id, expected),
};
