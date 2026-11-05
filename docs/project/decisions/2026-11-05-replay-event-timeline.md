# Replay event timeline

Date: 2026-11-05. Phase: 2-35c, event-navigation slice.

## Decision

The existing native replay timeline gains actual combat and Force outcome markers.
The host collects them only while verifying the complete input history; seeking
never appends events. They are derived presentation data, not trusted file fields,
simulation state or a new replay format.

Provisional presentation grouping is one combat marker per ten-second interval
(200 ticks), separately for All and each recorded seat. It uses the first positive
damage event observable by that view in the interval. The shared live combat-event
visibility predicate remains authoritative: visible locations or owned victims
may be shown; an owned hit does not disclose a hidden attacker origin. Force
elimination and surrender are public outcomes and retain their exact completed
tick. Two hours and at most eight Forces bound each view to 728 markers.

Only a verified terminal replay exposes copied annotations. The replay worker
sends them with projection resets/vision changes rather than every playback
update. Ordinary live workers gain no history or All-vision permission. Capturing
annotations leaves canonical hashes, gameplay outcomes and simulation version
unchanged.

## Interaction

The graphite Babylon transport keeps its original timeline and adds a compact
icon row. Close events share a pointer target; repeated clicks cycle its members,
with the actual event time and grouping guidance on hover. Previous/next event
icons beside the clock and comma/period shortcuts reach every distinct event tick.
Combat navigation seeks and pans to its permitted damage location; Force outcomes
seek without inventing a location. Semantic controls and a complete event list
retain keyboard/assistive access. Existing playback, vision and range controls
keep their order and behavior.

## Remaining

Recorded cameras, analytics overlays and delayed live spectating remain 2-35c.
The ten-second grouping is a provisional readability choice, not a claim to
classify separate tactical battles or show every shot.
