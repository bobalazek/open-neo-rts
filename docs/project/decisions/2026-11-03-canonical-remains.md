# 2026-11-03 — Canonical vehicle wrecks and structure rubble

**Contract.** Actual normal-combat destruction replaces non-foot units with
nonblocking wrecks and structures with footprint-blocking rubble. Foot infantry
and props leave none. Remains retain source definition, former Force, final
position/facing and creation tick. They are separate ECS actors without living
Template, Health or OwnerForce components: no population, vision, work, weapons,
build radius, income or Last Man Standing survival. Low rubble does not provide
opaque vision or projectile cover. Debug deletion, sale, surrender and unfinished
construction cancellation do not manufacture combat wrecks.

**Provisional interpretation.** The documented default decay after 500 wrecks
is one shared limit of 500 wrecks/rubble. On the next eligible death, discard the
oldest creation tick, breaking ties by stable entity ID, before adding new
remains. There is no invented timer. Navigation and placement retain only the
rotated rubble footprint and invalidate their derived caches after destruction
or eviction. A new remains actor replaces a destroyed one; it does not add a
living actor alongside it. The broader global entity limit is a separate rule.

**Visibility.** Only currently sighted cells disclose remains, including former
owners. Any visible rubble footprint cell suffices. Snapshots carry strict copied
opaque handles and public pose/type/Force only. Fog removes the live row and
revokes its handle; observed remains do not become ghost structures. Existing
last-seen living-structure memory continues its existing reconciliation rules.
Builder clearance/salvage and actual wreck rendering follow separately.

**Salvage boundary.** A canonical eligibility flag distinguishes unfinished
sites from completed actors. It is not exposed or converted into resources by
this slice. Value, work/rates and actual builder commands belong to 2-16b2;
never grant a refund or salvage resource merely for creating or evicting remains.
Repair/resurrection of wrecks and later specialist harvesters remain later work.

**Research.** [OpenRA's Husk trait](https://docs.openra.net/en/release/traits/#husk)
retains facing on separate remains. [Spring's builder command implementation](https://github.com/spring/spring/blob/develop/rts/Sim/Units/CommandAI/BuilderCAI.cpp)
handles feature reclamation through builder commands. These support separating
death products from live-unit behavior and clearance; our collision, cap and
visibility choices follow this project's design and are original code.

**Compatibility.** SIM49 registers canonical remains in normal matches. All
three scenario headers advance; the affected startup/replay golden hashes change
with the component schema. Debug mode's existing outcomes and assets are unchanged.
