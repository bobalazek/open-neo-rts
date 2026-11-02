# 2026-11-01 — One neutral extractor for raw-material and oil nodes

**Context.** Node placement was blocked because the design did not choose between neutral and faction-specific extraction structures, or between built and pre-placed oil structures.

**Decision.** Borut explicitly selected: “One neutral extractor built by any faction on either node type.” One neutral structure type is built by any faction's builder on either a raw-material node or an oil node. The structure belongs to the building Force. This resolves the built-extractor versus pre-placed capturable oil-derrick choice for this implementation.

Borut requested a planning pass in the context of the other structures, then on 2026-11-02 answered “Approve; implement placement and model” to the shared 2×2, existing-builder, Force-owned/team-colored, fixed-node-anchor design. Remote node placement is allowed without extending base radius. The later producer costs credits, consumes power and selects materials or credits from the node kind. Exact costs, rates and depletion remain a separate balance decision.

He separately answered “Use those provisional values” for 800 health, four-cell vision and −10 power, allowing debug spawning without filling in unapproved economy values. Cost, build time, rates and depletion stay unset. These are provisional debug numbers, not final balance approval.

The implementation uses the existing material-node grid convention for both kinds: footprint origin is `floor(node position / 1024) - 1` on each axis in simulation subcells. Material centre (10, 10) and oil centre (10.5, 10.5) therefore share the top-left anchor (9, 9). Marker and model visual pivots do not determine legality; all rotations retain that square anchor.

**Consequences.** Implement the shared node-placement rule and neutral extractor content, marked _Addition_ to the existing roster. Existing terrain, bounds, footprint and occupancy rules still apply; the bound resource node must permit its own extractor instead of blocking it as an unrelated resource. Use the same authoritative checker for previews and committed placement.

Phase 1b supplies placement and presentation. Construction progress, payment, production and extraction simulation remain phase 2. This decision does not approve costs, build time, extraction rates, depletion, refunds or final art. Normal-match radius/clearance beyond the extractor exception remain separate owner decisions. Borut explicitly retained strict phase-1b exit before phase-2 gameplay on 2026-11-02; native-key and foreground performance acceptance are not waived.
