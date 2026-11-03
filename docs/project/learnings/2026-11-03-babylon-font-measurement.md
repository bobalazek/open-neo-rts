# 2026-11-03 — Measure native GUI text with an explicit font

Babylon GUI 9.33.1 can render a TextBlock with inherited Arial while its
`fontFamily` getter returns an empty string. Setting a canvas font from that
getter produces an invalid value such as `15px `; the canvas silently retains its
previous font. The first paragraph measurement used the default 10px sans-serif
while Babylon drew 15px Arial, undercounting wrapped lines and clipping the end
of Current controls on narrow screens.

Set the panel label's font family explicitly before measuring. Use the same font,
size and width for layout and rendering, and size the scroll body from the wrapped
text. Independent 390×844 and 568×320 captures then showed the full ending
control-group instructions; the short landscape view could scroll to them.
