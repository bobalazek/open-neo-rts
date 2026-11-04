# Temporary normal skirmishes from unsaved drafts

Follow-up: [draft scenario presets](./2026-11-04-draft-scenario-presets.md) now
extend the initial Training Grounds path with authored map/spawn/seed choices
and basic, idle or selected-unit mirror opponents. The trust and persistence
boundaries below still apply.

Task 2-38c2 now adds **Skirmish draft** beside the existing movement/placement
playtest. It uses the actual normal-session worker, Training Grounds, Eastern
Collective mirror and basic opposing bot. Combat, construction, production,
resources and fog retain normal commands and permissions; debug spawning is not
enabled. This extends the accepted first-playable scope without new simulation
rules or a simulation-version change.

The authoring resolver substitutes the selected unsaved definition in copied
inputs. Existing shared schema, reference, gameplay, provenance and GLB checks
gate launch. Metadata and checked model, wreck, icon and sound bytes become a
fixed snapshot for that preview and every restart. Later source-file edits do
not silently replace the preview. Runtime audio/source/formatter validation
parity remains task 2-38b2; a frozen sound is not a new audio-validation claim.

Supported drafts are existing core first-playable definitions, compatible
prerequisite-free priced units trained by its producers, and prerequisite-free
priced Eastern Collective or neutral structures. Compatible newly cloned units
enter only the temporary roster. Other factions, packs, props and definitions
outside this compatibility gate retain the debug movement/placement path; a
rejected normal draft reports the restriction without losing edits. Launch
eligibility does not guarantee every edited recipe or movement domain can run:
normal production still rejects incompatible commands, such as air units from a
land-only producer. Starter-kit and normal-map validation still reject an
incompatible setup. This is not arbitrary roster or opponent authoring.

The transition uses the existing native loading panel, native match HUD and
normal match menu. Cancel or **Return to draft** restores the retained editor.
Initialization and worker failure also return with a readable error. The preview
owns its worker, renderer and audio mixer; restarts reuse its mixer, while return
or failure releases it and its decoded buffers. The editor releases temporary
asset URLs and resumes its suspended model/panel rendering. Source files and
manifest are never written by playtesting.

Temporary content cannot enter normal save slots, autosaves or replay storage.
Save/load and quicksave are unavailable, and contextual show-once guidance is
not persisted. **Installed Field Manual** explicitly identifies the installed
reference; the selected actor's actual stats, recipes and help use the draft
catalog. Ordinary installed matches retain their existing persistence path.

Focused Chrome and WebKit journeys exercise changed health and a paid production
recipe, a genuine blocked exit, snapshot-preserving restart, retained edits,
zero source/save writes, audio-context cleanup and worker-failure recovery.
Headless normal simulations exercise draft weapon damage, production and a
terminal record/hash. These are scoped functional checks, not complete phase-2
acceptance or a human match-length/balance claim. Isolated weapon/destruction
previews and broader authored opponent/map presets remain 2-38c2 work; asset
gizmos remain 2-38d. The whole editor/playtest task remains open.
