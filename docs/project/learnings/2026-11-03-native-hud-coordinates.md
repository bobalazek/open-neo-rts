# Native HUD measurements use texture pixels

Low graphics rendered the battlefield GUI at a different resolution from its
CSS canvas. Comparing `Control._currentMeasure` directly with `clientX/clientY`
created invisible blocked areas over the terrain and displaced hover tooltips.
Convert measured rectangles with `canvas.clientWidth / gui.getSize().width`
and the equivalent height ratio. Keep layout rectangles in CSS coordinates.
The regression arms Move and clicks the formerly blocked clear terrain at
Low/150%, then checks compact keyboard recipe focus.

Browser paint helpers need the same texture-to-CSS conversion. When finding a
recipe's original icon, prefer its image before nested SVGs: the recipe metadata
also contains resource pictograms, so choosing the first SVG silently targets
the resource bar instead of the recipe. Runtime probes confirmed the actual
hover behavior before the helper was corrected.

A custom circular control must call `super.contains()` after its circle check:
the base method registers Babylon's pointer blocker. Move semantic focus after
native pointer-up, and release the custom control's held gesture on canvas blur.
Focusing the semantic map during pointer-down left the native control pressed;
the next pan or order was silently ignored. The real minimap regression covers
pan, Home, builder selection, movement and attack-move in one session.

One final WebKit batch missed a map pan after recipe hover and group assignment.
The original test passed on recheck, and three bounded independent repetitions
delivered the first click with correct coordinates and clean capture state.
The cause remains unconfirmed; retain this observation for browser qualification
rather than adding a speculative input workaround.
