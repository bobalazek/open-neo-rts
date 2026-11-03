# Post-match

**From:** match end (victory or defeat, all objectives done, surrender, leave) · **To:** origin (lobby, skirmish setup, campaign debriefing, home)

Campaign missions show the [debriefing](campaign.md#debriefing) instead.

```text
┌────────────────────────────────────────────────────────────────────────────┐
│                         ★  VICTORY  ★                                      │
│             Team A won · Last Man Standing · 34:12                         │
│                                                                            │
│ [ Summary ] [ Economy ] [ Military ] [ Structures ] [ Territory ] [ APM ]  │
│ ┌────────────────────────────────────────────────────────────────────────┐ │
│ │ Force           Score  Units built/lost  Destroyed  Gathered  Spent    │ │
│ │ 1 Mara+Bob      18 420      142 / 61        97       38 200   36 900   │ │
│ │   Alliance of Free Nations                                             │ │
│ │ 2 Bot           12 100      120 / 88        40       30 100   29 400   │ │
│ │   Eastern Collective                                                   │ │
│ │ 3 Ozzy           6 870       90 / 90        51       21 000   20 800   │ │
│ │   Phoenix Initiative                                                   │ │
│ │                                                                        │ │
│ │ (Economy and Territory tabs: line charts over match time)              │ │
│ └────────────────────────────────────────────────────────────────────────┘ │
│  [ Watch replay ]  [ Save replay ]   [ Rematch ]   [ Back to lobby ▸ ]     │
└────────────────────────────────────────────────────────────────────────────┘
```

- The banner states the result and why: which victory condition was met, or how the Force was eliminated.
- **Tabs:** summary table; economy (income and stock over time); military (army value over time, units built and lost by type); structures; territory share over time (when the ruleset has territory); APM per player.
- Under Shared Command, stats are per Force, with a per-controller breakdown on hover (orders issued, APM).
- **Rematch** (multiplayer) returns everyone to the same lobby with the same settings.
- Behind this screen, the match scene keeps rendering slowly orbiting over the final battlefield.

The [first-playable detailed statistics](../../project/decisions/2026-11-03-detailed-match-statistics.md)
provide Summary, Economy, Military, Structures and Orders/APM views. Order APM is
accepted gameplay orders per active Force minute, excluding selection/camera and
refusals; controller rows identify bots. Histories retain initialization/end and
coarsen in long matches, with the actual samples available as tables. Score and
territory views await their rules; replay playback/recorded-camera following remain
separate work.
