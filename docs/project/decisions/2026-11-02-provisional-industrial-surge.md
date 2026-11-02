# 2026-11-02 — Industrial rewards and Mass Production Surge

The owner delegated missing implementation choices and requested functional
gameplay before tuning. Preserve the original Command Center power: +50%
production for 20 seconds, 120-second cooldown, 20 industrial capacity.

[OpenRA's ProductionTimeMultiplier trait](https://docs.openra.net/en/release/traits/#productiontimemultiplier)
keeps production modifiers separate from recipes. Reuse this repository's
integer production-rate/carry contract; no external gameplay code or balance
numbers are copied.

- The engine requires explicit `scope: "force"` on the single supported
  `modifyStat/productionSpeed` self-targeted ability effect. A raw ability
  without Force scope stays inactive. Compound, targeted, unbounded and
  unsupported effects reject rather than partly execute.
- **Addition / provisional faction values:** each real paid unit emerging from
  a Command Center, Barracks Complex or War Factory earns 1 industrial capacity,
  up to an earning cap of 100. Initial kits, included gifts, canceled work,
  zero-value receipts and blocked ready items earn nothing. Output is not held
  back by a full earning cap. This metadata is activated in its own faction PR.
- A living completed powered provider requires current `commander.abilities`.
  Activation atomically pays its existing cost once, then starts one canonical
  Force-wide effect and cooldown. Other providers cannot stack or bypass it.
  The active effect/cooldown survives provider loss, shutdown and EMP.
- Multiply the existing production rate by 1,500 per mille: normal production
  becomes 1,500; brownout becomes 750; off/EMP remains zero. Preserve completed
  work and its carried fraction on activation, expiration and power changes.
- Commander-only seats receive the provider's private Surge state and can issue
  activation through opaque handles, without gaining bank, power, production or
  army permissions. The server rechecks funds/grants at execution. The selected
  HUD shows the authored ability name, cost, cooldown and active duration.
- Approved free Dragon Tank/APC mode toggles remain free. Other commander
  powers, research and bot use of Surge are later tasks. These rewards are not
  a general resource-minting command.

SIM43 delivers the engine/schema/worker/HUD contract; original content remains
inactive until the separate authored activation slice. Changing simulation
outcomes requires another version bump and matching scenario/golden review.
