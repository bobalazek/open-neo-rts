# Draft skirmish terrain and opponents

Task 2-38c2 now lets an author configure a temporary normal skirmish before
leaving the retained definition editor. The native Babylon panel offers all six
installed authored maps, their actual spawn sides, an unsigned integer seed,
and three opponent presets: the existing basic skirmish bot, an idle Eastern
Collective opening, or a mirror of the selected supported ground unit with an
idle opponent controller. Units still use ordinary automatic combat behavior.

The mirror is an authoring setup, not a balance change: provisionally add one
instance of the copied draft unit to each Force's starting kit. If it is already
a starter, increment that existing entry instead of introducing a duplicate.
Keep the authored population/role/stats and all normal kit, cap and placement
validation. Structures use the faction-opening presets; aircraft and naval
mirrors remain outside the current ground-match scope.

Sandbox maps keep their authored terrain, resources and spawn positions. Only
the temporary setup supplies faction starts on their otherwise empty map. Dry
maps omit starting harvesters, because the normal initializer requires every
starting harvester to reach ore. A harvester mirror therefore needs a map with
ore. Do not invent resource fields or relax reachability to make a preview load.
The finite starting budget and absent income on dry maps are intentional tool
conditions, not claims about normal match balance.

Duplicate spawn sides and invalid seeds block Start. Native select changes and
ordinary keyboard input share validation. Cancel, Escape and leaving content
tools remove the panel without losing edits or starting a worker. Confirming
the panel still passes through the existing draft/content and normal-worker
validators; setup or worker errors return to the retained editor.

The source owns a copied frozen scenario alongside its copied definition and
asset bytes. Restart reuses all of them. The existing normal HUD, commands,
minimap, fog, combat, menus and audio run on the selected map. Source files,
normal saved setup defaults, saves, autosaves and replay storage retain their
existing isolation. Quick play still uses the installed Training Grounds mirror.

Headless checks initialize all six real authored terrain maps, validate mirrored
kits, retain default setup equality, reject invalid inputs and compare restored
continuation. Current Chrome and WebKit journeys cover native configuration,
cancel, actual map/kit/seed delivery, restart, retained edits and zero source
writes. Shared previous draft journeys retain paid recipe, audio cleanup and
worker-failure coverage. This closes the remaining scenario-preset portion of
2-38c2; asset editing, damage-socket effects and remaining viewer controls stay
with 2-38d. Full phase-2 acceptance and later phases remain open. SIM59 and
authored gameplay/content are unchanged.
