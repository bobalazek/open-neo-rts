# 2026-11-02 — Reuse the baseline in normal identity checks

[CI 41428198694](https://github.com/bobalazek/open-neo-rts/actions/runs/41428198694)
passed all browser/content jobs but its normal setup-identity correctness test
hit Bun's default five-second limit at 5,307 ms. Each comparison rebuilt the same
unchanged baseline, including cold Training Grounds navigation. Compute that
baseline hash once: six distinct startup cases replace ten initializations, with
the same canonical-order and changed-setting/team/seed/content assertions. No
fixture, golden, production behavior, timeout or performance target is changed.
