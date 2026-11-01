# Neutral structures and map objects

Things on a map that belong to nobody at the start. They give maps character and reasons to fight over specific spots. All are content definitions placed in the map editor.

## Capturable tech structures

Engineer-type units capture them; the capturer gets the bonus while holding it. Captured tech structures can't be sold.

| Structure       | Bonus while held               |
| --------------- | ------------------------------ |
| Oil derrick     | +credits per minute            |
| Field hospital  | Heals nearby infantry          |
| Machine shop    | Repairs nearby vehicles        |
| Comm tower      | Reveals a large area around it |
| Airstrip ruin   | Lets aircraft rearm            |
| Rare-metal mine | Materials per minute           |

## Civilian buildings

- Most are **garrisonable** by infantry ([units-and-orders.md](units-and-orders.md#transports-and-garrisons)) and destructible.
- They block movement and vision like other structures.
- Destroying them gives nothing; they're terrain with hit points.

## Bridges

- Bridges are destructible structures spanning water or chasms. When destroyed, the nav grid updates at the next tick boundary and paths reroute.
- Engineers repair destroyed bridges at a **bridge hut** on either end.

## Crates (optional setting)

Off by default. When enabled in the lobby, crates spawn at random (seeded, deterministic) spots and give a small bonus to whoever picks them up: credits, a heal, a veterancy rank, or a map reveal. Competitive presets keep them off.

## Ambient objects

Wildlife and civilians walking around are **presentation only**: they live in the renderer, never in the sim, and can't be targeted.

## Non-happy paths

- **Two engineers capture in the same tick:** server order decides; the second is refunded and returns.
- **Capturing while under fire:** capture takes a few seconds and is cancelled if the engineer dies.
- **Capturing structure destroyed:** bonus ends immediately; ghosts in fog keep the last-seen owner until re-observed.
