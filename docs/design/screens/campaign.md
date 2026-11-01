# Campaign, briefing and debriefing

How campaigns and missions are built is in [authoring-scenarios.md](../../contributing/authoring-scenarios.md).

## Campaign select

**Route:** `/campaign` · **From:** Single player · **To:** mission map

```text
┌────────────────────────────────────────────────────────────────────┐
│ ◂ Back                    CAMPAIGNS                                │
│                                                                    │
│  ┌────────────────┐   ┌────────────────┐   ┌────────────────┐      │
│  │ [faction art]  │   │ [faction art]  │   │ [faction art]  │      │
│  │ Ghost Protocol │   │ Iron Dynasty   │   │ Phoenix Rising │      │
│  │ Alliance of    │   │ Eastern        │   │ Phoenix        │      │
│  │ Free Nations   │   │ Collective     │   │ Initiative     │      │
│  │ 4/12 ★★☆       │   │ locked 🔒      │   │ 0/12           │      │
│  └────────────────┘   └────────────────┘   └────────────────┘      │
│                                                                    │
│ Tutorial: Basic Training  ▸                 Difficulty [Normal ▾]  │
└────────────────────────────────────────────────────────────────────┘
```

Each card is one faction's campaign ([story.md](../story.md#campaigns)), with its progress and medals. Locked campaigns say what unlocks them. The tutorial campaign is always available.

## Mission map

**Route:** `/campaign/:id`

```text
┌────────────────────────────────────────────────────────────────────┐
│ ◂ Campaigns     GHOST PROTOCOL · Alliance of Free Nations          │
│ ┌──────────────────────────────────────┐ ┌───────────────────────┐ │
│ │   (stylized brick-built world map)   │ │ Mission 4: Cold Front │ │
│ │                                      │ │ ★★☆  best 18:42       │ │
│ │   ●1 ── ●2 ── ●3 ──◉4 ── ○5          │ │                       │ │
│ │                 └── ○3b (optional)   │ │ Secure the dam before │ │
│ │                                      │ │ Eastern Collective    │ │
│ │                                      │ │ reinforcements…       │ │
│ └──────────────────────────────────────┘ │ [  Briefing ▸  ]      │ │
│                                          └───────────────────────┘ │
└────────────────────────────────────────────────────────────────────┘
```

- Missions are nodes: ● completed, ◉ available, ○ locked. Branches and optional missions show as side paths.
- The side panel shows the selected mission's summary, medals (one per difficulty or secondary-objective set) and best time.
- Completed missions can be replayed at any difficulty.

## Mission briefing

**Route:** `/campaign/:id/:mission`

```text
┌────────────────────────────────────────────────────────────────────┐
│ ◂ Mission map            MISSION 4: COLD FRONT                     │
│ ┌──────────────────────────┐  ┌──────────────────────────────────┐ │
│ │ (animated briefing map:  │  │ [portrait] General Sarah Chen:   │ │
│ │  camera pans, markers    │  │ "The dam is the only crossing…"  │ │
│ │  appear as voice plays)  │  │                                  │ │
│ └──────────────────────────┘  │ PRIMARY                          │ │
│                               │ ◻ Capture the dam control room   │ │
│                               │ ◻ Keep the convoy alive          │ │
│                               │ SECONDARY                        │ │
│                               │ ◻ Destroy the radar in 10 min    │ │
│                               └──────────────────────────────────┘ │
│  Difficulty [Normal ▾]    Available units: [icons]   [ Start ▸ ]   │
└────────────────────────────────────────────────────────────────────┘
```

Voice-over has subtitles and can be skipped. Objectives come from the mission's data; hidden objectives don't appear here.

## Debriefing

Shown after a mission instead of the standard post-match screen. It shows the result, which objectives were completed, medals earned, unlocks (next missions, units for later missions), and stats. Buttons: Continue (to the mission map), Retry, Watch replay.
