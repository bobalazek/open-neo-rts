# Repaint native tabs after the key event finishes

An ancestor's capturing `keydown` listener queued a microtask to copy semantic
results into Babylon. Home/End/Arrow keys changed the selected HTML tab, but the
native canvas could retain the previous table: the microtask was not guaranteed
to run after the target's keyboard handler. That handler also stopped bubbling.

Schedule the copy with `requestAnimationFrame` from capture instead. Keep the
disposed guard and the existing render-ready handshake. Verify painted content,
not just `aria-selected`: the browser regression clears recorded native glyphs,
presses Home from Economy and requires the Summary's Outcome column to render.

Observed and fixed in Chromium; independent narrow-layout checks also covered
End, both arrows and wraparound. The same native gallery/results journey passed
in WebKit. This is a presentation fix, with no simulation change.
