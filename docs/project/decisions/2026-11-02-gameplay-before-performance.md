# 2026-11-02 — Build gameplay before finishing performance acceptance

**Context.** Phase 1b has delivered debug mode, terrain/navigation, placement,
selection, models and animation playback. Its 60 fps hardware target and native
key acceptance remain open. Repeated performance work delayed playable gameplay.

**Decision.** The owner explicitly changed the earlier strict phase-1b-first
instruction: stop performance optimization and proceed with functional gameplay.
Use the existing instanced models and animation system. Complete phase-2 tasks
whose design decisions are settled, beginning with shared content loading, then
construction, economy, production and combat toward a real bot skirmish.

**Consequences.** Phase 1b is not declared complete, and its FPS target is not
lowered. Performance and remaining animation refinements can be revisited after
the gameplay works. Pending balance and conflicting gameplay rules still require
owner decisions. Run validation in coherent batches instead of repeated full
suites after individual edits.
