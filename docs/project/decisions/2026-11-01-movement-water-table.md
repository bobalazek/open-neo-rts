# 2026-11-01 — Movement domains and water

**Context.** Terrain, naval and unit-order docs disagreed about shallow water. Navigation compilation (1B-19) needed one authoritative table.

**Decision.** Borut approved this table with “Use this table” on 2026-11-01 at 20:26 UTC. Foot units use land and shallow water, never deep water. Wheeled units use land and shallow water, with 50% of their ordinary speed in shallow water. Tracked units use land only. Naval units use deep water only. Hover and amphibious units use land, shallow and deep water. Air crosses all three directly, without a navigation grid. No other water speed modifier was approved.

**Consequences.** Domain passability is engine vocabulary; original prop `blocks` and `domains` remain authoritative. This resolves the water gate only. Node content and normal construction radius/clearance policy stay pending. Route weights are separate engineering inputs from physical speed; this decision does not approve final terrain balance.
