# 2026-11-01 — Agent-made assets are credited to the owner

**Context.** First-pass models, props and textures are made by coding agents at the owner's direction ([first-pass models](./2026-11-01-first-pass-models.md)). Every asset needs a real `author` in `assets.json` for the credits screen, and authorship must never be invented.

**Decision.** Assets made by a coding agent at the owner's direction name **Borut Balazek** as `author`. Assets contributed by other people name that person, whatever tools they used.

**Consequences.** The credits screen lists the owner for first-pass art. A contributor who directs an agent credits themself, not the agent; review still checks that the asset is original work.
