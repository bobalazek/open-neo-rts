# Open Neo RTS client

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users and purpose

Players command a Force in a real-time strategy game: manage a base and economy,
produce units, navigate terrain, fight and win a skirmish. The current normal
match is an Eastern Collective mirror on Training Grounds against a basic bot.

## Capabilities and constraints

The client consumes permitted worker observations and emits validated commands;
presentation never changes simulation state. Existing selection, construction,
production, orders, minimap, saves and match-result behavior must survive UI work.
Online play and the complete three-faction game remain later roadmap phases.
See `../../docs/project/roadmap.md` and `../../docs/design/screens/match-hud.md`.

## Brand commitments

Keep the owner's original factions, names, content and brick models. The owner
rejected the current oversized form-like HUD and requested a UI comparable to
established RTS games. Use familiar RTS interface conventions and make the
battlefield the primary surface. Reference games studied for this pass are
StarCraft II, Age of Empires IV and Command & Conquer; their artwork is not an asset
source.

## Product principles

- The battlefield remains visible while the player commands units.
- Show the selected actors' actual state and context-appropriate controls.
- Preserve accessible names, keyboard controls and narrow-screen operation.
- The owner delegates routine choices; implement coherent defaults and review
  the running result instead of interrupting for repeated design approvals.
