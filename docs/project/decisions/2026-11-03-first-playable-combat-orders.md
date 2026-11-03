# 2026-11-03 — First-playable combat movement and Hold position

**Delivery split.** 2-17a connects explicit attack pursuit, attack-move engagement
and Hold position. Bounded Shift queues and remaining mixed context actions stay
2-17b; this does not declare the complete order model finished.

**Pursuit.** An explicit attack approaches a currently visible valid target using
the existing counted terrain navigation. Stop as soon as any eligible weapon can
fire from the current pose, including its range and line-of-fire requirements.
Keep the authored weapon reload. A target leaving current Force sight, dying or
becoming ineligible cancels its pursuit route. Do not track hidden actors or infer
their new positions from an old handle.

**Provisional finite movement.** Request one bounded route per visible target cell;
target movement into another cell permits a new route. After a route finishes,
movement within the same cell can also update its endpoint. Range lost after an actual
engagement resumes pursuit. Unreachable stationary targets keep the normal
nearest-reachable fallback without automatically resubmitting forever; explicit
new orders retry. A too-close target uses up to eight deterministic grid-centred
candidates in the weapon's min/max band, preferring the nearest reachable one.
This is required by the original Mobile EMP's minimum range. More elaborate firing
position search and tactical stances remain later work.
The Mobile EMP's original arc projectile is not activated by the existing
projectile feature; its probe establishes legal backing/target selection, not
functional original EMP firing. It is outside the accepted tier-1 mirror roster.

**Attack-move.** Retain the destination separately from its temporary movement
route. Pause when the existing priority selector finds a currently visible enemy
within legal firing range and line of fire; keep firing while such targets remain.
Resume the retained destination after they disappear or leave range. No unlimited
automatic chase or new aggression/leash numbers are introduced. A completed or
failed resumed route finishes the movement order rather than looping searches.
Ordinary move continues its route past enemies without this engagement pause.

**Hold.** `unit.hold` uses `unit.orders`, replaces movement/combat/work/boarding
orders, and keeps the unit at its current position. Existing automatic in-range
fire and body/turret aiming remain active; it does not pursue. H and the normal
command panel issue the same worker command. Its status is private to current
unit controllers. Accepted replacement orders remove it; refusals preserve it.
Production rally behavior and authored recipes/stats/assets are unchanged.

**Research.** OpenRA's [AttackFollow implementation](https://github.com/OpenRA/OpenRA/blob/bleed/OpenRA.Mods.Common/Traits/Attack/AttackFollow.cs)
separates requested targets, allowed movement, visibility and weapon range bands.
This supports the movement-versus-firing distinction; this implementation uses
this repository's original integer navigation and current-sight policy.

**Compatibility.** SIM51 adds canonical attack-move/hold rows and pursuit progress.
All three scenario headers and affected normal-match goldens advance. No content
activation, new dependencies or catalog identity changes are needed.
