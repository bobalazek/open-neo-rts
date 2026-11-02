# 2026-11-02 — Cache owned model matrices without losing animated poses

The original 200-unit CPU diagnostic identified repeated parent synchronization,
world-matrix queries and lazy world bounds as substantial frame work. Merely
changing culling strategies does not bypass the expensive bounds update.

Babylon 9.33.1 can reuse frozen matrices, but freezing animated hierarchies needs
explicit invalidation. `TransformNode.markAsDirty()` returns early when a node is
already dirty; its descendants and render ID may therefore remain unchanged.
Root-only and ordinary all-node invalidation both produced stale actual Dragon
Tank turret poses in adversarial same-frame queries. Eager parent-first refresh
preserved geometry but made completed-frame intervals about 10% longer in four
matched headless runs, despite a shorter measured scene span. Those variants were
rejected, and their original artifacts are retained.

The candidate invokes the public `Node.markAsDirty` base primitive separately on
every owned stock node and the known entity root. On the pinned version this
unconditionally invalidates the render ID and dirty state without recursive
propagation; ordinary queries then recompute through the normal matrix and bounds
hooks. Exact constructors and built-in dirty hooks are required. Custom,
camera-dependent, infinite-distance, initially frozen, skeleton and morph graphs
keep the original path. Recheck the subclass hooks on Babylon upgrades. General
[freeze guidance](https://doc.babylonjs.com/features/featuresDeepDive/scene/optimize_your_scene/#reducing-world-matrices-computation)
does not promise this animated-graph behavior across versions.

Frozen implementation `c677adb8eb465e6bcecd9e74d85dd9690c33562f` passed 19
focused tests / 218 assertions, repository typecheck/test and app build. Separate
fresh correctness and evidence reviews found no blocking issue. Physical poses,
final forced matrices, bounds, frustum results and geometry hits are preserved;
the candidate may refresh an intermediate same-frame query sooner than the
baseline. This is not identical cache-query freshness at every intermediate step.

One production/minified headless pair with the original scene, commands, assets,
worker, camera, Medium settings, 200 moving roots and 250 draws measured mean
completed-frame intervals **25.6712 → 21.1649 ms**, about **17.55% lower**. Mean
before-animation-to-after-render span was **23.1908 → 19.0550 ms**; it is elapsed
scene time, not OS CPU utilization. The path was active: zero versus 5,800 frozen
descendants. Initial paused PNGs were byte-identical; animated pose proof comes
from separate geometry comparisons, not those PNGs.

The measured predecessor source differs from the final implementation only by a
conservative morph fallback, a comment and a stronger test oracle; the original
benchmark has no skin or morph targets. Both short profiling windows include a
large early interval. Removing the same index only as sensitivity retains about
17.2% improvement; complete arrays remain the primary result. This single ordered
pair has no variance estimate or control for changing host load. It does not
establish hardware FPS or complete 1B-58. The qualified baseline remains 50.373
fps until a fresh foreground measurement confirms the candidate.

Local raw evidence and source hashes:
`/tmp/neo-art-completion/evidence/model-world-cache/node-base/`; repository check
logs: its sibling `assembled/`. These are local artifacts, not public uploads.
