# 2026-11-04 — A catalog-backed native Field Manual

**Context.** The local skirmish has contextual recipe tooltips and controls help,
but no searchable roster reference. The owner wants sparse battlefield chrome,
native Babylon presentation and actual unit information. A separate read-only
reference keeps those details out of the ordinary command station.

**Decision.** Open `/manual` from Home, or the same controller in the paused match
menu. Browse the current Eastern Collective first-playable roster and shared
Resource Extractor: fifteen entries with original names, descriptions and icons.
Search combines name, description, role and ID terms; Units/Structures filtering,
empty results and a count retain the existing native search editor.

All health, vision, movement, costs, build time, prerequisites, production and
weapon facts come from compiled content. Missing recipes remain unavailable.
Produces/Builds lists follow the same supported roster as the HUD, including the
shared extractor, rather than advertising future content. Expandable armour
tables preserve each damage component's explicit zero, default and per-mille
modifier. They describe authored multipliers for eligible targets, not universal
counter rankings or final damage after range, splash, veterancy and modes.

The existing native gallery adapter accepts generic list/detail markers. Only
the manual uses the 32%/68% desktop split; existing galleries retain equal columns.
Narrow layouts stack. Selecting an entry focuses/reveals its detail heading;
Back to roster restores search focus. HTML keeps semantic controls and a usable
graphics fallback. The established graphite/warm-metal design remains intact.

**Original model inspection.** Inspect model opens the installed GLB in the
existing isolated orbit/zoom renderer, with a separate native control panel.
Desktop controls sit beside the scene; narrow controls sit above it. The preview
uses blue team materials, without adding a color-setting feature. Idle playback
honors the device and OS reduced-motion preferences at load. Failed fetches expose
Retry loading and Back; closing aborts fetches and disposes late graphics work.
Escape closes only this inspector and restores the initiating control. Neither
the manual nor inspector replaces or modifies the paused match.

**Scope and evidence.** This delivers the roster/reference slice of 2-37. Profile
hint levels and show-once state, HUD help labels, contextual More links and further
concept/control pages remain 2-37b; training and playtest integration retain their
own phase/tooling tasks. The technical review corrected future production/build
references; the visual reviewer returned `ship` for the supplied standalone,
model and Home desktop/narrow captures. Browser journeys cover actual native
search/choices, compiled values, empty results, model-failure retry and return to
the same paused worker. Existing Home pointer checks use the native-paint helper
instead of fixed coordinates, retaining actual canvas interaction after actions
move. Screen readers, physical input and Firefox remain unqualified.

SIM59, gameplay/cosmetic identities and authored content are unchanged. This
feature does not close phase 2, the twenty-match gate or human playtesting.
