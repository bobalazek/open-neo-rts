# README screenshot sources

`home.png`, `skirmish.png` and `model-preview.png` were captured on 2026-11-04
from the actual browser renderer at 1440×900 using headless Chromium/Playwright.
The served code was frozen PR #271 candidate
`2b8a54f13616ee27521a429c17946bd47584c451`; its application code matches main
`6af9ba6c9a9e4c8edee9330eff0236d4e3a867ec` (subsequent changes were documentation).

- `home.png`: native Home, original wordmark and Dragon Tank display.
- `skirmish.png`: ordinary Quick start local match on Training Grounds, with its
  standard starting kit. The real idle-builder control selects a Field Technician;
  the HUD pauses the match at its beginning for capture. This is a starting-base
  view, not a completed battle or performance measurement.
- `model-preview.png`: `/tools/content`, installed original Dragon Tank, default
  team/rest pose and actual model checks.

All pictured models, icons, terrain and UI come from the repository. These are
rendered development screenshots, not promotional mockups. Binary images use
Git LFS. `terrain.png` is an older inspector capture retained in the repository;
it is not part of the refreshed README's screenshot set.
