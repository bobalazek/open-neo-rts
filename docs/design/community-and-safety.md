# Community, safety and fair play

## Chat and voice safety

- **Filter:** a profanity filter on by default (setting), applied client-side to what _you_ see.
- **Mute** any player's chat or voice, per match or permanently. **Block** hides their messages, rooms and invites.
- **All-chat** can be disabled per player and per room. Voice is opt-in and team-only ([multiplayer.md §9](multiplayer.md#9-co-op-presence-and-communication)).
- **Names** are checked against a blocklist at creation and in lobbies.

## Reporting and moderation

- **Report** a player from the lobby, the team panel, post-match or recent players: cheating, abusive chat, griefing a shared Force, or an offensive name. The report attaches the replay and chat log.
- **Moderation** (with accounts): warnings, chat bans, matchmaking bans. Reviewed by people; nothing automated beyond the filter.
- **Private rooms** are the host's responsibility: kick and ban from the room.

## Fair play

Server authority prevents most classic cheats by design:

| Cheat                    | Why it doesn't work                                                         |
| ------------------------ | --------------------------------------------------------------------------- |
| Map hack                 | Clients never receive hidden state ([fog-of-war.md](fog-of-war.md))         |
| Resource or damage edits | The server computes everything; client numbers are ignored                  |
| Speed hacks              | The server owns the tick                                                    |
| Invalid commands         | Every command is validated: grants, ownership, visibility, costs, cooldowns |

What remains:

- **Automation and scripting** (inhumanly fast, perfectly timed input): commands are rate-limited per seat, and replays make suspicious play reviewable.
- **Shared Command griefing** (a co-controller sabotaging their own Force): grants can be revoked by the Force's other controllers, and actions are attributed per seat in the replay.
- **Ghosting** (spectators passing information): live spectating has a delay, and omniscient spectators can never rejoin as players.

## Privacy

- Collect the minimum. Guests send nothing beyond what multiplayer needs.
- Telemetry and crash reports are opt-in ([deployment-and-operations.md](../engineering/deployment-and-operations.md#telemetry-and-crash-reports)).
- Voice is relayed, so IP addresses aren't shared between players.
- A plain-language privacy page in the game and on the website.
