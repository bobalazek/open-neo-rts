# Native save galleries and match results

The owner prefers Babylon GUI for game presentation. Extend the existing shared
native panel to the standalone Load game screen, the in-match Load pane and
post-match statistics. No gameplay definitions or simulation outcomes change.

Save rows use their real match thumbnails, names and dates. The selected slot
shows its original preview and metadata beside the list on desktop; narrow
viewports stack and scroll. Search retains its native editor while results
change. Existing storage handlers continue to own import verification,
compatibility, changed-slot checks, export, deletion and restoration.

Results keep the existing Summary, Economy, Military, Structures and Orders / APM
controllers. Babylon presents their actual final values, original history plots,
metric choices and sampled-value tables. Tables retain every row, with native
scrollbars and keyboard scrolling from the semantic region. Replay download,
Rematch and Home retain their existing handlers.

HTML supplies keyboard and assistive semantics, modal ownership and the graphics
fallback. It does not supply the visible widgets once the native panel is ready.
Selected-preview dimensions come from authored attributes because clipped
semantic layout can report a one-pixel image. Rich interactive controls show a
separate ivory focus outline in addition to their warm selected state.

Loading feedback, the battlefield HUD and debug tools still use HTML/CSS. Native caret/selection
mirroring for semantic text entry remains deferred; pointer text editing already
uses Babylon's editor. This conversion does not qualify screen readers, touch
devices or hardware performance.
