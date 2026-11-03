# Battlefield regions follow the owner's Age of Empires IV reference

The owner asked for a region-by-region comparison and similar placement, clearer
selection ownership, an efficient icon-led header and no empty selection panel.
This refines the [first native station](./2026-11-03-native-battlefield-station.md).

Reference evidence is the principal UX designer's [HUD rationale and screenshots](https://kevinhustler.me/aoe4)
and the official [unit HUD detail examples](https://www.ageofempires.com/news/ageiv_seasonfour_update_60878/).
The designer explicitly places vertically stacked resources beside purchase
controls to reduce cost-comparison eye movement. All artwork here stays original.

| Region              | Reference role                 | Current application                                                    |
| ------------------- | ------------------------------ | ---------------------------------------------------------------------- |
| Top left            | Objectives                     | Actual Last Man Standing goal; map and rules on hover                  |
| Top centre          | Global progression/status      | Current match clock and speed; no invented era                         |
| Top right           | Occasional global controls     | Compact existing pause, menu, leave and surrender icons                |
| Left edge           | Control groups                 | Populated recall groups; reveal all slots when requested               |
| Centre              | Battlefield                    | Clear interaction space, without a full-width header blocker           |
| Right edge          | Event feedback                 | Existing permitted notices above the map                               |
| Bottom left         | Economy and worker shortcuts   | Stacked real counters and idle helpers                                 |
| Bottom centre       | Selection identity and stats   | Owner/color, model thumbnails and counts; full actor details on demand |
| Bottom centre-right | Context commands and purchases | Stable hotkey grid, contextual recipes and actual queue progress       |
| Bottom right        | Minimap and map tools          | Full rotated map inside its circular frame and existing controls       |

No selection means no selection frame, commands, recipes or invisible dock hit
area. Economy, idle helpers, map and global controls remain usable. Mixed
selection types use model buttons rather than a long concatenated name; their
existing callbacks select that type. Narrow screens retain contextual mode
switching and scroll long type lists. Descriptions remain on hover/focus.

This is presentation work. It does not add speculative eras, player scores,
chat, economy values or campaign systems. The simulation and content roster stay
unchanged. Working animations and world hover/harvest-target outlines requested
by the owner follow as the next connected interaction-feedback task.
