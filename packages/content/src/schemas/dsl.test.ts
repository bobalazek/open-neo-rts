import { expect, test } from "bun:test";
import { obj, str, validate } from "./dsl";

test("strict objects reject prototype keys and require own fields", () => {
  const schema = obj({ name: str() });
  for (const key of ["constructor", "toString", "__proto__"])
    expect(validate(schema, JSON.parse(`{"name":"test","${key}":null}`))).toEqual([
      { path: `$.${key}`, message: "unknown field" },
    ]);
  expect(validate(schema, Object.create({ name: "inherited" }))).toEqual([
    { path: "$.name", message: "is required" },
  ]);
});
