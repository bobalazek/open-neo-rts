# 2026-11-05 — Inspect authored model pivots with native part sliders

The phase-2 model viewer now exposes its documented part rotation controls.
The Part controls action reveals a part picker and native Babylon XYZ
degree sliders in the scrolling tool pane. Authored definitions supply their
`presentation.parts`; standalone models use the conventional hull, turret,
barrel, rotor and legs node names. Models without those parts add no empty form.

Angles are local offsets from each actual node's authored rest quaternion, not
absolute replacements for its orientation. Values are bounded to −180…180°.
Pointer dragging and semantic range inputs share the same controller, including
explicit sequential keyboard focus in WebKit. Captions show actual degree values;
focus scrolling keeps a slider's caption visible.

Changing a part stops the preview clip. Fire retains the manual pose, samples
the actual posed muzzle and layers the existing recoil preview. Destroy retains
the existing parent-space aiming transfer to the paired wreck. Restore model,
playing a clip, health changes and entering socket editing return parts to rest.
Successful model replacement replaces the controls; a failed candidate keeps the
previous model and its pose. Owned animation observers are released on disposal.

These are inspection poses. They never rewrite GLB bytes, animation keys,
geometry, source packs, definitions or simulation state. Download GLB still
exports the opened model, including only separately applied socket edits.
The native part sliders extend the current graphite/brass/Arial panel without a
new visual identity or dependencies. Free part gizmos, material mappings and the
remaining documented editor tabs/validation work keep the whole editor task open.
