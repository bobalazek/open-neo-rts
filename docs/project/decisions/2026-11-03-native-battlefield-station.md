# Native battlefield command station

The owner requested an Age of Empires IV style HUD: a circular minimap on the
right, selected-actor information and commands together, less persistent text,
hover explanations and clear control groups. This replaces the earlier
left-minimap layout. Keep original models, icons, names and gameplay controllers.

The [official Age of Empires IV HUD examples](https://www.ageofempires.com/news/ageiv_seasonfour_update_60878/)
show compact unit stats with expandable details and minimap controls. Its
[official shortcut reference](https://www.ageofempires.com/news/aoeiv-shortcuts-revealed/)
documents control groups and camera shortcuts. These inform interface conventions;
all shipped imagery remains original project content.

Babylon GUI renders the resource strip, selected portrait/health, contextual
command and recipe icons, queue progress, populated group slots, idle indicators,
notices and minimap on the existing world scene. Details retains complete actor
state and secondary actions. Narrow layouts switch between Commands and
Build / train with B; I opens Details. Existing order hotkeys stay authoritative.
The menu keeps Resume in its fixed header.

The whole square minimap fits inside the circular frame after rotation. The
inverse transform drives existing pan, order and explored-cell ping handlers.
Transparent circular-map corners pass through to the battlefield. Hit guards
and tooltip anchors convert Babylon's render-pixel measurements to CSS pixels,
including Low graphics. The world uses its full viewport beneath the station.

Clipped HTML retains semantic controls and the existing validators/controllers.
Every source panel remains available in compact mode; focusing a recipe or
secondary action reveals its native view. Unavailable recipes explain their
reason on hover, keyboard focus and click. Selection drag feedback is native.

Moving waypoint endpoints update an existing line mesh. Topology changes retain
its compiled material, and segments sample static terrain height. The overlay
still consumes only selected actors' permitted order copies. No simulation or
content outcome changes.

Loading feedback and debug tools remain HTML/CSS. Text caret mirroring, physical
touch/screen-reader qualification and hardware performance remain separate work.
