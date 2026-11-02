# 2026-11-02 — Provisional deployed passenger fire

The owner's Metamorphic APC description says passengers fire from Bunker Mode.
The owner delegated missing implementation details for later polish. Keep the
five infantry slots, existing mode/cooldown and each passenger's authored weapon.

[OpenRA AttackGarrisoned](https://docs.openra.net/en/release/traits/#attackgarrisoned)
uses passenger weapons and fire ports. Our first pass uses the carrier centre
as one shared fire origin with a full firing arc: no authored port offsets or
port limits currently exist. This is a provisional geometry choice, not new
damage/range/reload balance. Dedicated port sockets/visuals can replace it later.

An explicit `transport.fireWhileDeployed` flag enables this behavior; only the
APC receives it in a separate faction activation. Packed transports do not grant
passenger fire. Passenger entities retain their own weapon/reload state, range,
damage and target-domain rules; deployed carrier bonuses do not buff them.
Packing interrupts bursts but keeps reload timers. Released infantry also keep
their reload timers, so unloading/reboarding cannot produce free shots.

Cargo remains non-spatial, unselectable and untargetable with no independent
vision or work. Target acquisition uses current Force sight and the carrier's
attack order, when present. Forward-aimed passenger weapons turn their own
weapon state, never the carrier. Traces ignore the carrier that emitted the
round. Launched rounds keep the original weapon/Force after packing, unloading
or carrier death. Visible firing effects identify the carrier, never private
cargo actor IDs or manifests. Owner-only cargo details show whether fire is on.

Air/naval transports, building garrisons and transformation visuals remain
separate tasks. This does not invent new weapons, ranges, rates or unit names.
