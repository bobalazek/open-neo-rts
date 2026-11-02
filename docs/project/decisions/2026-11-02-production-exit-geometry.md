# 2026-11-02 — Separate legal production exits from art sockets

**Context.** Barracks Complex door sockets lie inside its blocking footprint;
the War Factory socket is on its boundary. The Command Center has no exit socket,
and the Supply Depot has a logistics dock but no production exit. Directly
spawning at those visual points would put new units inside blocked cells.

**Decision.** Use explicit gameplay exit side/cell metadata, rotated with the
footprint. Align the Barracks Complex's two exits to its front doors and the War
Factory's exit to its front centre. Minimal _Addition_: use front-centre gameplay
exits for Command Center builder production and Supply Depot trucks. Keep the
drop-off dock separate. These are implementation geometry choices under the
existing production-exit requirement, not new balance or roster decisions.

The engine derives outward cell-centre positions using each produced unit's
collision radius and ordinary navigation/occupancy checks. A completed unit waits
when its authored exits are blocked; it does not teleport to another side. Rally
points use normal movement after spawning. Without a rally, the unit remains at
its legal exit until ordered away.

**Consequences.** No render model or floating-point brick source enters the sim.
Exits, population, slots and queues remain validated content/canonical state.
The five-item limit includes active and waiting player items; included trucks
are separate once-only gifts. Population checks use current live Force units,
without a new reservation rule, and recheck each spawn in canonical order.

Enqueueing itself is free. Ingest-phase valid construction payments happen
before production starts in the economy phase. Eligible production heads then
compete in enqueue/item order across producers; a blocked head holds only its
own producer. Paid work/output retains canonical producer/slot order. This makes
the existing phase contract explicit without reserving money at enqueue time.

[OpenRA's Exit trait](https://docs.openra.net/en/release/traits/#exit) separates
visual spawn offset from the legal exit cell; its
[production implementation](https://github.com/OpenRA/OpenRA/blob/bleed/OpenRA.Mods.Common/Traits/Production.cs)
waits when no permitted exit is usable. These are structural precedents, not
copied gameplay values. Sources checked 2026-11-02.
