# 2026-11-01 — No web meta-framework

**Context.** Next.js and Remix were considered for the client. The client is a full-screen canvas with a React overlay: no server rendering, no SEO, static content packs, and live data over WebSocket from a separate match server. The desktop shell needs a static build.

**Decision.** The client is a single-page app: React 19, wouter for routes, Zustand for UI state, Bun's bundler and dev server. The match server is a separate Bun process with Colyseus. Desktop is a Tauri 2 shell around the web build.

**Consequences.** No server runtime for the client to host or secure. If a public website is needed later, it's a separate static site.
