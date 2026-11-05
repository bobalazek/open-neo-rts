# 2026-11-05 — Construction clearance needs legal exterior goals

Issue [#298](https://github.com/bobalazek/open-neo-rts/issues/298) reproduced on
the actual Training Grounds Eastern Collective starting setup under SIM59.
Placing an Industrial Reactor at (23,19) on ticks 7 or 8 asked the departing
Supply Truck to move west, toward headquarters. Normal navigation replaced the
obstructed goal with a nearby legal position that still overlapped the future
reactor. Construction then reached its approved 40-tick deadline without charging.

SIM60 converts ground clearance destinations to exterior cell centers and skips
ones that fail the unit's existing navigation profile, preferring the nearest
reachable candidate. If no side has certified connectivity, a legal cell in the
same compiled physical region remains available to normal pathfinding: a
continuous start can be valid while its containing cell center is blocked.
Physical regions only exclude disconnected exits; they do not certify a path.
Air units retain their unsnapped direct destinations. This reuses compiled
navigation data and leaves the shared logistics/combat reachability query
unchanged; it does not add path searches, change movement's normal nearest-goal
policy or extend the clearance deadline.
An inaccessible exit can still time out, and an entirely obstructed set of exits
leaves the request waiting without issuing a misleading move.

The regression puts a radius-819 blocker between headquarters and a proposed
factory: it failed to create a site before the fix and now creates exactly one
paid site. Its tick-41 SIM60 golden is `3cc3d35a8ac588e3`. Two independent
regressions cover a legal exit across a cliff and a physically clear off-center
start whose containing center is blocked, including an ordinary-movement control.
Independent probes also cover radii 0–4096, air, off-map exits and all four exits
blocked, preserving funds until actual clearance or the existing timeout.
All eleven sampled starting-setup placements (ticks 0, 4–10, 12, 18 and 24) also created the reactor,
including both failing timings. Existing scripted movement/placement goldens are
unchanged because those scenarios do not exercise construction clearance.

The simulation version and all three committed scenario headers advance to 60.
Older-version saves and replays remain subject to the existing explicit
compatibility refusal; no migration is claimed. The twenty-seed SIM59 bot-mirror
qualification remains historical evidence, not a SIM60 phase-exit claim.
