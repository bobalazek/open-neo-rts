# 2026-11-04 — First-pass combat signatures for the playable roster

**Context.** Only the Collective Soldier and Dragon Tank had combat sounds.
The same permitted event routing already supports the remaining armed
first-playable definitions, so this batch supplies assets through existing
`presentation.sounds` instead of adding another playback system.

**Decision.** Add original mono 48 kHz Vorbis fire, impact and death clips for
Rocket Trooper, Drone Hunter, Metamorphic APC and Anti-Air Complex. Every clip
has its own co-located editable FFmpeg filter graph, fixed noise seed and
`assets.json` entry under the accepted owner credit rule. The complete signals
come from oscillators, filtered noise and envelopes; no external sample is used.
[Verified CC0 audio](2026-11-04-cc0-audio.md) remains an available source option.

The Rocket Trooper uses a longer exhaust hiss and low blast; Drone Hunter a
shorter bright crack and metallic chip; the APC a lower mechanical report and
vehicle breakup; the Anti-Air Complex a heavier flak report and longer brick
collapse. These are provisional first-pass signatures, not approved final audio
direction or human voice lines. The Anti-Air Complex currently shares one
fire/impact signature across its gun and missile: the permitted launch event
does not yet identify individual weapons. Separate per-weapon routing is later
audio work, without changing either weapon's gameplay.

**Boundaries.** Existing routing still requires visible launch/death sources and
continuously visible projectile handles for attributed impacts. This adds no
generic hidden-launch impact, new observation field, simulation rule or version
bump. Gameplay content identity and deterministic goldens must stay unchanged;
cosmetic identity includes the new references and bytes. Models are not rebuilt.

**Verification scope.** Extend the real normal-worker combat/output journey to
Rocket Trooper and APC as well as the two earlier ground combatants. Drone Hunter
and Anti-Air Complex have air-only weapons, while normal-match starting kits
explicitly reject aircraft in this phase. Their browser check therefore uses
labelled permitted presentation fixtures with actual catalog URLs and Babylon
decoding/playback. It proves routing and decoding, not air combat or normal
anti-air usefulness. The CLI checks all exports, provenance and headroom. This
does not qualify the complete battle mix or subjective listening quality.

The local repository/content batch passes, as do all six Chromium/WebKit audio
journeys. Independent decoding checks all twelve new exports and reproduces the
Anti-Air Complex death export byte-for-byte from its graph. Measured true peaks
range from −12.3 to −3.9 dBTP. Hosted CI remains unqualified while the account's
payment/spending-limit block prevents jobs from starting; Firefox was not rerun
for this audio batch after its earlier local profile-launch failure.

The six armed first-playable definitions now have all three references. Generic
impacts, noncombat/other-roster sounds, movement, public construction effects,
announcer speech/subtitles/queue, music/ducking and full-mix qualification remain
task 2-36. The broader playable and release milestones remain open.
