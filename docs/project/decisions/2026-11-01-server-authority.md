# 2026-11-01 — Server-authoritative deterministic simulation

**Context.** Multiplayer, replays and AI-vs-AI balancing all need a deterministic simulation. Classic RTS lockstep sends the full game state to every client, which exposes fog-of-war information to cheaters.

**Decision.** The simulation is deterministic and integer-only (no floats, no transcendental `Math`, measured to differ between Bun and V8), runs at 20 ticks per second, and is authoritative on the server. Clients send commands and receive visibility-filtered snapshots and deltas. Single player runs the same sim in a Web Worker behind the same projection.

**Consequences.** Map hacks can't work, because hidden state never reaches clients. Online play needs a server for every match. The numerics are strict and enforced by lint and cross-engine golden tests.
