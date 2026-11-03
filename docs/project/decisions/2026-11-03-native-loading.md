# Native local-match loading and failure feedback

Continue the owner's native Babylon UI priority by reusing the existing shared
panel. A separately owned modal canvas displays actual content, map, renderer,
worker and starting-model stages while the candidate world initializes. Its bar
reads the existing semantic progress value/max; it is not a timed estimate.

Cancel, dialog close and Escape share the same return destination. Timeout and
failure dispose the candidate; a fresh failure uses the shared native panel
with the actual error, Retry and Back. Graphics failure leaves semantic HTML
status and controls usable. No new artwork, dependency or simulation rule.

The app owns the loading dialog independently of the candidate root, so HUD
initialization cannot remove it early. Navigation and cancellation invalidate
late callbacks. After modal closure, focus restoration waits a frame for browser
inertness to clear. Failure restores its heading, success the match canvas, and
cancel the destination heading. Failed/canceled in-match save loads retain the
original paused canvas/tick; the Load controller restores the initiating action
after re-enabling controls.

Desktop/narrow captures and Chromium/WebKit journeys exercise real startup,
stage display, native Cancel, injected worker failure, Retry and immediate idle
selection via the keyboard. Existing save journeys exercise import/export,
failed writes, canceled replacement and successful resume. Independent review
also exercises timeout, HTTP worker failure and native/all-graphics fallback.
Physical touch and hardware FPS remain unqualified. These changes complete the
loading UI conversion; debug UI and the broader roadmap remain unfinished.
