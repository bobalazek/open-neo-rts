import { builtins } from "virtual:debug-builtins";
import { content } from "virtual:normal-catalog";
import {
  type BattlefieldAction,
  CELL_SIZE,
  cameraGroundView,
  createMapPresentation,
  createRenderer,
  createReplayHud,
  LEVEL_HEIGHT,
  type ReplayHudContent,
  resourceInstances,
} from "@open-neo-rts/render";
import type { ForceStatisticsSnapshot } from "@open-neo-rts/sim";
import { text } from "../../shared";
import { mountNativePanel } from "../../shared/native-panel";
import {
  createReplayWorker,
  REPLAY_SPEEDS,
  type ReplayMarker,
  type ReplayRequest,
  type ReplayState,
} from "../../worker/replay";
import { catalogEntry, resolveEntityModel } from "../debug/catalog";
import { createPresentationClock } from "../debug/clock";
import { mapDecorations, resolveMapModel } from "../debug/map-visuals";
import { createMatchPresentation } from "../match";
import { type HudIcon, hudIcon } from "../match/icons";
import { bindWorldInteraction } from "../match/interaction";
import { createMinimap } from "../match/minimap";
import { type ChartMetric, metricLabels, table as statisticsTable } from "../post-match/statistics";
import { readDeviceSettings } from "../settings";
import { faction, map } from "../skirmish/setup";
import {
  replayAnalytics,
  replayMetrics,
  STATISTIC_VIEWS,
  type StatisticView,
  viewLabel,
} from "./analytics";
import { installedReplay } from "./files";
import { replayStore, replayTime, type SavedReplay } from "./storage";

/** This disposable screen owns one read-only worker; it has no live-session reference. */
export function replayViewer(
  root: HTMLElement,
  canvas: HTMLCanvasElement,
  id: string,
  back: () => void,
) {
  root.replaceChildren();
  const abort = new AbortController(),
    clock = createPresentationClock(),
    settings = readDeviceSettings();
  let disposed = false,
    failed = false,
    ready = false,
    latest: ReplayState | undefined,
    replay: SavedReplay | undefined,
    epoch = -1;
  let worker: ReturnType<typeof createReplayWorker> | undefined;
  let renderer: Awaited<ReturnType<typeof createRenderer>> | undefined,
    presentation: ReturnType<typeof createMatchPresentation> | undefined;
  let art: ReturnType<typeof createMapPresentation> | undefined,
    minimap: ReturnType<typeof createMinimap> | undefined,
    interaction: ReturnType<typeof bindWorldInteraction> | undefined;
  let hud: ReturnType<typeof createReplayHud> | undefined,
    panel: ReturnType<typeof mountNativePanel> | undefined;
  let markers: readonly ReplayMarker[] = [],
    markerIdentity = "";
  let statisticsOpen = false,
    statisticsReady = false,
    statisticView: StatisticView = "economy";
  let statisticMetric: ChartMetric = "creditsIncome",
    statistics: readonly ForceStatisticsSnapshot[] = [];
  let statisticsRevision = 0,
    analysisKey = "",
    analysis: ReplayHudContent["statistics"];
  let eventPan: (x: number, y: number) => void = () => {};
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const overlay = document.createElement("dialog");
  overlay.className = "match-menu";
  overlay.setAttribute("aria-labelledby", "replay-loading-title");
  overlay.innerHTML = `<canvas class="native-menu-canvas" aria-hidden="true" hidden></canvas><section class="loading-screen"><h1 id="replay-loading-title">${text("ui.replays.loading")}</h1><p role="status"></p><progress max="1" value="0" aria-label="${text("ui.replays.loading")}"></progress><p role="alert"></p><button type="button" data-back>${text("ui.common.cancel")}</button></section>`;
  document.body.append(overlay);
  overlay.showModal();
  const semantics = overlay.querySelector<HTMLElement>("section")!;
  panel = mountNativePanel(overlay, semantics, overlay.querySelector("canvas")!, {
    id: () => (failed ? "replay-error" : "replay-loading"),
    title: () => text(failed ? "ui.replays.error-title" : "ui.replays.loading"),
    modal: true,
  });
  const failure = (error: unknown) => {
    if (disposed || failed) return;
    failed = true;
    clearTimeout(timeout);
    worker?.dispose();
    ready = false;
    presentation?.setPlaybackRate(0);
    renderer?.camera.setInputEnabled(false);
    if (!overlay.isConnected) {
      document.body.append(overlay);
      overlay.showModal();
    }
    semantics.querySelector<HTMLElement>('[role="alert"]')!.textContent =
      error instanceof Error ? error.message : text("ui.replays.failed");
    semantics.querySelector("h1")!.textContent = text("ui.replays.error-title");
    semantics.querySelector<HTMLElement>('[role="status"]')!.textContent = "";
    semantics.querySelector("progress")?.remove();
    semantics.querySelector("button")!.textContent = text("ui.replays.title");
    if (!panel)
      panel = mountNativePanel(overlay, semantics, overlay.querySelector("canvas")!, {
        id: () => "replay-error",
        title: () => text("ui.replays.error-title"),
        modal: true,
      });
    panel.update();
  };
  const request = (message: ReplayRequest) =>
    (worker?.request(message) ?? Promise.reject(new Error("Replay is unavailable"))).catch(
      (error) => {
        if (!disposed && !failed) failure(error);
      },
    );
  const buttons = new Map<string, HTMLButtonElement>(),
    images = new Map<HudIcon, string>();
  const icon = (name: HudIcon) => {
    let source = images.get(name);
    if (!source) {
      const svg = hudIcon(name);
      svg.setAttribute("width", "24");
      svg.setAttribute("height", "24");
      source = `data:image/svg+xml,${encodeURIComponent(new XMLSerializer().serializeToString(svg).replaceAll("currentColor", "#ddc382"))}`;
      images.set(name, source);
    }
    return source;
  };
  const q = <T extends Element>(selector: string) => root.querySelector<T>(selector)!;
  function seek(tick: number) {
    if (!latest || !ready) return;
    void request({ type: "seek", tick: Math.max(0, Math.min(latest.duration, Math.round(tick))) });
  }
  function cycle(control: HTMLSelectElement, delta = 1) {
    control.selectedIndex =
      (control.selectedIndex + delta + control.options.length) % control.options.length;
    control.dispatchEvent(new Event("change"));
  }
  function adjacentEvent(direction: number) {
    if (!latest) return;
    return direction > 0
      ? markers.find((marker) => marker.tick > latest!.tick)
      : [...markers].reverse().find((marker) => marker.tick < latest!.tick);
  }
  function jumpEvent(marker?: ReplayMarker) {
    if (!marker || latest?.phase !== "ready") return;
    seek(marker.tick);
    if (marker.type === "combat") eventPan(marker.x, marker.y);
  }
  function markerLabel(marker: ReplayMarker) {
    return text(`ui.replays.event-${marker.type === "combat" ? "combat" : marker.reason}`, {
      time: replayTime(marker.tick),
      force: marker.type === "elimination" ? marker.force + 1 : "",
    });
  }
  function toggleStatistics() {
    statisticsOpen = !statisticsOpen;
    statisticsReady = false;
    statistics = [];
    analysisKey = "";
    q<HTMLElement>("[data-analysis]").hidden = !statisticsOpen;
    const button = buttons.get("statistics")!;
    button.setAttribute("aria-expanded", String(statisticsOpen));
    void request({ type: "statistics", enabled: statisticsOpen });
    if (latest) update(latest);
    canvas.focus({ preventScroll: true });
  }
  function statisticControls() {
    const metric = q<HTMLSelectElement>("[data-stat-metric]");
    metric.title = text(
      statisticView === "military" ? "ui.replays.army-help" : "ui.replays.metric-help",
    );
    metric.replaceChildren();
    const metrics =
      statisticView === "economy" || statisticView === "military"
        ? replayMetrics[statisticView]
        : [];
    for (const value of metrics) metric.append(new Option(text(metricLabels[value]), value));
    if (metrics.length) {
      statisticMetric = metrics[0]!;
      metric.value = statisticMetric;
    }
    metric.closest("label")!.hidden = !metrics.length;
    for (const view of STATISTIC_VIEWS) {
      const tab = buttons.get(`statistics-${view}`)!;
      tab.setAttribute("aria-selected", String(statisticView === view));
      tab.tabIndex = statisticView === view ? 0 : -1;
    }
    q("[data-stat-panel]").setAttribute("aria-labelledby", `replay-stat-tab-${statisticView}`);
    q<HTMLElement>("[data-stat-values]").tabIndex = metrics.length ? -1 : 0;
  }
  function statisticContent() {
    if (!statisticsOpen || !latest?.snapshot || !content.catalog) return;
    const key = `${latest.epoch}:${Math.floor(latest.tick / 20)}:${statisticsRevision}:${statisticView}:${statisticMetric}:${statisticsReady}`;
    if (key !== analysisKey) {
      analysisKey = key;
      analysis = replayAnalytics(
        statisticView,
        statisticMetric,
        statistics,
        latest.snapshot,
        builtins.map(({ raw, icon: image }) => ({
          id: `core.${(raw as { id: string }).id}`,
          name: (raw as { name: string }).name,
          image: image ?? icon("population"),
        })),
      );
      if (!statisticsReady) analysis.note = text("ui.replays.statistics-loading");
      else if (!statistics.length) analysis.note = text("ui.replays.statistics-empty");
      else if (statisticView === "production" && !analysis.table.rows.length)
        analysis.note = text("ui.replays.production-empty");
      const region = q<HTMLElement>("[data-stat-values]");
      region.setAttribute("aria-label", analysis.table.caption);
      const rendered = statisticsTable(
        [...analysis.table.headers],
        analysis.table.rows.map((row) => [...row]),
        analysis.table.caption,
      );
      // The outer region owns stable keyboard focus while current values change.
      rendered.tabIndex = -1;
      region.replaceChildren(rendered);
      q<HTMLElement>("[data-stat-status]").textContent = analysis.note ?? "";
    }
    return analysis;
  }
  function controls(): ReplayHudContent | undefined {
    if (!latest || !replay || !content.catalog) return;
    const actions: BattlefieldAction[] = [];
    for (const [id, image] of [
      ["backward", "rewind"],
      ["play", latest.paused ? "play" : "pause"],
      ["forward", "forward"],
      ["previous-event", "previousEvent"],
      ["next-event", "nextEvent"],
      ["statistics", "statistics"],
      ["speed", undefined],
      ["vision", "vision"],
      ["exit", "exit"],
    ] as const) {
      const button = buttons.get(id)!;
      actions.push({
        id,
        label:
          id === "speed"
            ? `${latest.speed}×`
            : id === "vision"
              ? (q<HTMLSelectElement>("[data-vision]").selectedOptions[0]?.textContent ?? "")
              : (button.textContent ?? ""),
        tooltip: button.title,
        image: image ? icon(image) : undefined,
        disabled: button.disabled,
        active: id === "statistics" && statisticsOpen,
        activate: () => {
          button.focus({ preventScroll: true });
          button.click();
          canvas.focus({ preventScroll: true });
        },
      });
    }
    if (statisticsOpen && latest.snapshot) {
      for (const view of STATISTIC_VIEWS) {
        const button = buttons.get(`statistics-${view}`)!;
        actions.push({
          id: `statistics-${view}`,
          label: viewLabel(view),
          tooltip: button.title,
          disabled: button.disabled,
          active: statisticView === view,
          activate: () => {
            button.focus({ preventScroll: true });
            button.click();
            canvas.focus({ preventScroll: true });
          },
        });
      }
      if (statisticView === "economy" || statisticView === "military") {
        const metric = q<HTMLSelectElement>("[data-stat-metric]");
        actions.push({
          id: "statistics-metric",
          label: text(metricLabels[statisticMetric]),
          tooltip: metric.title,
          disabled: metric.disabled,
          active: false,
          activate: () => {
            metric.focus({ preventScroll: true });
            cycle(metric);
            canvas.focus({ preventScroll: true });
          },
        });
      }
    }
    const definitions = new Map(content.catalog.definitions.map((item) => [item.id, item]));
    const snapshot = latest.snapshot;
    const players: ReplayHudContent["players"] = (snapshot?.banks ?? []).map((bank) => {
      const force = bank.force;
      const entities = snapshot!.entities.filter((entity) => entity.force === force);
      return {
        name: `${text(force === 0 ? "ui.replays.player" : "ui.replays.bot", { team: force + 1 })} · ${faction.name}`,
        color: force === 0 ? "#81d4ed" : "#efa394",
        metrics: [
          {
            label: text("ui.result.credits"),
            value: String(bank.resources.credits),
            image: icon("credits"),
          },
          {
            label: text("ui.result.materials"),
            value: String(bank.resources.materials),
            image: icon("materials"),
          },
          {
            label: text("ui.result.units"),
            value: String(
              entities.filter((entity) => definitions.get(entity.definition)?.kind === "unit")
                .length,
            ),
            image: icon("population"),
          },
        ],
        production: entities
          .flatMap(
            (entity) =>
              entity.production?.queue
                .filter((item) => item.slot !== null)
                .map((item) => {
                  const entry = builtins.find(
                    ({ raw }) => `core.${(raw as { id: string }).id}` === item.definition,
                  );
                  return {
                    image: entry?.icon ?? icon("build"),
                    label: (entry?.raw as { name?: string } | undefined)?.name ?? item.definition,
                    progress: Math.floor((item.completedTicks * 100) / item.totalTicks),
                  };
                }) ?? [],
          )
          .slice(0, 4),
      };
    });
    return {
      title: map.name,
      tick: latest.tick,
      duration: latest.duration,
      time: `${replayTime(latest.tick)} / ${replayTime(latest.duration)}`,
      status:
        latest.phase === "ready"
          ? ""
          : text("ui.replays.seeking", {
              current: replayTime(latest.tick),
              total: replayTime(latest.duration),
            }),
      scale: settings.uiScale / 100,
      timelineLabel: text("ui.replays.timeline-help"),
      markerGroupHint: text("ui.replays.event-cluster"),
      markers: markers.map((marker, index) => ({
        id: `marker:${index}`,
        tick: marker.tick,
        kind: marker.type,
        label: markerLabel(marker),
        tooltip: markerLabel(marker),
        image: icon(
          marker.type === "combat"
            ? "attack"
            : marker.reason === "surrendered"
              ? "surrender"
              : "cancel",
        ),
        disabled: latest!.phase !== "ready",
        active: false,
        activate: () => jumpEvent(marker),
      })),
      actions,
      statistics: statisticContent(),
      players,
    };
  }
  function update(state: ReplayState) {
    if (disposed || failed) return;
    if (latest && (latest.epoch !== state.epoch || latest.vision !== state.vision)) {
      statisticsReady = false;
      statistics = [];
      analysisKey = "";
    }
    if (state.statistics && statisticsOpen) {
      statistics = state.statistics;
      statisticsReady = true;
      statisticsRevision++;
    }
    if (state.markers) markers = state.markers;
    else if (latest && latest.vision !== state.vision) markers = [];
    latest = state;
    clock.update(performance.now(), state.paused || state.phase !== "ready", state.speed);
    presentation?.setPlaybackRate(state.paused || state.phase !== "ready" ? 0 : state.speed);
    if (!ready) {
      semantics.querySelector<HTMLElement>('[role="status"]')!.textContent = text(
        "ui.replays.verifying",
        { current: replayTime(state.tick), total: replayTime(state.duration) },
      );
      const progress = semantics.querySelector("progress")!;
      progress.max = state.duration;
      progress.value = state.tick;
      panel?.update();
      return;
    }
    canvas.dataset.tick = String(state.tick);
    canvas.dataset.replayPhase = state.phase;
    canvas.dataset.vision = String(state.vision);
    q<HTMLOutputElement>("[data-time]").textContent =
      `${replayTime(state.tick)} / ${replayTime(state.duration)}`;
    q<HTMLOutputElement>("[data-replay-status]").textContent =
      state.phase === "ready"
        ? ""
        : text("ui.replays.seeking", {
            current: replayTime(state.tick),
            total: replayTime(state.duration),
          });
    const timeline = q<HTMLInputElement>("[data-timeline]");
    timeline.max = String(state.duration);
    if (document.activeElement !== timeline) timeline.value = String(state.tick);
    q<HTMLSelectElement>("[data-speed]").value = String(state.speed);
    q<HTMLSelectElement>("[data-vision]").value = String(state.vision);
    const play = buttons.get("play")!;
    play.textContent = play.title = text(state.paused ? "ui.replays.play" : "ui.replays.pause");
    play.setAttribute("aria-pressed", String(!state.paused));
    play.disabled = state.phase !== "ready";
    for (const [action, direction] of [
      ["previous-event", -1],
      ["next-event", 1],
    ] as const)
      buttons.get(action)!.disabled = state.phase !== "ready" || !adjacentEvent(direction);
    const identity = JSON.stringify(markers);
    if (markerIdentity !== identity) {
      markerIdentity = identity;
      q("[data-events]").replaceChildren(
        ...markers.map((marker, index) => {
          const item = document.createElement("li"),
            button = document.createElement("button");
          button.type = "button";
          button.tabIndex = -1; // Previous/next event controls provide sequential keyboard access.
          button.dataset.replayMarker = String(index);
          button.textContent = button.title = markerLabel(marker);
          button.addEventListener("click", () => jumpEvent(marker), { signal: abort.signal });
          button.addEventListener("focus", () => hud?.focus(`marker:${index}`), {
            signal: abort.signal,
          });
          button.addEventListener("blur", () => hud?.focus(), { signal: abort.signal });
          item.append(button);
          return item;
        }),
      );
    }
    for (const button of root.querySelectorAll<HTMLButtonElement>("[data-replay-marker]"))
      button.disabled = state.phase !== "ready";
    for (const element of root.querySelectorAll<HTMLInputElement | HTMLButtonElement>(
      "[data-analysis] button,[data-analysis] select",
    ))
      element.disabled = state.phase !== "ready";
    const next = controls();
    q<HTMLElement>("[data-players]").replaceChildren(
      ...(next?.players ?? []).map((player) => {
        const row = document.createElement("p");
        row.textContent = [
          player.name,
          ...player.metrics.map((metric) => `${metric.label}: ${metric.value}`),
          ...player.production.map((item) => `${item.label}: ${item.progress}%`),
        ].join(" · ");
        return row;
      }),
    );
    if (next) hud?.update(next);
    if (state.snapshot && state.phase === "ready") {
      if (state.epoch !== epoch) {
        epoch = state.epoch;
        presentation?.reset();
      }
      minimap?.update(state.snapshot);
      const ticket = state.epoch;
      void presentation?.accept(state.snapshot, clock.now(performance.now())).catch((error) => {
        if (!disposed && latest?.epoch === ticket) failure(error);
      });
    }
  }
  async function initialize() {
    if (!/^[a-zA-Z0-9-]{1,80}$/.test(id)) throw new Error("Invalid replay identifier");
    replay = await replayStore.read(id);
    if (disposed || failed) return;
    const { loaded, setup } = await installedReplay(replay, abort.signal);
    if (disposed || failed) return;
    worker = createReplayWorker(update, failure);
    await worker.request({ type: "init", setup, record: replay.record });
    if (disposed || failed) return;
    const nextRenderer = await createRenderer(canvas, {
      terrain: loaded.grid,
      quality: settings.quality,
    });
    if (disposed || failed) {
      nextRenderer.dispose();
      return;
    }
    renderer = nextRenderer;
    canvas.hidden = false;
    renderer.camera.setControls({
      panSpeed: settings.cameraSpeed / 100,
      mouseSensitivity: settings.mouseSensitivity / 100,
      invertDragRotate: settings.invertDragRotate,
      edgeScroll: settings.edgeScroll,
      reducedMotion: settings.reducedMotion,
    });
    const spawn = map.spawns.find((entry) => entry.id === replay!.config.yourSpawn)!;
    renderer.camera.panTo(
      (spawn.position[0] ?? 0) * CELL_SIZE,
      (spawn.position[1] ?? 0) * CELL_SIZE,
    );
    art = createMapPresentation(
      renderer.scene,
      loaded.grid,
      [
        ...mapDecorations(loaded.definition.objects),
        ...resourceInstances(loaded.definition, loaded.grid, replay.config.seed),
      ],
      resolveMapModel,
    );
    await art.ready;
    if (disposed || failed) return;
    const catalog = builtins.map(({ raw, model, wreck }) => catalogEntry(raw, model, wreck));
    presentation = createMatchPresentation(renderer.scene, loaded.grid, (id, variant) => {
      const entry = catalog.find((entry) => entry.definition.id === id);
      if (!entry) throw new Error(`Model unavailable: ${id}`);
      return resolveEntityModel(entry, variant);
    });
    presentation.setForceColor(0, "#d8443a");
    presentation.setForceColor(1, "#3c93d9");
    if (!latest?.snapshot) throw new Error("Replay did not provide a view");
    presentation.setPlaybackRate(0);
    await presentation.accept(latest.snapshot, clock.now(performance.now()));
    if (disposed || failed) return;
    root.classList.add("match-shell", "replay-shell");
    root.innerHTML = `<section class="replay-controls"><h1>${text("ui.replays.watch")}</h1><div data-players></div><nav aria-label="${text("ui.replays.timeline")}"></nav><label>${text("ui.replays.speed")}<select data-speed></select></label><label>${text("ui.replays.vision")}<select data-vision></select></label><label>${text("ui.replays.timeline")}<input type="range" min="0" max="1" step="1" value="0" data-timeline></label><ol data-events aria-label="${text("ui.replays.events")}"></ol><output data-time></output><output role="status" data-replay-status></output></section><div class="match-hud"><div class="hud-panels"></div></div>`;
    // WebKit skips a range in sequential focus unless its tabindex is explicit.
    q<HTMLInputElement>("[data-timeline]").tabIndex = 0;
    for (const [id, label, activate] of [
      ["backward", "ui.replays.backward", () => seek((latest?.tick ?? 0) - 200)],
      [
        "play",
        "ui.replays.play",
        async () => {
          if (!latest) return;
          if (latest.tick === latest.duration && latest.paused) {
            await request({ type: "seek", tick: 0 });
            await request({ type: "pause", paused: false });
          } else await request({ type: "pause", paused: !latest.paused });
        },
      ],
      ["forward", "ui.replays.forward", () => seek((latest?.tick ?? 0) + 200)],
      ["previous-event", "ui.replays.previous-event", () => jumpEvent(adjacentEvent(-1))],
      ["next-event", "ui.replays.next-event", () => jumpEvent(adjacentEvent(1))],
      ["statistics", "ui.replays.statistics", toggleStatistics],
      ["speed", "ui.replays.speed", () => cycle(q("[data-speed]"))],
      ["vision", "ui.replays.vision", () => cycle(q("[data-vision]"))],
      ["exit", "ui.replays.exit", back],
    ] as const) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = button.title = text(label);
      button.dataset.replayAction = id;
      button.addEventListener("click", activate, { signal: abort.signal });
      button.addEventListener("focus", () => hud?.focus(id), { signal: abort.signal });
      button.addEventListener("blur", () => hud?.focus(), { signal: abort.signal });
      q("nav").append(button);
      buttons.set(id, button);
    }
    buttons.get("statistics")!.title = text("ui.replays.statistics-help");
    buttons.get("statistics")!.setAttribute("aria-expanded", "false");
    const analytics = document.createElement("section");
    analytics.hidden = true;
    analytics.dataset.analysis = "";
    analytics.innerHTML = `<div role="tablist" aria-label="${text("ui.stats.views")}"></div><div data-stat-panel role="tabpanel" id="replay-stat-panel"><label>${text("ui.stats.metric")}<select data-stat-metric></select></label><p data-stat-status role="status"></p><div data-stat-values role="region"></div></div>`;
    q(".replay-controls").append(analytics);
    for (const [index, view] of STATISTIC_VIEWS.entries()) {
      const tab = document.createElement("button");
      tab.type = "button";
      tab.textContent = tab.title = viewLabel(view);
      tab.setAttribute("role", "tab");
      tab.id = `replay-stat-tab-${view}`;
      if (view === "orders") tab.title = text("ui.replays.orders-help");
      tab.setAttribute("aria-controls", "replay-stat-panel");
      tab.addEventListener(
        "click",
        () => {
          statisticView = view;
          statisticControls();
          if (latest) update(latest);
        },
        { signal: abort.signal },
      );
      tab.addEventListener("focus", () => hud?.focus(`statistics-${view}`), {
        signal: abort.signal,
      });
      tab.addEventListener("blur", () => hud?.focus(), { signal: abort.signal });
      tab.addEventListener(
        "keydown",
        (event) => {
          const target =
            event.code === "ArrowRight"
              ? (index + 1) % 4
              : event.code === "ArrowLeft"
                ? (index + 3) % 4
                : event.code === "Home"
                  ? 0
                  : event.code === "End"
                    ? 3
                    : undefined;
          if (target === undefined) return;
          event.preventDefault();
          event.stopPropagation();
          const next = buttons.get(`statistics-${STATISTIC_VIEWS[target]}`)!;
          next.click();
          next.focus();
        },
        { signal: abort.signal },
      );
      analytics.querySelector("[role=tablist]")!.append(tab);
      buttons.set(`statistics-${view}`, tab);
    }
    const metric = q<HTMLSelectElement>("[data-stat-metric]");
    metric.title = text("ui.replays.metric-help");
    metric.addEventListener(
      "change",
      () => {
        statisticMetric = metric.value as ChartMetric;
        if (latest) update(latest);
      },
      { signal: abort.signal },
    );
    metric.addEventListener("focus", () => hud?.focus("statistics-metric"), {
      signal: abort.signal,
    });
    metric.addEventListener("blur", () => hud?.focus(), { signal: abort.signal });
    const values = q<HTMLElement>("[data-stat-values]");
    values.addEventListener("focus", () => hud?.focus("statistics-values"), {
      signal: abort.signal,
    });
    values.addEventListener("blur", () => hud?.focus(), { signal: abort.signal });
    values.addEventListener(
      "keydown",
      (event) => {
        if (hud?.statisticsScrollKey(event.code)) {
          event.preventDefault();
          event.stopPropagation();
        }
      },
      { signal: abort.signal },
    );
    statisticControls();
    const speed = q<HTMLSelectElement>("[data-speed]");
    for (const value of REPLAY_SPEEDS) {
      const option = document.createElement("option");
      option.value = String(value);
      option.textContent = `${value}×`;
      speed.append(option);
    }
    speed.addEventListener(
      "change",
      () => void request({ type: "speed", speed: Number(speed.value) }),
      { signal: abort.signal },
    );
    const vision = q<HTMLSelectElement>("[data-vision]");
    for (const value of ["all", ...setup.seats] as const) {
      const option = document.createElement("option");
      option.value = String(value);
      option.textContent =
        value === "all"
          ? text("ui.replays.all")
          : text(value === 1 ? "ui.replays.player" : "ui.replays.bot", { team: value });
      vision.append(option);
    }
    vision.addEventListener(
      "change",
      () =>
        void request({
          type: "vision",
          vision: vision.value === "all" ? "all" : Number(vision.value),
        }),
      { signal: abort.signal },
    );
    q("[data-timeline]").addEventListener(
      "change",
      () => seek(Number(q<HTMLInputElement>("[data-timeline]").value)),
      { signal: abort.signal },
    );
    for (const [selector, id] of [
      ["[data-speed]", "speed"],
      ["[data-vision]", "vision"],
      ["[data-timeline]", "timeline"],
    ] as const) {
      q(selector).addEventListener("focus", () => hud?.focus(id), { signal: abort.signal });
      q(selector).addEventListener("blur", () => hud?.focus(), { signal: abort.signal });
    }
    const world = renderer,
      actors = presentation;
    minimap = createMinimap(
      root,
      canvas,
      {
        terrain: loaded.grid,
        definitions: content.catalog!.definitions,
        force: 0,
        colors: new Map([
          [0, "#d8443a"],
          [1, "#3c93d9"],
        ]),
        selection: () => [],
        pan: ({ x, y }) =>
          world.camera.panTo(
            x * CELL_SIZE,
            y * CELL_SIZE,
            (loaded.grid.level[Math.floor(y) * loaded.grid.width + Math.floor(x)] ?? 0) *
              LEVEL_HEIGHT,
          ),
        zoom: (delta) => world.camera.zoomBy(delta),
        view: () =>
          cameraGroundView(world.camera).map((point) => ({
            x: point.x / CELL_SIZE,
            y: point.z / CELL_SIZE,
          })),
        camera: () => ({
          x: world.camera.target.x / CELL_SIZE,
          y: world.camera.target.z / CELL_SIZE,
        }),
        order: () => {},
        armAttackMove: () => {},
        readOnly: true,
      },
      abort.signal,
    );
    hud = createReplayHud(renderer.scene, canvas, minimap.canvas, {
      seek,
      pan: (x, y) => minimap?.navigate(x, y, 0, false, false),
      zoom: minimap.zoom,
      mapFocus: () => minimap?.canvas.focus({ preventScroll: true }),
      statisticsFocus: () => q<HTMLElement>("[data-stat-values]").focus({ preventScroll: true }),
    });
    eventPan = (x, y) =>
      minimap?.navigate(
        x / 1024 / loaded.grid.width,
        y / 1024 / loaded.grid.height,
        0,
        false,
        false,
      );
    renderer.camera.setPointerBlocker((x, y) => hud?.blocksPointer(x, y) ?? false);
    interaction = bindWorldInteraction(
      canvas,
      renderer.scene,
      presentation,
      art,
      {
        snapshot: () => latest?.snapshot,
        enabled: () => ready && !overlay.open,
        blocksPointer: (x, y) => hud?.blocksPointer(x, y) ?? false,
      },
      abort.signal,
    );
    renderer.scene.onBeforeRenderObservable.add(() => {
      actors.render(clock.now(performance.now()));
      interaction?.frame(performance.now());
      if (minimap?.frame(performance.now())) hud?.frame();
    });
    ready = true;
    epoch = latest.epoch;
    update(latest);
    clearTimeout(timeout);
    root.classList.add("native-replay");
    canvas.dataset.session = "replay";
    canvas.setAttribute("aria-label", text("ui.replays.watch"));
    canvas.tabIndex = 0;
    panel?.dispose();
    panel = undefined;
    overlay.close();
    overlay.remove();
    requestAnimationFrame(() => {
      if (!disposed) canvas.focus({ preventScroll: true });
    });
  }
  semantics.querySelector("button")!.addEventListener("click", back, { signal: abort.signal });
  overlay.addEventListener(
    "cancel",
    (event) => {
      event.preventDefault();
      back();
    },
    { signal: abort.signal },
  );
  window.addEventListener(
    "keydown",
    (event) => {
      if (ready && event.code === "Escape" && !event.defaultPrevented) {
        event.preventDefault();
        back();
        return;
      }
      if (
        !ready ||
        event.defaultPrevented ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        event.repeat ||
        (event.target instanceof HTMLElement && event.target.matches("input,select,button"))
      )
        return;
      const action = (
        {
          Space: "play",
          KeyJ: "backward",
          KeyL: "forward",
          KeyV: "vision",
          Comma: "previous-event",
          Period: "next-event",
          KeyG: "statistics",
          Escape: "exit",
        } as Record<string, string>
      )[event.code];
      if (action) {
        event.preventDefault();
        buttons.get(action)?.click();
      } else if (["BracketLeft", "BracketRight"].includes(event.code)) {
        event.preventDefault();
        cycle(q("[data-speed]"), event.code === "BracketLeft" ? -1 : 1);
      }
    },
    { signal: abort.signal },
  );
  timeout = setTimeout(
    () => failure(new Error("Replay loading timed out. Return to Replays and retry.")),
    60000,
  );
  void initialize().catch((error) => {
    if (!disposed && !failed) failure(error);
  });
  return () => {
    if (disposed) return;
    disposed = true;
    ready = false;
    clearTimeout(timeout);
    abort.abort();
    worker?.dispose();
    panel?.dispose();
    overlay.remove();
    interaction?.dispose();
    hud?.dispose();
    presentation?.dispose();
    art?.dispose();
    renderer?.dispose();
    root.classList.remove("match-shell", "replay-shell", "native-replay");
    for (const key of ["tick", "replayPhase", "vision", "session"]) delete canvas.dataset[key];
    canvas.hidden = true;
  };
}
