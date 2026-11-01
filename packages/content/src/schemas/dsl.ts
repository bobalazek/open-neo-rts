// A tiny schema builder: one definition gives runtime validation (with JSON paths) and a JSON Schema for editors.

export interface Issue {
  path: string;
  message: string;
}

export interface Schema {
  readonly json: Record<string, unknown>;
  readonly optional?: boolean;
  check(value: unknown, path: string, issues: Issue[]): void;
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function schema(json: Record<string, unknown>, check: Schema["check"]): Schema {
  return { json, check };
}

export const opt = (s: Schema): Schema => ({ ...s, optional: true });

export const unknown = (description?: string): Schema =>
  schema(description ? { description } : {}, () => {});

export const str = (pattern?: RegExp, description?: string): Schema =>
  schema(
    {
      type: "string",
      ...(pattern && { pattern: pattern.source }),
      ...(description && { description }),
    },
    (v, path, issues) => {
      if (typeof v !== "string") issues.push({ path, message: "must be a string" });
      else if (pattern && !pattern.test(v))
        issues.push({ path, message: `must match ${pattern.source}` });
    },
  );

export const int = (min?: number, max?: number, description?: string): Schema =>
  schema(
    {
      type: "integer",
      ...(min !== undefined && { minimum: min }),
      ...(max !== undefined && { maximum: max }),
      ...(description && { description }),
    },
    (v, path, issues) => {
      if (typeof v !== "number" || !Number.isInteger(v))
        issues.push({ path, message: "must be an integer" });
      else rangeCheck(v, min, max, path, issues);
    },
  );

/** Decimal number in human units (cells, seconds); converted to integers by the loader. */
export const num = (min?: number, max?: number, description?: string): Schema =>
  schema(
    {
      type: "number",
      ...(min !== undefined && { minimum: min }),
      ...(max !== undefined && { maximum: max }),
      ...(description && { description }),
    },
    (v, path, issues) => {
      if (typeof v !== "number" || !Number.isFinite(v))
        issues.push({ path, message: "must be a number" });
      else rangeCheck(v, min, max, path, issues);
    },
  );

function rangeCheck(
  v: number,
  min: number | undefined,
  max: number | undefined,
  path: string,
  issues: Issue[],
) {
  if (min !== undefined && v < min) issues.push({ path, message: `must be at least ${min}` });
  if (max !== undefined && v > max) issues.push({ path, message: `must be at most ${max}` });
}

export const bool = (): Schema =>
  schema({ type: "boolean" }, (v, path, issues) => {
    if (typeof v !== "boolean") issues.push({ path, message: "must be true or false" });
  });

export const oneOf = (values: readonly string[], description?: string): Schema =>
  schema({ enum: [...values], ...(description && { description }) }, (v, path, issues) => {
    if (typeof v !== "string" || !values.includes(v)) {
      issues.push({ path, message: `must be one of: ${values.join(", ")}` });
    }
  });

export const arr = (item: Schema, min?: number, max?: number): Schema =>
  schema(
    {
      type: "array",
      items: item.json,
      ...(min !== undefined && { minItems: min }),
      ...(max !== undefined && { maxItems: max }),
    },
    (v, path, issues) => {
      if (!Array.isArray(v)) return void issues.push({ path, message: "must be an array" });
      if (min !== undefined && v.length < min)
        issues.push({ path, message: `needs at least ${min} items` });
      if (max !== undefined && v.length > max)
        issues.push({ path, message: `allows at most ${max} items` });
      for (const [i, x] of v.entries()) item.check(x, `${path}[${i}]`, issues);
    },
  );

export const rec = (value: Schema, keyPattern?: RegExp): Schema =>
  schema(
    {
      type: "object",
      additionalProperties: value.json,
      ...(keyPattern && { propertyNames: { pattern: keyPattern.source } }),
    },
    (v, path, issues) => {
      if (!isObject(v)) return void issues.push({ path, message: "must be an object" });
      for (const [k, x] of Object.entries(v)) {
        if (keyPattern && !keyPattern.test(k))
          issues.push({ path: `${path}.${k}`, message: `key must match ${keyPattern.source}` });
        value.check(x, `${path}.${k}`, issues);
      }
    },
  );

/** Strict object: unknown fields are reported, so typos never pass silently. `$schema` is always allowed. */
export const obj = (props: Record<string, Schema>, description?: string): Schema =>
  schema(
    {
      type: "object",
      ...(description && { description }),
      properties: {
        $schema: { type: "string" },
        ...Object.fromEntries(Object.entries(props).map(([k, s]) => [k, s.json])),
      },
      required: Object.entries(props)
        .filter(([, s]) => !s.optional)
        .map(([k]) => k),
      additionalProperties: false,
    },
    (v, path, issues) => {
      if (!isObject(v)) return void issues.push({ path, message: "must be an object" });
      for (const [k, s] of Object.entries(props)) {
        if (k in v) s.check(v[k], `${path}.${k}`, issues);
        else if (!s.optional) issues.push({ path: `${path}.${k}`, message: "is required" });
      }
      for (const k of Object.keys(v)) {
        if (k !== "$schema" && !(k in props))
          issues.push({ path: `${path}.${k}`, message: "unknown field" });
      }
    },
  );

export function validate(s: Schema, value: unknown): Issue[] {
  const issues: Issue[] = [];
  s.check(value, "$", issues);
  return issues;
}

export function toJsonSchema(s: Schema, title: string): Record<string, unknown> {
  return { $schema: "https://json-schema.org/draft/2020-12/schema", title, ...s.json };
}
