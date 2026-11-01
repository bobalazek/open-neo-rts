# 2026-11-01 — Trig differs between JS engines

Running the same 20,000 inputs through Bun (JavaScriptCore) and Node (V8), `Math.sin` differed on 917, `cos` on 888, `tan` on 8,118, `atan2` on 698, `exp` on 1,935, `log` on 556, `cbrt` on 2,155 and `hypot` on 8,436. `Math.pow` and `Math.sqrt` matched. The server runs Bun and players run V8, SpiderMonkey or JavaScriptCore, so any transcendental `Math` call in the simulation would desync replays and online play. Hence the integer-only rules in [numerics.md](../../engineering/numerics.md) and the lint plugin in `tools/biome/`.
