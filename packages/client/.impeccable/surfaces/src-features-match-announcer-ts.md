# Core match announcer

Scope: `src/features/match/announcer.ts`, its original speech library and the
existing HUD, native HUD, minimap feed, alerts and session bindings. Ordinary
Operate extension for players reading and hearing permitted local-match events.

Preserve Graphite Command Stations, compact Arial, graphite and brass. Short
captions use the existing battlefield feedback TextBlock; the semantic paragraph
is a polite, atomic live status. Location-bearing messages use the existing
minimap feed button and jump target with the spoken label, replacing an
equivalent generic notice. An active caption suppresses duplicate minimap status
in native feedback. No new panel, colors, controls or visual identity apply.

Original synthetic English speech uses the app-owned mixer, Announcer/Master
levels and existing music ducking. Muted or unavailable audio retains timed
captions. Priority, cooldowns and a bounded queue limit repetition. Pause, hiding,
leaving or rewinding clears pending speech and captions. Copied permitted HUD
observations and canonical outcomes supply messages; this is presentation work.

Inherits `PRODUCT.md` and `DESIGN.md`. Delivered scope and provisional defaults
follow `../../docs/project/decisions/2026-11-05-first-playable-announcer.md`.
Four actual inspected captures in `.impeccable/review/`, named
`announcer-{desktop,mobile}-{chromium,webkit}.png`, received the finish review's
`SHIP` disposition at 1440×900 and 390×844. Caption/feed labels are readable and
unclipped; the existing onboarding hint is unrelated. Current Chrome/WebKit
journeys check native clip offset/duration, pause clearing, muted captions with
one feed entry and actual-worker surrender/Defeat. Power and damage observations
come from a presentation-only copied-snapshot fixture. Other-roster and
later-system announcements, full-mix qualification, replay audio, hardware
hearing and screen-reader qualification remain open. This does not complete
first-playable audio or task 2-36.
