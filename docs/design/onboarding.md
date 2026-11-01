# Tutorial and onboarding

New players should go from "never played an RTS" to "won a skirmish against an easy bot" without reading anything outside the game.

## First launch

After choosing a name, language and graphics ([home.md](screens/home.md#first-launch)), the game asks one question:

```text
┌──────────────────────────────────────────────┐
│  How much RTS have you played?               │
│                                              │
│  [ New to RTS ]   → Basic Training mission 1 │
│  [ Some ]         → Basic Training menu      │
│  [ Veteran ]      → Home                     │
└──────────────────────────────────────────────┘
```

The answer sets defaults: hint level, bot difficulty and tooltip detail. Everything can be changed later.

## Basic Training

A short tutorial campaign. Each mission teaches one thing in 5–10 minutes and ends with a small test.

| #   | Mission            | Teaches                                                     |
| --- | ------------------ | ----------------------------------------------------------- |
| 1   | First steps        | Camera, selecting, moving, box select                       |
| 2   | Contact            | Attacking, attack-move, health, counters (rifles vs. tanks) |
| 3   | Groundwork         | Workers, resources, placing buildings, power                |
| 4   | Production line    | Queues, rally points, control groups                        |
| 5   | Know your enemy    | Fog of war, scouting, high ground, detection                |
| 6   | Special operations | Tech tree, upgrades, abilities                              |
| 7   | First battle       | Full skirmish against a training bot, with hints on         |

There are also optional lessons:
- **Command together:** Shared Command with a bot or friend, covering grants, pings and presence.
- **Map editor basics:** build a small map and playtest it.
- **Map editor basics.**

Tutorial missions are ordinary missions ([authoring-scenarios.md](../contributing/authoring-scenarios.md)), using triggers for step-by-step instructions, highlights and waiting for player actions. This means the objective and trigger system ships **before** the campaign: Basic Training is its first user. Contextual hints and the Field Manual don't need it and can ship with the first skirmish release.

## Learning aids in every match

- **Contextual hints:** the first time something happens (low power, idle workers, under attack, a counter unit appears), a short hint explains it. Each shows once per profile. The hint level (all / important / off) is in settings.
- **HUD help (F1):** labels every HUD element with what it does.
- **Tooltips** on everything, including "strong against" and "weak against" icons.
- **Training bot difficulty:** attacks late, explains what it's doing in chat, and never rushes.
- **Game speed:** single player can run slower.
- **Recommended next step:** after a lost skirmish, the post-match screen suggests a relevant lesson or Field Manual page.

## Field Manual

**Route:** `/manual`; also opened from tooltips ("More…") and Home.

```text
┌────────────────────────────────────────────────────────────────────┐
│ ◂ Back                  FIELD MANUAL          [ Search… ]          │
│ ┌ BROWSE ─────────┐ ┌──────────────────────────────────────────┐   │
│ │ ▾ Units          │ │ (3D turntable of the unit)                │   │
│ │    AFN           │ │ PANTHER · AFN · Heavy tank               │   │
│ │     Panther  ◀   │ │ Cost 900 · Build 20 s · Health 1200      │   │
│ │     Raptor       │ │ Armor heavy · Speed ●●○○                 │   │
│ │ ▸ Structures     │ │ Cannon: armor-piercing, range 9          │   │
│ │ ▸ Weapons        │ │ Strong vs: [tank][light]                 │   │
│ │ ▸ Concepts       │ │ Weak vs:   [rocket inf][air]             │   │
│ │ ▸ Hotkeys        │ │ Requires: War factory, Composite armor   │   │
│ └──────────────────┘ │ [ Try in playtest ▸ ]                     │   │
│                      └──────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────────┘
```

- Generated from content data, so it's always correct and covers modded packs automatically.
- **Concepts** pages explain fog, armor and damage types, territory, Shared Command and so on, in short text with images.
- **Try in playtest** opens a map editor playtest with that unit spawned against its counters.

## Multiplayer newcomers

- Co-op against AI is the recommended first multiplayer mode.
- An optional "new player" tag shows in the lobby.
- Shared Command lets a newcomer join a friend's Force with limited grants (e.g. army only) and learn alongside them.

## Later

Challenges (micro drills, build-order time trials, defend-the-base scenarios) with medals, and a hotkey trainer.
