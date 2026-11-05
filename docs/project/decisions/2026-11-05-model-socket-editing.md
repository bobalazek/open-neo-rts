# Model socket editing

Phase: 2-38d1. The model editor adds socket gizmos and safe local GLB export.

The existing model-first Graphite Command Stations pane owns socket selection,
Move/Rotate modes and keyboard-accessible local metre/degree fields. Babylon's
native gizmos manipulate the actual attachment nodes; the selected socket has a
native label. New socket names use the existing `socket_<name>[_<n>]` rule and
attach to an authored parent or the active model scene. Geometry remains the
original subject. No new visual identity, downloaded art or dependency is needed.

Entering the editor stops clips and restores the model's full-health LOD0 rest
pose. Only unanimated leaf sockets can change; mesh nodes, skin joints, animated
attachments and socket branches with existing children are excluded. Parent
selection applies to new sockets; existing sockets are not renamed or reparented.
These limits keep existing animation and geometry relationships intact. Ordinary
part/animation preview remains available after applying or canceling the edit.

Apply to preview validates with the shared project/conformance checks before
reimporting the candidate. Failure preserves the draft and last working model.
Cancel restores the original local transforms and removes newly created nodes.
Download GLB exports a copy of the current preview. Replacing or leaving an
edited preview asks before discarding it; browser unload retains the ordinary
unsaved-work warning. No pack or editable Blender source is overwritten, and
the file's existing authorship metadata is retained without invented credit.

The exporter rewrites only socket JSON and parent/scene child lists, appending
new node indices. It retains every following GLB chunk byte for byte, so accessors,
meshes, animation channels/buffers, materials, images and extension data keep their
original references. JSON receives four-byte space padding and container lengths
are updated according to the
[Khronos glTF 2.0 specification](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html).
Matrix-based edited sockets become equivalent translation/rotation/scale values;
the actual node scale is preserved. Exports enforce finite bounded transforms,
unit quaternions, stable indices, unique names and the existing 16 MiB model limit.

Material mapping, part inspection controls and the remaining editor tabs stay in
2-38d; source/schema/formatter and audio parity stay in 2-38b2. This does not close
the entire editor task or phase 2.
