# Multiplayer, shared command, diplomacy and elimination

**Status:** game design and authority contract. Not implemented.

## 1. First principles

Separate `HumanIdentity`, `Connection`, `PlayerSeat`, `Force`, `Team`, `Faction`, `DiplomaticRelation`, and `ControllerPermission`. Distinct humans can control one economic/military Force. Several Forces can form a Team. Faction is a content template; different teams can choose the same faction. A single Force may continue to exist after one controller disconnects or surrenders. Competitive victory, diplomacy, and post-defeat assistance do not rely on a one-player-one-base model.

```text
Human A ── Seat A ──┐
                    ├── controls Force 1 [AFN; units, resources, tech]
Human B ── Seat B ──┘                 │
                                     └── belongs to Team Red
Bot C ─── Seat C ───── controls Force 2 [EC; own units/resources] ── Team Red
Human D ─ Seat D ───── controls Force 3 [PI; own units/resources] ── Team Blue
```

Teams determine initial joint victory and friendly-fire policy; treaties create additional, possibly temporary, relationships between Forces or Teams.

## 2. Lobby models and templates

| Template               | Force ownership and seats                                      | Typical use                            |
| ---------------------- | -------------------------------------------------------------- | -------------------------------------- |
| Duel                   | 2 humans, 2 forces, 2 teams                                    | 1v1 PvP                                |
| Team PvP               | 4 humans, 4 forces, 2 teams                                    | Standard 2v2                           |
| Shared Command         | 2 humans, 1 force, 1 team, vs AI force                         | One army/economy controlled by friends |
| Co-op Allies           | 2 humans, 2 forces, same team vs AI                            | Separate allied bases                  |
| Three-Commander Shared | 3 humans, 1 force vs enemy force                               | Military/economy split                 |
| Hybrid                 | Human A+B control Force 1, Bot controls Force 2, both Team Red | Co-op with AI teammate                 |
| FFA + Diplomacy        | Multiple separate forces and dynamically negotiated treaties   | Alliances and betrayal                 |
| Survival               | Shared team survives waves of AI attackers                     | Co-op PvE                              |
| Last Stand             | Eliminated controller joins surviving ally force               | Friendly comeback mechanic             |
| Observe                | Spectator seat, no commands, visibility policy                 | Watch/replay                           |

Templates are built-in lobby shortcuts, not content files: they fill seats and teams from the map's spawns. The lobby exposes a number of human/AI seats, force slots, team assignments, factions, optional starting eras, resource presets, map, allowed treaties, friendly-fire, victory type and eliminated-player policy. The host chooses whether teams are locked, dynamic diplomacy is enabled, and whether helping a surviving ally is possible. Lobby validates map spawn capacity, faction/ruleset compatibility and content hash before ready-state is accepted.

**Default friendly match:** Private room code, guest display name, one force per player initially, allow explicit Shared Command seats, fixed teams, post-defeat request-assist, team-only fog. **Default competitive preset:** locked teams, post-defeat team-limited spectator, no control transfers not predeclared, no omniscient observer during live play.

## 3. Command permissions and conflicts

`Grant = { seatId, forceId, scopes, grantedBy, grantedAtTick, revokedAtTick?, expiresAtTick? }`.

Scopes: `unit.orders`, `unit.abilities`, `economy.transfer`, `economy.build`, `production.queue`, `research.spend`, `diplomacy.propose`, `diplomacy.accept`, `commander.abilities`, `surrender`, `team.admin` (never implicit). `full` is shorthand for a curated group, not bypass of authorization. Some actions like surrender and diplomacy ratification can require multi-controller approval in custom modes. A controller can leave a force while others retain access.

Two humans issuing `move` commands to the same tank in the same tick is expected. Server assigns deterministic `serverSequence`; the unit's order model defines replace/append behavior. No last-arrival-on-client race. Economy and build costs are charged on canonical server execution; budget is not reserved merely by a client preview. Client receives accepted/rejected command acknowledgements, with cause. Highlight conflicting orders in co-op UI later; support commander pings, optional squad locks and roles without altering core ownership.

## 4. Eliminated players and ally assistance

Distinguish:
- **Seat abandoned:** A human leaves; Force can survive under other players/AI.
- **Force eliminated:** Configured elimination predicate for its buildings/units/objectives becomes true.
- **Team eliminated:** No eligible Force or completed alternate objective remains.
- **Observer status:** A Seat is read-only with a visibility scope.

**Transition state machine:** `playing -> force_eliminated -> choose(spectate_team, request_assist, quit) -> assist_pending -> assist_active | spectating_team | results`. An already defeated player can only assist a living Force which is an eligible ally under the **match's current alliance policy**. If ally accepts, the server creates a scoped Grant at a specific tick. No units, resources, research or populations are magically spawned or moved. The player now controls the target Force's existing army. The ally can revoke or downgrade the grant. If the alliance breaks, revoke automatically at a canonical tick. If the assisted Force dies, repeat policy or spectate.

**Information-integrity invariant:** A player who has been shown all-enemies omniscient spectator state is **never promoted** to an active Force in that match. Team spectators may see only a subset equivalent to their potential ally's visibility if assistance remains possible. Delayed omniscient replay/observer is safe only after permanent nonparticipation. A reconnect to the original seat does not override elimination status.

**Host controls:** `postDefeatMode = disabled | spectateOnly | requestAllyAssist | preauthorizedAutoAssist`, `assistEligibleTeams`, `allowedScopes`, `autoGrantOnElimination`, `spectatorVision = team | delayedAll | allAfterGame`, and `allowReconnect`. Ranked preset locks these; custom lobbies show warnings for omniscient spectating or dynamic team switches.

## 5. Diplomacy

A diplomatic relation is a game-state entity/record, separate from the team roster. Base relations: war, neutral, ceasefire, alliance; treaty overlays can grant vision, trade, passage, resource share, shared buildings, and later controlled unit exchange. A treaty consists of stable ID, parties, proposer, acceptance state, affected scopes, start tick, expiry tick, cooldown and revocation penalty/policy. The authoritative system resolves rules in a deterministic order.

Support modes:
1. **Locked alliances:** Standard team PvP/PvE, no betrayal.
2. **Open diplomacy:** FFA forces propose/revoke ceasefire, trading, shared vision and alliance.
3. **Peace timer:** No hostile attacks for an opening window.
4. **Territorial politics:** City control, treaties and supply/influence can alter strategic relations.
5. **Campaign diplomacy:** Missions trigger scripted changes at exact ticks.

**Victory ambiguity must be resolved up front.** Recommended policies: `originalTeamLastStanding` for competitive, `currentAllianceVictory` only for an explicit custom diplomacy game with anti-abuse rules, or scenario objectives. A temporary ceasefire is not a joint-victory alliance. In dynamic victory, test trivial last-second teaming, simultaneous victory, bilateral vs multilateral relations, disconnected allies, and whether a player may win while having betrayed a teammate. Do not permit host changes mid-match except through a voted in-match rule with deterministic command semantics.

## 6. Networking and security

Use a headless authoritative match server. Transport command messages from clients with dedup IDs and per-channel rate limits (commands 30/s per seat with bursts of 60; chat 3 per 5 s; pings 5 per 5 s; presence 15/s; voice signalling 10/s). Throttled messages are rejected with a `rate_limited` code, never dropped silently; server validates identity, seat grant, tick validity, target ownership, target visibility, position constraints, resource costs, tech gates, map placement, cooldowns and mode restrictions. Never accept client-reported damage, income, hit positions, fog or victory.

Proposed wire messages:

```text
Client -> Server: hello(version, simHash, mapHash, packVersions)
Server -> Client: welcome(session, serverTick, yourSeat, lobbySnapshot)
Client -> Server: command(requestId, playerSeq, requestedTick, payload)
Server -> Client: ack(requestId, accepted, canonicalTick, rejectionCode?)
Server -> Client: stateSnapshot(tick, visibilityEpoch, stateForThisSeat)
Server -> Client: stateDelta(baseTick, tick, filteredPatch)
Server -> Client: matchEvent(tick, eventId, type, visibilityScope, payload)
Client -> Server: requestReconnect(lastSeenTick, sessionProof)
Server -> Client: reconciledSnapshot(tick, permissions, stateForThisSeat)
```

Lobby traffic uses Colyseus room state and events; gameplay streaming uses our own protocol over room messages (see [architecture.md §8](../engineering/architecture.md#8-server-and-replication)) and has independent metrics and protocol versioning. Match starts only when versions/content/map hashes match; downloaded custom packs require verification. For a larger match, server may send a common team-filtered view rather than encoding identical per-controller views repeatedly. Other teams' hidden units, AI goals and secret economy state never appear in the player payload. Stealthed and previously seen units require explicit fog memory semantics, not client guesses. Spectator delay adds replay buffering, not secret-state access.

**Latency approach:** 20 Hz server simulation initially, client snapshots at measured lower cadence, rendered interpolation and responsive local order indicators. No full deterministic lockstep requirement for clients. Input buffering, bandwidth/delta strategies and command acknowledgement must be benchmarked before targeting high-population matches. Use a dedicated server or a trusted embedded server for browser-hosted/private options, not untrusted peer ownership of hidden state.

## 7. AI and disconnection

Bots (design in [ai.md](../engineering/ai.md)) are `PlayerSeat` command producers with the same permissions and visibility restrictions as humans unless an explicitly cheating difficulty is selected. AI controlling two co-op forces remains two Force economies, unless those forces deliberately share one. Difficulty changes decision quality, not hidden rules. Disconnection has a grace timer outside simulation; when it expires, the server issues a system-seat command applying the match's leave/disconnect policy ([match-rules.md](match-rules.md#leaving-and-disconnecting)). If the owner returns, permissions transfer safely at a tick boundary. A host leaving cannot arbitrarily confiscate all resources; session ownership and moderation are server concerns.

## 8. Adversarial and acceptance tests

- Two human controllers attempt to spend the final 100 credits in the same tick; exactly one purchase can succeed when each purchase costs 100.
- One player repeatedly orders a teammate's units without a grant; all commands rejected.
- A shared Force survives a controller quitting; remaining controller can continue match.
- A Force is eliminated while an ally survives; assist request accepted; defeated player issues a move order under explicit grant; resources unchanged.
- A Force eliminated with no surviving ally can only spectate/quit.
- Omniscient observer cannot transition to active; no fog leak through reconnect, replay, snapshot delta or delayed spectator.
- Dynamic treaty forms, vision becomes shared at canonical tick, treaty dissolves, vision revoked without leaving hidden units in live replication.
- Simultaneous surrender, defeat and alliance change resolve in documented priority and produce one outcome in all replay runs.
- Shared-role scopes constrain spending, tech choices, building placement and abilities, even when requests arrive concurrently.
- Lobby rejects incompatible content, too many Forces for spawn slots, invalid team win rules or stale clients.

## 9. Co-op presence and communication

Several humans, or humans and bots, commanding one Force is a core feature. Presence makes it feel like playing together rather than fighting over the same units.

**Teammate presence** (shown only to co-controllers of the same Force and to teammates in a locked team, never to treaty partners in diplomacy games, never to enemies):

- **Cursors:** each co-controller's cursor appears on the map and minimap, with their name and colour.
- **Placement previews:** a building a teammate is about to place shows as a translucent ghost with their colour. If two players place on the same spot, the sim resolves it, and the first canonical command wins.
- **Selections:** units a teammate has selected get a thin outline in that teammate's colour, so co-controllers can see who is handling what.
- **Camera indicators:** the minimap shows each teammate's camera frame.
- **Pings and markers:** attack, defend, on-my-way and danger pings, plus temporary map drawings.
- **Bot co-controllers** show presence too: their current focus area and intent ("expanding north") appear as a marker. See [ai.md](../engineering/ai.md).

Presence is **non-authoritative** and lives outside the sim. It travels as Colyseus room messages at about 10 Hz and is never part of replays or state hashes. The room derives each message's recipients from the sim's Force and team membership at the latest snapshot tick, so a treaty or team change takes effect at a canonical tick; presence is never sent with `broadcast`. The server stamps the sender on every relayed message. Cursor positions would leak information, so they are never sent to opponents, treaty partners, or spectators who could become players.

**Communication:**

- **Text chat:** team, all, and private messages, plus lobby chat. All-chat can be disabled by the host. Chat filter, mute per player.
- **Voice chat:** WebRTC (browser-native), **opt-in**: the microphone is only requested when a player turns voice on. Signalling goes through the Colyseus room. Audio is relayed through our TURN server by default, so players never see each other's IP addresses; a direct peer-to-peer mode exists only for private games where everyone opts in. Push-to-talk or voice activation, limited to the same audience as presence (co-controllers and locked teammates), per-player volume and mute, and a speaking indicator next to the name. Voice never goes to the opposing team.
- **Quick commands:** a chat wheel ("Need help", "Attacking", "Retreat") that is localized for every player.

## 10. Lobby

- **Find a game:** room list with filters, join by room code, quick match later.
- **Room screen:**
  - seats with human or bot assignment; multiple seats per Force for Shared Command;
  - team, faction, colour and start position per Force;
  - map preview with spawns;
  - enabled packs and rule options: fog, resources, victory, diplomacy, post-defeat policy (§2, §4);
  - lobby chat;
  - ready state.
- **Host tools:** kick, lock or unlock seats, swap players, add bots and set their difficulty, transfer host.
- **Checks before start:** content, map and version hashes match (§6), spawn capacity, valid team and victory rules.
- **Rejoin:** a disconnected player can rejoin their seat from the main menu while the match runs (§7). The client keeps the Colyseus reconnection token in local storage, valid for the match's reconnect window. For guests, the token is the session proof in `requestReconnect`; accounts add their sign-in on top.

**Acceptance tests (presence):** opponents never receive cursor, placement-preview, selection or voice data; a bot co-controller and a human can both command one Force with their grants enforced; two simultaneous placements on one spot produce exactly one building.
