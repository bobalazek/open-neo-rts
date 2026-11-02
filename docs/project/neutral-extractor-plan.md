# Neutral extractor: fit with the existing economy

Status: design proposal, 2026-11-01. The owner approved one neutral extractor built by any faction on either raw-material or oil nodes, then requested a planning pass in the context of the other structures. That shared-type direction is decided; the operating details below are recommendations, not approved stats or implementation instructions.

The [normal construction proposal](./construction-policy-proposal.md) makes the related footprint, expansion, payment and clearance recommendations concrete for owner review. It does not activate those rules or settle extraction rates and balance.

## Recommended role

Add one shared **Resource Extractor** (_Addition_) as a node producer. Keep the existing ore logistics, faction drop-offs and power structures. A shared design becomes owned by the building Force and uses its team color; “neutral” describes availability to every faction, not ownerless production.

| Existing part                                                | Current job                               | Extractor relationship                                                                                        |
| ------------------------------------------------------------ | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Combat Engineer / Field Technician / Nanite Constructor      | Build, repair and eventually capture      | Each can construct the same extractor; no fourth builder unit                                                 |
| Supply Drone / Supply Truck / Salvage Crawler                | Carry ore to a drop-off                   | Keep their transport role; no extra hauling requirement for nodes                                             |
| Supply Relay / Supply Depot / Salvage Center                 | Receive ore; include an initial harvester | Keep docking, queueing and faction identity; extractors do not receive cargo                                  |
| Power Matrix / Industrial Reactor / Power Generator          | Supply electrical capacity                | Extractors should consume capacity, rather than becoming another power plant                                  |
| Quantum Research Lab / production buildings / Salvage Center | Supply faction-specific resources         | Nodes should not generate quantum processing, industrial capacity or salvage points                           |
| Resource Extractor                                           | Work one bound node                       | Materials feed the materials bank; oil feeds credits, preserving the outputs described in the existing design |

See [shared faction roles](../design/factions/README.md), [economy](../design/economy.md) and [structure roles](../design/structures.md). Current data has 3×3 drop-offs using 20 power; power structures occupy 2×2 or 2×3 cells. Those are comparison points, not a prescription for the extractor's numbers.

The smallest fit is a separate producer, not a combined drop-off/refinery/power structure. Reusing drop-off behavior would couple node control to harvester docking and the Phoenix Initiative's salvage system. Three faction-specific extractors would add models and balance differences without solving a missing role; the approved shared type avoids that burden.

## Economy and progression constraints

- **Bootstrap:** every current faction starts with 5,000 credits and no materials. Recommend a credits-only extractor construction cost and early builder availability. A material cost or material-gated technology could force the opening to depend on salvage before its first extractor; salvage exists, but does not guarantee a reliable opening. The existing Dragon Tank already costs 100 materials, so this matters before late-game technology.
- **Power:** recommend a power consumer, using the existing power-off/brownout system. No new fuel stockpile, oil-to-electricity chain or generator-link network. How brownout scales extraction remains an owner decision; applying the existing production slowdown is the preferred starting rule.
- **Income:** no harvester, second refinery or manual resource-switch button. The bound node chooses the output. Preserve finite material deposits; leave oil depletion explicitly unresolved rather than inventing an amount to satisfy the schema.
- **Faction identity:** keep base yield shared initially. Existing power, logistics and salvage differences already distinguish the factions. Do not automatically apply factory-production or faction-resource bonuses to extraction.
- **Oil versus ore:** recommend oil as a contested supplemental credit source, preserving a reason to invest in ore logistics. Compare oil-first and additional-oil expansions with complete ore/drop-off investments, including power, travel, node scarcity and raid exposure. Reject or revise a balance/map draft if oil routinely removes that reason, or lets the Phoenix Initiative avoid its intended reliance on fights and salvage. An intentionally oil-dominant opening would need an explicit owner decision; shared yields alone do not protect faction identity.
- **Balance:** compare complete investments, including incremental power and builder travel. Existing drop-off prices include a harvester, so counting that vehicle again would distort the comparison. Choose cost, health, build time and yield together using a payback target; do not assign them separately as schema defaults. The current economy's credit-per-minute figures are targets, not proof of balance.
- **Recovery:** replacement Nanite Constructors currently cost materials as well as credits. Preserve that existing design for now, but flag loss-of-all-builders recovery in the economy review rather than silently making the extractor solve it.

## Placement and map control

**Opening/map readiness:** current spawn validation guarantees nearby ore, not reachable materials. Before a skirmish map claims to support material-dependent units, check a legal material site and route using each participating faction's actual builder domain and the chosen expansion policy. The Phoenix Initiative's tracked Nanite Constructor cannot cross shallow water under the accepted movement table. Missing, inaccessible and contested material sites must be deliberate map scenarios, with an approved alternative where required. Do not silently grant nearby nodes or starting materials, or change builders' movement to make a map pass. Debug sandboxes may still omit resources and show a truthful placement refusal.

Recommend a compact fixed footprint, with 2×2 as a candidate to compare visually against the 3×3 drop-offs. Do not lock it yet: material markers are 2×2, oil markers are 1×1, and their current centers do not share the same grid parity. Exact center matching would fail on one of them.

Use one explicit node anchor and a fixed structure footprint. Snap the extractor to the chosen node; let model pivots remain presentation details. A node-binding requirement must be separate from ordinary terrain checks: the existing `node` cell check currently bypasses land/ramp/surface restrictions. Preserve bounds, the four-cell edge margin, height, allowed terrain, rotated footprint and unrelated occupancy. Only the exact bound node may be exempt from resource blocking. Another node or an existing extractor still blocks placement.

**Proposed expansion rule requiring approval:** a builder may establish an extractor on a distant eligible node without an existing base nearby, but the extractor does not extend normal base-build radius. Otherwise distant nodes may require chains of unrelated structures, or one cheap extractor may become a remote base anchor. The debug-mode radius exception does not decide this normal-match rule.

That proposal concerns radius-based rules only. Territory rulesets replace radius with ownership; whether extraction may expand into unowned territory is a separate policy, not an implied exception.

One node supports one extractor. Destroying or selling the structure must not recreate the node's contents; reconstruction uses the same remaining deposit. Capture, rubble clearance, refunds and depleted-node handling follow their respective systems when implemented, with no new automatic refund or destruction rule here.

## Research behind the recommendation

- [OpenRA's refinery definition](https://github.com/OpenRA/OpenRA/blob/bleed/mods/ra/rules/structures.yaml#L1249-L1307) combines a refinery with an unload dock and resource storage. This supports keeping cargo logistics explicit rather than treating every income structure as a drop-off.
- [FAForever's basic Mass Extractor blueprint](https://github.com/FAForever/fa/blob/develop/units/UEB1103/UEB1103_unit.bp) separates engineer construction, deposit-restricted placement, resource production and energy upkeep. That separation is a useful structural precedent; its costs and rates are not copied.
- [Warzone 2100's official guide](https://github.com/Warzone2100/warzone2100/blob/master/doc/quickstartguide.asciidoc#getting-power) links builder-built oil derricks to generators. That model works for its spendable-power economy. Here power is capacity and credits/materials are separate stocks, so copying that dependency would redesign the existing economy.

Sources checked 2026-11-01. These are design comparisons, not evidence that the proposed economy is balanced.

## Smallest delivery and acceptance gate

1. Settle the producer role, grid anchor/footprint and normal expansion rule; reconcile the old separate capturable oil-derrick/material-mine references. Keep unresolved numbers visible.
2. **Phase 1b:** add only authoritative node placement, truthful preview reasons and one original shared model with team color, working animation and rubble. No harvesting, income or construction simulation. Do not create a production definition filled with arbitrary required stats merely to make validation green.
3. **Phase 2:** integrate builder construction, power, output and remaining node amounts with the real bank and command/replay path. Set the first balance draft as a set, then check opening, expansion, raiding and recovery against the existing structures.

Relevant failure cases are wrong/missing node, both node sizes, all rotations, ramps/cliffs, map edges, neighboring resources, occupied footprints, two simultaneous builders, stale preview, removal/rebuild and depleted material deposits. Verify these in one affected batch using the shared placement checker and existing replay/content tools; do not add per-model or per-edit suite loops.

The phase-2 desk/playtest set also needs an oil-first versus ore opening and a material opening with each builder domain, including an inaccessible or contested site. Those checks must challenge ore investment and faction identity rather than just confirm that a node pays out. No such balance or playtest result is claimed here.

Blast radius: structure roles and definitions, map resource kinds/anchors, authoritative placement, debug diagnostics/preview, model/resource visibility, builder build lists, economy/power, AI build choices, objectives that count held nodes, and canonical replay state. Stop extractor-specific implementation if it requires changing ore logistics, guessing oil depletion, or treating unapproved stats as settled. Continue independent renderer and debug-tool work.
