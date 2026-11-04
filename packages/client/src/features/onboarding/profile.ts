// shortcut: browser-local history; synchronize when account profiles ship.
export const GUIDANCE_KEY = "open-neo-rts.guidance.v1";
export const GUIDANCE_CHANGED = "open-neo-rts.guidance-changed";
export const HINTS = ["low-power", "under-attack", "counter", "idle-builder"] as const;
export type HintId = (typeof HINTS)[number];
export type HintLevel = "all" | "important" | "off";
export interface GuidanceProfile {
  format: 1;
  level: HintLevel;
  seen: HintId[];
}
export const defaultGuidance = (): GuidanceProfile => ({ format: 1, level: "important", seen: [] });
export function validateGuidance(value: unknown): GuidanceProfile {
  if (
    !value ||
    typeof value !== "object" ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  )
    throw new Error("Invalid guidance profile");
  const fields = Object.getOwnPropertyDescriptors(value);
  if (
    Reflect.ownKeys(value).length !== 3 ||
    Object.keys(fields).sort().join(",") !== "format,level,seen" ||
    Object.values(fields).some((field) => !("value" in field))
  )
    throw new Error("Invalid guidance fields");
  const { format, level, seen } = Object.fromEntries(
    Object.entries(fields).map(([key, field]) => [key, field.value]),
  );
  if (
    format !== 1 ||
    !["all", "important", "off"].includes(level) ||
    !Array.isArray(seen) ||
    seen.length > HINTS.length ||
    seen.some((id) => !HINTS.includes(id)) ||
    new Set(seen).size !== seen.length
  )
    throw new Error("Invalid guidance values");
  return { format: 1, level, seen: [...seen] };
}
export function readGuidance(storage?: Pick<Storage, "getItem">): GuidanceProfile {
  try {
    const raw = (storage ?? localStorage).getItem(GUIDANCE_KEY);
    return raw === null || raw.length > 1024
      ? defaultGuidance()
      : validateGuidance(JSON.parse(raw));
  } catch {
    return defaultGuidance();
  }
}
export function saveGuidance(value: GuidanceProfile, storage?: Pick<Storage, "setItem">) {
  (storage ?? localStorage).setItem(GUIDANCE_KEY, JSON.stringify(validateGuidance(value)));
}
