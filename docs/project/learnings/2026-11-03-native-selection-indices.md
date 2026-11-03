# Native and semantic selection use different offsets

HTML input selection offsets count UTF-16 units. Babylon 9.33.1's TextWrapper
counts Unicode code points; convert each copied endpoint before drawing its
caret or highlight. A supplementary character such as an emoji occupies two
DOM units and one native character. Preserve selection direction for horizontal
scrolling at the active edge.

Babylon exposes no range setter at this version. The shared NativeTextInput
adapter isolates its cursor/highlight fields, copying display state without
registering a second keyboard or clipboard editor. Native pointer focus resumes
Babylon's existing editor. Clear mirrored focus and blink timers on focus transfer
and disposal. Recheck the adapter when updating Babylon.

On macOS WebKit, Home does not reliably move an HTML input's caret to its start.
Browser regressions position the caret explicitly before exercising actual arrow
and Shift-arrow selection. Real copy/cut/paste, long text, Unicode replacement,
focus transfer and saved-game filtering were checked separately.
