# Firing and destruction in the isolated model tools

The phase-2 model viewer now provides **Fire**, **Destroy** and **Restore model**
through the existing native content-tools pane. They also remain available while
editing a definition. Preview uses the loaded snapshot, including unsaved edits
after **Preview model**; editing a form field alone does not silently apply it.
No source file, save, normal match or simulation state changes.
Native contextual help clears when focus moves out of the pane to the model.

Fire resolves each authored weapon's assigned socket (default `socket_muzzle`),
including the indexed socket names accepted by the project validator. Local
standalone GLBs use their muzzle sockets without requiring a definition. Missing
assigned sockets disable firing instead of substituting another weapon's socket.
The model plays `fire_recoil`, or `attack` when available. A short original-code
muzzle flash and tracer show the actual world-space socket position and +Z
direction. The tracer is a fixed model-relative direction aid, not a gameplay
range, accuracy, burst or projectile simulation. These controls do not play audio.

Destroy plays the complete authored `death` clip when present. Other models
scatter at most 32 visible original geometry pieces, sharing their actual
materials, before showing the paired authored wreck/rubble. Same-named turret
and barrel pivots carry their aiming rotation relative to rest into the wreck,
preserving its authored tilt and other geometry.
Standalone art without a paired wreck disappears after its effect; it does not
invent replacement content. Restore clears effects, returns the live model to
rest and retains the chosen team colour, LOD and damage-state settings.

Installed and edited definitions load their paired wreck as part of the same
candidate. Both runtime files pass the existing bounded, self-contained model
inspection before replacement. A failed or superseded pair keeps the last good
view and offers retry. Temporary effects, copied pieces and paired model
containers are released on replacement/disposal. Suspending the retained editor
also suspends preview effects rather than advancing them during a playtest.
The shared Field Manual/legacy preview callers keep their existing no-options
model load path.

This implements the isolated firing/destruction portion of 2-38c2; broader
authored map/opponent presets remain. Full save-validation/formatter parity,
socket/part gizmos and GLB export, smoke/fire damage-socket previews and other
documented editor controls remain unfinished. The normal renderer's construction
and debris polish tasks are separate. No new content, dependency or simulation
version is introduced.
