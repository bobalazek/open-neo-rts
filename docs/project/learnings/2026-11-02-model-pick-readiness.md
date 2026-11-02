# 2026-11-02 — Asset readiness does not commit posed picking transforms

The WebKit selection journey intermittently selected one of two loaded tanks.
Holding the next scene frame reproduced the failure with Shift correctly delivered.
Model-bound measurement computed descendant matrices at their initial origin; the
presentation then applied the map pose without another scene render ID. Babylon's
unforced picking update could reuse those old matrices. Force world-matrix
computation for eligible live meshes at the picking boundary. This preserves ghost
and removal filters, avoids per-frame work and needs no sleeps or retries. The
original-GLB NullEngine regression picks immediately after accept, and the held-frame
WebKit journey now passes with its original assertions.
