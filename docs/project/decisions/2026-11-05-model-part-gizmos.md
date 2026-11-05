# Model part rotation gizmos

The phase-2 content editor already inspects authored part pivots through native
degree sliders. The remaining 2-38d part-gizmo slice adds Babylon rotation rings
to that same disclosure, without another mode or source-file operation.

Opening Part controls attaches the rings to the selected authored node. Dragging
stops clip playback and updates the same local offsets from its authored rest
quaternion. Internal angles retain sub-degree precision; sliders display rounded
degrees and remain the keyboard alternative. Focus help names the part and axis,
including when the picker has scrolled out of the narrow pane.

Closing the disclosure, entering definition/socket editing, destruction and
replacement detach the handles. Shared resets also detach them; visible controls
can reselect through their ordinary refresh. Each preview owns and disposes its
utility layer. Fire retains posed muzzle locations. Download GLB keeps the opened
bytes, apart from separately applied socket edits.

Babylon's local rotation handles require uniform world scale. The existing
numeric sliders remain available for models outside that native constraint.
No geometry, animation keys, definitions, dependencies, simulation state or
outcome hashes change. Remaining editor tabs, validation parity and full
phase-2 acceptance stay open.

Actual ring dragging exposed the native angle indicator's lazy GLSL compiler
lookup failing against external script URLs. The shared engine now supplies
the four compiler JS/WASM assets already shipped in the pinned Babylon
dependency. File-loader URLs resolve against the emitted module, including on
nested routes. No runtime CDN or new dependency is needed for this indicator.
The HTML build also emits root asset URLs, matching the application's existing
root routes and worker URLs, so a direct `/tools/content` load reaches its actual
entry module and styles instead of resolving them below `/tools/`.

This is an implementation choice under the owner's accepted provisional
autonomy. Qualification uses current Chrome stable and current Playwright
WebKit, one standard setup each.

Final source fix/typecheck/test/build passed. Ten content-tools journeys passed
against static built output in `/tmp/neo-part-gizmos-route-browser.log`; two
focused final journeys additionally checked the painted current-part tooltip
in `/tmp/neo-part-gizmos-review-browser.log`. The actual Babylon regression
retains 100 successive 0.2-degree drags around an authored rest quaternion and
rotated/scaled parent. Independent refutation closed precision, reset and built
URL findings. Fresh visual review opened all four corrected captures and scored
both named fixes resolved, SHIP at that scope. Hosted CI remains pending.
