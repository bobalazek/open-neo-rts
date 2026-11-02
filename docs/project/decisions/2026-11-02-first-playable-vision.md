# 2026-11-02 — Terrain and opaque props first for visibility

**Context.** Fog rules specified circular vision and cliff occlusion but did not
provide tall-building blocker heights or temporary reveal durations.

**Decision.** The owner selected authored circular ranges, cliffs blocking sight
from below and existing opaque props for the first playable vision system.
Tall-building, smoke and firing-reveal rules follow when their data is defined.

**Consequences.** Implement the base visibility/observation boundary now without
inventing render-derived heights. Existing `movement-and-vision` props obstruct
vision beyond their occupied cells. Retain team sharing, shroud, exploration and
structure memory requirements. This is a scoped first-playable contract, not a
claim that later stealth/ability visibility is already implemented.
