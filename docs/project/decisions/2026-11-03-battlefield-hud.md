# 2026-11-03 — A battlefield-first match HUD

**Context.** The owner rejected the large form-like interface and asked for a UI
pass comparable to established RTS games. The existing controls already drive
real worker commands; their visual hierarchy needed to change.

**Decision.** Use a slim resource strip and compact bottom command stations:
minimap, selected actor portrait/health, an icon command card with hotkeys, and a
four-column model-icon construction/production grid. Keep the original models,
faction content and simulation. Show numeric prices and duration directly;
unavailable recipes remain inspectable by keyboard and touch, with a visible
explanation. Narrow screens switch stations through tabs.

The references are StarCraft II, Age of Empires IV and Command & Conquer. Blizzard's
[interface update](https://news.blizzard.com/en-us/article/8724162/starcraft-ii-wings-of-liberty-patch-2-0-4)
documents consolidating system controls around the command card/minimap. The
[Age of Empires IV accessibility guidance](https://www.ageofempires.com/age-iv-accessibility/)
reinforces readable UI and accessible controls. The games' screenshots informed
composition; their artwork is not used in this project.

**Consequences.** Preserve context commands, placement, refunds, groups, pings,
worker privacy and keyboard names. Tooltips supplement visible prices rather than
replace them. Pings move into a compact disclosure. Construction controls and
recipe explanations remain reachable without enlarging the permanent dock.
This is a presentation pass; simulation version and content identities do not
change. World-art polish and the remaining functional roadmap stay separate work.
