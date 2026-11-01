# 2026-11-01 — Turborepo cache hid a type error

With source-only packages (no build step), `turbo run typecheck` hashed only each package's own files. Breaking an exported type in one package left its dependents' typecheck as a cache hit, so CI would have reported green over a real error. Fix: a `transit` task (`"dependsOn": ["^transit"]`) that `typecheck` and `test` depend on, plus `globalDependencies` for the root tsconfig, Biome config and lint plugin ([turbo.json](../../../turbo.json)).
