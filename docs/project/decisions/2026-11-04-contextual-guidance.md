# Contextual guidance and native HUD help

Phase-2 task 2-37b extends the existing native Babylon HUD and Field Manual.
The owner delegated provisional implementation choices; this adds no gameplay
rules, content prices or simulation outcomes.

## Delivered behavior

- Settings → Guidance stages All / Important / Off. Important is the provisional
  default: low power, own-Force damage and a visible enemy weapon bonus. All also
  notices a builder idle for ten simulation seconds. Apply persists; Back cancels.
  Show hints again stages clearing the history, also requiring Apply.
- A separate bounded, versioned browser-local profile preserves existing device,
  audio and keyboard settings. Each of the four hint identities is remembered
  when presented. Storage failure retains match-local history and explains that
  persistence is unavailable. Accounts and cross-device synchronization are later
  phases; simultaneous independent tabs do not have transactional show-once locking.
- One hint is visible at a time, with twenty simulation seconds between starts.
  Dismiss does not advance that interval. Pause does not advance the simulation
  timer. A menu or HUD-help session prevents new hints from being consumed.
- Detection consumes copied controlled-seat snapshots. Brownout must belong to
  the controlled Force. Idle builders use the existing HUD predicate. Health loss
  and permitted damage/death events require prior ownership; disappearance alone
  cannot imply attack. Fatal hits therefore work without querying hidden actors.
- The weapon hint uses currently projected, living hostile actors and an authored
  positive damage component with a multiplier above 100% against an owned actor's
  armour. It shares actual weapon target-domain eligibility, preserves explicit
  zero and ignores ghosts. It is qualified modifier advice, not a counter ranking
  or a prediction of final damage.
- HUD help is an opt-in original line-icon toggle. Native labels explain active
  regions; individual controls retain hover/focus tooltips and current shortcuts.
  Empty selection still has no selection station. Narrow help reserves space
  above selection rather than covering resource values.
- Hints and selection Details open the corresponding installed manual entry in
  the existing paused match menu. Selection changes refresh the link even while
  the worker is paused. Low-power guidance opens Economy and power. Closing the
  manual returns through the menu to the same worker and match. Contextual entry
  opens focus and reveal its heading, including the unfiltered narrow gallery;
  semantic fallback retains ordinary scrolling.
- The searchable manual adds Economy and power, Fog and scouting, Combat and
  armour, and Current controls. Control captions come from the existing active
  binding profile. The roster's statistics and weapon tables remain compiled data.

## Scope and checks

Client/render/locales only; SIM59 and gameplay/content hashes are unchanged.
Focused regressions cover profile bounds/failure, levels/dwell/spacing, projected
ownership, fatal hits, target domains and explicit zero. Browser checks exercise
native settings, hints, manual links, paused selection and concept/control search,
alongside existing manual/native-panel/battlefield cases. Desktop 1440×900 and
narrow 390×844 captures are reviewed separately from behavior tests.

This does not deliver Basic Training, a training bot's explanatory chat,
post-defeat lesson recommendations, playtest links or future multiplayer concepts.
Those belong with their actual systems. Firefox, human-match duration and the
twenty-match qualification must retain their own evidence; no guidance check
satisfies those gates. Hosted CI capacity remains an owner task.
