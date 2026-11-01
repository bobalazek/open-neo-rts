# 2026-11-01 — One neutral extractor for raw-material and oil nodes

**Context.** Node placement was blocked because the design did not choose between neutral and faction-specific extraction structures, or between built and pre-placed oil structures.

**Decision.** Borut explicitly selected: “One neutral extractor built by any faction on either node type.” One neutral structure type is built by any faction's builder on either a raw-material node or an oil node. The structure belongs to the building Force. This resolves the built-extractor versus pre-placed capturable oil-derrick choice for this implementation.

Borut then requested a planning pass in the context of the other structures. The [fit proposal](../neutral-extractor-plan.md) separates this accepted direction from unresolved operating rules. Extractor-specific schema, geometry, numbers and content remain on hold during that review; the earlier implementation proposals were not accepted.

**Consequences.** Implement the shared node-placement rule and neutral extractor content, marked _Addition_ to the existing roster. Existing terrain, bounds, footprint and occupancy rules still apply; the bound resource node must permit its own extractor instead of blocking it as an unrelated resource. Use the same authoritative checker for previews and committed placement.

Phase 1b supplies placement and presentation. Construction progress, payment, production and extraction simulation remain phase 2. This decision does not approve costs, health, build time, extraction rates, depletion, refunds or final art; first-pass numbers and art retain their existing approval gates. Normal-match build radius and unit-clearance policy also remain separate owner decisions.
