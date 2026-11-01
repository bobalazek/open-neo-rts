# Training Grounds

_Addition_: original terrain for the existing map. The spawns, teams, start mode and resources retain their authored values; only the description and terrain layers change.

Each corner has a level-1 base with a clear 13×13 area centred on its spawn and two nine-cell ramp exits. The rich middle ore field is on a level-1 terrace with a nine-cell ramp on each side. Level-0 routes remain open around the terrace and along the sides. There is no water or placed scenery.

The layout mirrors about cell `(64, 64)`, matching the existing spawn and resource coordinates (`20 ↔ 108`, `30 ↔ 98`). All four starts have the same shortest distance to the middle field and the same set of distances to the resources. This is checked against the height/ramp graph; it is not a match balance claim.

The [Beyond All Reason map checklist](https://www.beyondallreason.info/guide/map-checklist) calls for pathability checks and readable traversable routes. Those practices inform the broad ramps and open routes here. The terrain is original; no source map, artwork or geometry was copied.

The editable terrain source is `trainingGroundsTerrain` in [generate-sandbox-maps.ts](../../../../apps/cli/src/commands/generate-sandbox-maps.ts). Metadata stays in [map.json](map.json). Rebuild only this map with:

```sh
bun neo generate-sandbox-maps training-grounds
```

Omitting the ID generates only sandbox maps. The original schematic [preview](preview.png) uses lighter grass for raised ground, orange for ramps, gold for ore, blue-grey for materials and white for spawns. It is not an in-game screenshot. Its provisional surface colours reuse the pack palette.
