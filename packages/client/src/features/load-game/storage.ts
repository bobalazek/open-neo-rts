import type { PackIdentity } from "@open-neo-rts/content";
import { addString, createHasher, digest } from "@open-neo-rts/deterministic";
import { type MatchSnapshot, SIM_VERSION, serializeMatchMap } from "@open-neo-rts/sim";
import { text } from "../../shared";
import { isRecord } from "../../worker/protocol";
import { type SkirmishSetup, validateSkirmish } from "../skirmish/setup";

export type SaveKind = "manual" | "quick" | "auto";
export interface SavedGame {
  format: 1;
  id: string;
  name: string;
  kind: SaveKind;
  createdAt: number;
  config: SkirmishSetup;
  thumbnail: string;
  packs: readonly PackIdentity[];
  cosmeticHash: string;
  mapHash: string;
  match: MatchSnapshot;
}
export const MAX_SAVE_BYTES = 64 * 1024 * 1024;
const fields = [
  "format",
  "id",
  "name",
  "kind",
  "createdAt",
  "config",
  "thumbnail",
  "packs",
  "cosmeticHash",
  "mapHash",
  "match",
];

export function saveMapHash(match: MatchSnapshot): string {
  const hash = createHasher();
  addString(hash, serializeMatchMap(match.scenario.setup.map));
  return digest(hash).hex;
}

/** Metadata parsing stays cheap; full state/history verification happens in the replacement worker. */
export function parseSavedGame(value: unknown): SavedGame {
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
    !["manual", "quick", "auto"].includes(String(value.kind)) ||
    !Number.isSafeInteger(value.createdAt) ||
    Number(value.createdAt) < 0 ||
    Number(value.createdAt) > 8640000000000000 ||
    typeof value.thumbnail !== "string" ||
    value.thumbnail.length > 1024 * 1024 ||
    !/^data:image\/(?:jpeg|png);base64,[a-zA-Z0-9+/=]+$/.test(value.thumbnail) ||
    typeof value.cosmeticHash !== "string" ||
    !/^[a-f0-9]{16}$/.test(value.cosmeticHash) ||
    typeof value.mapHash !== "string" ||
    !/^[a-f0-9]{16}$/.test(value.mapHash) ||
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
    !isRecord(value.match) ||
    value.match.format !== 1 ||
    !Number.isSafeInteger(value.match.simVersion) ||
    !Number.isSafeInteger(value.match.tick) ||
    Number(value.match.tick) < 0 ||
    !isRecord(value.match.scenario) ||
    !isRecord(value.match.scenario.setup) ||
    !isRecord(value.match.scenario.setup.normal)
  )
    throw new Error("Invalid saved game file");
  validateSkirmish(value.config);
  return value as unknown as SavedGame;
}

export function saveCompatibility(save: SavedGame, gameplayHash?: string): string | null {
  if (save.match.simVersion !== SIM_VERSION)
    return text("ui.saves.version", { saved: save.match.simVersion, current: SIM_VERSION });
  if (gameplayHash && save.match.scenario.setup.normal?.gameplayHash !== gameplayHash)
    return text("ui.saves.content");
  return null;
}

async function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let blocked = false;
    const request = indexedDB.open("open-neo-rts.saves", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("saves", { keyPath: "id" });
    request.onerror = () => reject(request.error ?? new Error("Save storage unavailable"));
    request.onblocked = () => {
      blocked = true;
      reject(new Error("Close other game tabs to upgrade save storage"));
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
      const tx = db.transaction("saves", mode);
      const request = action(tx.objectStore("saves"));
      tx.oncomplete = () => resolve(request.result);
      tx.onabort = tx.onerror = () =>
        reject(tx.error ?? request.error ?? new Error("Save storage failed"));
    });
  } finally {
    db.close();
  }
}

export const saveStore = {
  list: () => transaction<unknown[]>("readonly", (store) => store.getAll()),
  read: (id: string) =>
    transaction<unknown>("readonly", (store) => store.get(id)).then(parseSavedGame),
  write: (save: SavedGame) => {
    parseSavedGame(save);
    return transaction("readwrite", (store) => store.put(save));
  },
  async remove(id: string, expected: unknown): Promise<void> {
    const db = await database();
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction("saves", "readwrite"),
          store = tx.objectStore("saves");
        let changed = false;
        const request = store.get(id);
        request.onsuccess = () => {
          if (JSON.stringify(request.result) !== JSON.stringify(expected)) {
            changed = true;
            tx.abort();
          } else store.delete(id);
        };
        tx.oncomplete = () => resolve();
        tx.onabort = tx.onerror = () =>
          reject(new Error(changed ? text("ui.saves.changed") : text("ui.saves.failed")));
      });
    } finally {
      db.close();
    }
  },
};

/** Capture immediately after a render, before the graphics backbuffer is cleared. */
export function saveThumbnail(canvas: HTMLCanvasElement): string {
  const thumbnail = document.createElement("canvas");
  thumbnail.width = 320;
  thumbnail.height = 180;
  const context = thumbnail.getContext("2d");
  if (!context) throw new Error("Save preview unavailable");
  context.drawImage(canvas, 0, 0, 320, 180);
  return thumbnail.toDataURL("image/jpeg", 0.75);
}
