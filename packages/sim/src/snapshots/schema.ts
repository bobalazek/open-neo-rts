import { obj, type Schema } from "@open-neo-rts/content";

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
