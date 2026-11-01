import { ECS_FORMAT_VERSION, type World } from "../ecs";

export interface StateDifference {
  entity: number | null;
  component: string;
  field: string;
  a: number | null;
  b: number | null;
}

/** Reads the ECS's canonical serialization, including retired IDs and component presence. */
function canonicalState(
  world: World,
): Map<string, Omit<StateDifference, "a" | "b"> & { value: number }> {
  const bytes = world.serialize();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 0;
  const take = (type: string): number => {
    const value =
      type === "i32"
        ? view.getInt32(offset, true)
        : type === "u32"
          ? view.getUint32(offset, true)
          : type === "u16"
            ? view.getUint16(offset, true)
            : view.getUint8(offset);
    offset += type === "u8" ? 1 : type === "u16" ? 2 : 4;
    return value;
  };
  if (take("u32") !== ECS_FORMAT_VERSION) throw new Error("Unsupported canonical ECS format");
  const rows = new Map<string, Omit<StateDifference, "a" | "b"> & { value: number }>();
  const put = (entity: number | null, component: string, field: string, value: number) => {
    rows.set(JSON.stringify([entity, component, field]), { entity, component, field, value });
  };
  put(null, "$world", "nextId", take("u32"));
  let schema = "";
  for (let n = take("u32"); n > 0; n--) schema += String.fromCharCode(take("u8"));
  for (let n = take("u32"); n > 0; n--) put(take("u32"), "$entity", "present", 1);
  for (const definition of schema.split(";").filter(Boolean)) {
    const [name = "", fields = ""] = definition.slice(0, -1).split("{");
    for (let n = take("u32"); n > 0; n--) {
      const entity = take("u32");
      put(entity, name, "$present", 1);
      for (const field of fields.split(",").filter(Boolean)) {
        const [key = "", type = ""] = field.split(":");
        put(entity, name, key, take(type));
      }
    }
  }
  return rows;
}

/** Entity/component/field values in canonical order; null means absent in that world. */
export function diffWorlds(a: World, b: World): StateDifference[] {
  const left = canonicalState(a);
  const right = canonicalState(b);
  const differences: StateDifference[] = [];
  for (const key of new Set([...left.keys(), ...right.keys()])) {
    const av = left.get(key);
    const bv = right.get(key);
    const row = av ?? bv;
    if (row && av?.value !== bv?.value)
      differences.push({
        entity: row.entity,
        component: row.component,
        field: row.field,
        a: av?.value ?? null,
        b: bv?.value ?? null,
      });
  }
  return differences.sort(
    (a, b) =>
      (a.entity ?? 0) - (b.entity ?? 0) ||
      (a.component < b.component ? -1 : a.component > b.component ? 1 : 0) ||
      (a.field < b.field ? -1 : a.field > b.field ? 1 : 0),
  );
}
