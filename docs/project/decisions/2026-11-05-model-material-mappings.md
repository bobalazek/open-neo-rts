# Model material-slot assignments

Phase-2 task 2-38d3 connects the existing `presentation.materials` contract to
actual model imports and the native definition editor. Previously validation
accepted name-to-role mappings, but the renderer used only literal GLB material
names. A mapped material could pass content checks without following its team role.

## Authoring and defaults

Visuals reads material names from the selected GLB and supplies the schema's
eight role choices in existing native fields. Model default removes an override;
opening a definition does not add identity entries or make it dirty. Existing
map keys missing from the current model stay visible for correction/removal.
The shared resolver's copied model bytes refresh names even when validation
fails, allowing an author to fix mappings after switching model references.
Discard and Reload also validate/refresh restored model names. Labels use actual
names as text, and explanations remain hover/focus help.

The accepted provisional implementation autonomy covers a cosmetic contract
clarification: mappings are partial overrides. Unmapped conventional names retain
their slot in both validation and rendering; custom names still need an explicit
valid assignment. This aligns Model default with the loader rather than requiring
redundant identity entries. Vocabulary checks use own properties, so prototype
names are not accepted as slots. Existing authored definitions remain unchanged.

Validate and preview applies the draft. The existing Team colour control remains
available while editing so the author can compare Force tints. Once a definition
is open, Save/download, Validate and preview and both draft-playtest actions stay
in the pinned footer; Open pack folder remains in the scrolling actions. Before
a pack is open, its picker remains pinned. All outputs retain common validation
and the existing data format.
An owned model still needs a team role on actual geometry; mapping every team
surface to neutral roles is refused without writing or losing the draft.

## Shared imports

The loader validates roles against `MATERIALS` and resolves each original name
once, before team recolouring. Mappings never chain through another key. Neutral
roles retain authored colours; `team`, `team_dark`, `team_light` and
`team_emissive` use existing Force tint rules. PBR textures, metallic/roughness,
transparency and other surface properties stay authored in the GLB; this adds
role aliases, not shader presets.

Each container owns its renamed materials. Entity instances continue to share
geometry/materials within their per-definition/per-Force template; later
recolouring one Force cannot recolour another. The map reaches normal matches,
debug/draft sessions, replay imports, model/wreck previews, Field Manual and
Home's Dragon Tank. Standalone GLBs with no definition keep conventional names.
Static neutral map art has no Force tint.

Original GLB bytes, definitions, assets and simulation outcomes are untouched by
inspection. Only an explicit definition save writes mappings. No new library,
content format, simulation version or outcome-golden change is introduced.

## Evidence scope

The original focused regression fails with unmapped `team` where `metal` was
requested. Real GLB tests cover neutral/team-emissive aliases, invalid-role
rejection and independent assets. Dragon Tank instances cover two Forces and
later recolouring. Catalog checks cover copied metadata and live/wreck variants.
An independent real-GLB experiment also covers arbitrary authored names and all
eight roles while retaining physical/texture properties.

The browser journey checks native fields, invalid all-neutral refusal, preview
and team controls, persisted overrides, default removal and restored model
names. Free part gizmos and remaining documented editor tabs/validation stay
open; this task does not complete the editor or phase.

After rebasing onto the merged announcer and decoder, repository typecheck,
all eleven test groups, build and full content validation pass (911 asset files,
137 models, no errors or warnings). The combined native-decoder and material
journeys pass 4/4 in current Chrome and WebKit. Independent technical review
closed the partial-map, recovery and keyboard findings. Final visual review
scored its one material-identity/help finding resolved across four recaptures;
this is a scoped fix-list verdict, not whole-editor or phase acceptance.
