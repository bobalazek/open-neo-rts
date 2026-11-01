# Load game

**Route:** `/load` · **From:** Single player, in-game menu · **To:** Loading → Match

```text
┌────────────────────────────────────────────────────────────────────┐
│ ◂ Back                      LOAD GAME                               │
│ [ All ▾ ]  [ Search… ]                                              │
│ ┌──────────────────────────────────────────────┐ ┌────────────────┐│
│ │ [thumb] Autosave · Mission 4: Cold Front      │ │ (large thumb)  ││
│ │         Normal · 23:10 played · 2 min ago     │ │ Cold Front     ││
│ │ [thumb] Quicksave · Skirmish Iron Valley      │ │ Tick 27 840    ││
│ │         2v2 · 41:02 played · yesterday       │ │ Forces: …      ││
│ │ [thumb] "before the push" · Playtest          │ │ Version: sim 1 ││
│ │         …                                     │ │ [ Load ]       ││
│ └──────────────────────────────────────────────┘ │ [ Export ]     ││
│                                                  │ [ Delete ]     ││
│ [ Import save… ]                                 └────────────────┘│
└────────────────────────────────────────────────────────────────────┘
```

- Filter by skirmish, campaign or playtest; sort by date.
- Saves from an incompatible sim version show why they can't load, and whether a migration exists. See [saves-and-replays.md](../../engineering/saves-and-replays.md).
- Delete asks for confirmation. Export downloads a file; import accepts one.
- **Empty state:** "No saves yet", with a button to start a skirmish.
