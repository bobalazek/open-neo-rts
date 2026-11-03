import { obj, type Schema } from "@open-neo-rts/content";

/** Sorted bounded integer JSON, before imported sizes reach feature allocations. */
export function canonicalJson(value: unknown): string {
  let remaining = 8 * 1024 * 1024;
  let characters = 0;
  const visit = (input: unknown, depth: number): unknown => {
    if (--remaining < 0 || depth > 32) throw new Error("Snapshot exceeds JSON limits");
    if (input === null || typeof input === "boolean") return input;
    if (typeof input === "number" && Number.isSafeInteger(input)) return input;
    if (typeof input === "string") {
      characters += input.length;
      if (characters > 64 * 1024 * 1024) throw new Error("Snapshot exceeds text limit");
      return input;
    }
    if (typeof input !== "object" || !input) throw new Error("Snapshot requires integer JSON");
    const array = Array.isArray(input);
    if (
      !array &&
      Object.getPrototypeOf(input) !== Object.prototype &&
      Object.getPrototypeOf(input) !== null
    )
      throw new Error("Snapshot requires plain JSON objects");
    if (
      Reflect.ownKeys(input).some(
        (key) =>
          typeof key !== "string" ||
          (!(array && key === "length") &&
            !Object.getOwnPropertyDescriptor(input, key)?.enumerable) ||
          !Object.hasOwn(Object.getOwnPropertyDescriptor(input, key) ?? {}, "value"),
      )
    )
      throw new Error("Snapshot requires own data properties");
    if (array) {
      if (input.length > remaining || Object.keys(input).length !== input.length)
        throw new Error("Snapshot requires bounded dense arrays");
      return input.map((item) => visit(item, depth + 1));
    }
    return Object.fromEntries(
      Object.keys(input)
        .sort()
        .map((key) => [key, visit((input as Record<string, unknown>)[key], depth + 1)]),
    );
  };
  return JSON.stringify(visit(value, 0));
}

// The content DSL allows editor $schema annotations; the canonical log has no metadata fields.
export function strictObject(props: Record<string, Schema>): Schema {
  const schema = obj(props);
  return {
    ...schema,
    check(value, path, issues) {
      schema.check(value, path, issues);
      if (typeof value !== "object" || value === null || Array.isArray(value)) return;
      for (const key of Object.keys(value)) {
        const field = `${path}.${key}`;
        if (!Object.hasOwn(props, key) && !issues.some((issue) => issue.path === field))
          issues.push({ path: field, message: "unknown field" });
      }
    },
  };
}
