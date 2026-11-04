# 2026-11-04 — Current Chrome and WebKit only

The owner requested current Chrome and WebKit and an end to expanding browser
compatibility work. Qualification now uses exactly two standard setups:

- Google Chrome stable on macOS, installed fresh by Playwright.
- The current WebKit bundled with the latest stable Playwright on macOS.

There is no Firefox, Edge, older-version, device-project or shard matrix. The
existing desktop/narrow flows remain responsive-layout checks inside these two
browser projects. Chrome keeps the internal `chromium` project name so existing
engine-specific fixtures retain their intended coverage, but selects the real
`chrome` channel. Playwright 1.64.1 was confirmed as the current stable package
when applying this decision; browser updates follow normal dependency upkeep.

WebKit uses its native macOS runner instead of extending Linux WPE diagnostics.
Those earlier failures remain recorded; this does not claim they were repaired.
Chrome now shares the macOS host instead of the Linux software-display and
virtual-audio setup; this reduces host-specific configuration without adding a
browser target. Both jobs run the same full suite with existing functional
assertions. One worker per job and a 45-minute installation/journey budget replace the earlier
shard experiments. Browser compatibility checks stay at this scope unless the
owner expands the supported targets.
