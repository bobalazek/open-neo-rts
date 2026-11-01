# Lobby

**Route:** `/lobby/:code` · **From:** Room browser, invite link, rematch · **To:** Loading → Match

The rules behind the lobby (presets, seats, grants, post-defeat policy) are in [multiplayer.md](../multiplayer.md#2-lobby-models-and-presets).

```text
┌────────────────────────────────────────────────────────────────────────────┐
│ ◂ Leave      CHILL 2v2 CO-OP · code ABC123 [copy link]      Host: Mara ★   │
│ ┌──────────────────────────────────────────────────┐ ┌───────────────────┐ │
│ │ TEAM A                                           │ │ (map preview with │ │
│ │ Force 1  AFN ▾  ■ red   Spawn N                  │ │  spawns)          │ │
│ │   ├ Mara ★   🎤  ✔ ready   grants: full          │ │ Iron Valley       │ │
│ │   └ Bob      🔇  … not ready grants: army ▾      │ │ [Change map]      │ │
│ │ Force 2  EC ▾   ■ blue  Spawn W                  │ ├───────────────────┤ │
│ │   └ Bot (Hard) ⚙                                 │ │ Preset: Hybrid ▾  │ │
│ │ TEAM B                                           │ │ Victory: Conquest │ │
│ │ Force 3  PI ▾   ■ green Spawn S                  │ │ Fog: Standard     │ │
│ │   └ [ open seat ]  [ + bot ]                     │ │ Diplomacy: Locked │ │
│ │ Spectators: Ozzy (team A vision)                 │ │ Post-defeat:      │ │
│ ├──────────────────────────────────────────────────┤ │  Request assist   │ │
│ │ CHAT  [All ▾]                                    │ │ Content ✔ match   │ │
│ │ Mara: gg last time, same setup?                  │ │                   │ │
│ │ Bob: sure, I'll take army                        │ │ [ Ready ✔ ]       │ │
│ │ [ type a message… ]                    [Send]    │ │ [ Start ▸ ] host  │ │
│ └──────────────────────────────────────────────────┘ └───────────────────┘ │
└────────────────────────────────────────────────────────────────────────────┘
```

- **Forces and seats:** each Force lists its seats. Several humans (or humans and a bot) can sit in one Force; each seat shows its grants (full, army, economy…). Players drag themselves onto open seats, or the host assigns them.
- **Per-seat indicators:** host star, voice state (🎤 speaking, 🔇 muted), ready check, ping.
- **Settings panel:** preset, map, profile and the common rules, plus an **Advanced rules** button that opens every configurable setting (caps per faction or Force, per-type limits, bans, economy multipliers, speed, combat toggles, handicaps), generated from the setting definitions in [match-rules.md](../match-rules.md). Custom presets can be saved and shared. Only the host can edit them; changes are highlighted for everyone, and any change resets everyone's ready state.
- **Content check:** a green check when everyone's content, map and version hashes match. Otherwise it names the player and what's missing, with a download prompt for custom maps and packs.
- **Chat:** lobby chat with All or Team scope. Voice chat is opt-in (a mic button per player); once on, it uses team scope; mute per player by clicking their mic icon.
- **Host tools** (right-click a player): kick, move to seat, change grants, make host.
- **Start:** host only, enabled once everyone is ready and the checks pass. A 5-second countdown follows, which anyone can cancel by un-readying.
- **States:** connection lost shows a reconnecting banner. If the host leaves, host passes to the next player automatically.
