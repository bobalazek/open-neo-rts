# Deployment and operations

## Environments

| Environment | What                                                                                       | Where                                              |
| ----------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------- |
| Local       | `bun run dev`: web client, plus a local match server when multiplayer exists               | Developer machine                                  |
| PR preview  | Web build per PR with debug mode links ([CONTRIBUTING.md](../../CONTRIBUTING.md#previews)) | Static host with per-PR URLs                       |
| Staging     | `main` deployed automatically: web, match server, TURN                                     | Same setup as production, smaller                  |
| Production  | Tagged releases                                                                            | Static CDN for web; match servers in a few regions |

## What runs where

- **Web client** (`apps/web`): static files on a CDN. Each release is kept under a versioned path, so old replays can open the build that recorded them.
- **Match server** (`apps/server`): Bun + Colyseus in containers, one region per broad geography to start (e.g. EU, US). Rooms are independent; scaling is horizontal. Multiple server processes share room listings and presence through Colyseus's driver (Redis).
- **TURN server** for relayed voice chat.
- **Storage** for replays and match results (object storage) and, once accounts exist, a small database for accounts, ratings and moderation.
- **Desktop app** (`apps/desktop`, later): Tauri builds for Windows, macOS and Linux from CI, signed, with Tauri's auto-updater pointing at the release feed.

## Versions

- **Game version:** semver for releases (`0.4.2`).
- **Sim version:** an integer bumped whenever match outcomes can change ([architecture.md §5](architecture.md#5-determinism-contract)).
- **Protocol version:** bumped on wire-format changes.
- Clients and servers handshake on all three plus content hashes; mismatches get a clear "update required" message.
- **Channels:** stable and beta. The beta channel gets release candidates for a week before stable.

## CI/CD

- Every PR: check, typecheck, test, build, determinism suite, content and asset validation, preview deploy.
- `main`: the same, plus deploy to staging.
- Tags: build release artefacts (web bundle, server image, desktop installers), deploy to production after a manual approval.
- **Rollback:** redeploy the previous tag. Web builds are immutable, so rollback is a pointer switch; servers drain running matches before shutting down.

## Telemetry and crash reports

- **Opt-in**, asked once on first launch, changeable in settings.
- **Crash and error reports:** stack trace, game and sim version, renderer (WebGPU or WebGL), GPU string, and the last few hundred commands of the match for reproduction. No chat, no names.
- **Gameplay telemetry** (aggregate, anonymous): faction pick and win rates, match length, disconnects, performance (FPS buckets, tick time). Feeds balance and performance work.
- Server-side metrics (room count, tick time per room, bandwidth per seat, error rates) are always on; they contain no personal data.

## Monitoring

- Dashboards for match servers (rooms, tick time, CPU, bandwidth), TURN usage, and error rates.
- Alerts: server tick time above budget, error spikes, a region down.
- Health checks per server process; unhealthy processes stop accepting new rooms.

## Costs

Static hosting is cheap; match servers, TURN bandwidth and replay storage are the main costs. Keep regions few, compress replays, and expire unwatched replays after a set period (players can download their own first).
