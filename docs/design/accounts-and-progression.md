# Accounts, ranked play and progression

**Scope:** guest play and local profiles first. Accounts, ranked play and ladders come after multiplayer works.

## Identity

- **Guest:** pick a name and play, offline or online. Profile, settings, saves and stats stay on the device.
- **Account (later, optional):** sign in with an email link or a common OAuth provider. Adds cross-device profile sync, friends, ranked play and moderation history. The game never requires an account for single player or private multiplayer rooms.
- **Data kept** for accounts: display name, email (for sign-in only), ratings, match history, friends, moderation records. Nothing else. Players can export and delete their data.

## Social

- **Friends list** with online status and "join game".
- **Parties:** friends group up and enter the room browser or matchmaking together (arranged teams).
- **Recent players** list for re-inviting or reporting.

## Ranked play (later)

- **Matchmaking queues:** 1v1, 2v2 and 2v2 Shared Command (two players, one Force). Arranged teams queue together and are matched against other arranged teams when possible.
- **Rating:** Glicko-2 per queue, with a placement period. Displayed as divisions; the raw rating is visible in the profile.
- **Ranked rules:** locked competitive presets ([match-rules.md](match-rules.md)), a ranked map pool, map vetoes, no pausing beyond the competitive limit, and leaving counts as a loss.
- **Seasons** reset ratings softly every few months.

## Progression

- **Stats:** games played and won per faction and mode, favourite units, APM, match history with replays.
- **Achievements:** for campaign, Basic Training and fun challenges. Cosmetic rewards only (profile badges, unit colour patterns, banners). Nothing that changes gameplay, and nothing for sale.
- **Medals** in campaign missions ([screens/campaign.md](screens/campaign.md)).

## Screens

Profile and friends get their own screens when accounts land. Until then, the profile is the name in [home.md](screens/home.md) and the stats on [post-match.md](screens/post-match.md).

## Non-happy paths

- **Offline:** everything except online multiplayer works; account features show as unavailable, never as errors.
- **Leaving a ranked match:** counts as a loss after the reconnect window; repeated leaving adds queue cooldowns.
- **Disputed results** (server crash mid-match): the match is voided, no rating change.
