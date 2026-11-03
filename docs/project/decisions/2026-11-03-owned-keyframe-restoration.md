# Owned keyframes and canonical state restoration

Task 2-33b needs direct state restoration for replay seeking while preserving
the existing external-save verification contract. The owner delegated routine
implementation and sequencing choices. Deliver the owned-frame path first;
do not turn a file checksum into authority to skip input-history validation.

`createMatchKeyframe` retains a private capture made by a live/replayed host and
returns only a frozen tick/hash/restore interface. It exposes no mutable bytes
and cannot be reconstructed from JSON. Restoring an owned frame checks installed
setup identity and constructs a new isolated host without stepping elapsed ticks.
The future replay viewer can capture these frames while verifying/playing a
record and seek to one without rerunning its prefix.

The shared restoration path replaces the initialized candidate's ECS rows while
preserving its registered layouts and feature-owner references. It restores tick,
PRNG words, exact cached movement profiles/routes/search continuations, exploration,
structure memory, bot state/projection mappings and pending decisions. It retains
accepted external history for complete terminal input records; old controller
log entries, checkpoint history and cosmetic events are not replayed. These are
not canonical gameplay inputs. Human presentation handles remain session-local.

Movement validates bounded plain integer JSON, exact nested field layouts,
definitions, actors, queue ownership/identity and search state before committing.
Dock destinations retain their existing optional facing metadata, including in
queued anchor inputs, so real Supply Truck return routes remain restorable.
Existing path, anchor and geometry restorers retain their continuation validation.
Cached obstacle geometry may legitimately precede a same-tick destruction; keep
that cache and its occupancy signature, then let the ordinary next refresh
invalidate it. Recompiling from the new world's current obstacles would change
ongoing searches. Fresh ECS decoding bounds allocation before entity creation;
the candidate allows its installed starting rows plus 65,536 dynamic rows.

External `restoreMatchSnapshot` still verifies setup, checksum, accepted history
and the complete captured state against an actual replay before using direct
restoration. It then compares the restored full capture too. Failure leaves the
old session untouched. This slice does not make external save imports faster or
complete the remaining independent per-feature validators for unverified bytes.
Those remain 2-33b2; owned keyframes unblock the replay viewer without weakening
imports. No direct byte-file restoration API is exported from the package.

During the state audit, the new ground-fire observation grid needed its own deep
copy, like fog. A bot can now mutate its returned grid without changing the cached
next observation. Preserve that isolation across restored observation capture.

SIM58, snapshot format 1, authored definitions and outcome goldens stay unchanged.
This adds a restoration path, not simulation rules or a migration. Full replay
containers/viewer and phase acceptance remain separate work.
