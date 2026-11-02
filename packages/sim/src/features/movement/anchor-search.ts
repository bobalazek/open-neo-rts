import { addInt, addString, type Hasher } from "@open-neo-rts/deterministic";
import { AnchorIndex, NearestAnchor, type NearestState } from "./anchor-index";
import type { NavigationGrid } from "./navigation";
import { type Point, SegmentSweep, type SweepState } from "./segment";
import { VisibleAnchor, type VisibleState } from "./visible-anchor";

const Phase = {
  Centre: 0,
  Physical: 1,
  Preferred: 2,
  Visible: 3,
  Fallback: 4,
  Goal: 5,
  Destination: 6,
  Direct: 7,
  Done: 8,
} as const;
const Purpose = { Centre: 0, Physical: 1, Destination: 2, Direct: 3 } as const;

export interface AnchorInput {
  position: Point;
  requested: Point;
  bounded: Point;
  uniform: boolean;
}
export interface AnchorGrid {
  grid: NavigationGrid;
  labels: Uint32Array;
  index: AnchorIndex;
}
export function indexAnchors(grid: NavigationGrid, labels: Uint32Array): AnchorGrid {
  return { grid, labels, index: new AnchorIndex(grid, labels) };
}
export interface AnchorResult {
  start: number;
  goal: number;
  destination: Point;
  direct: boolean;
}
export interface AnchorState {
  phase: number;
  scan: number;
  preferred: number;
  preferredGoal: number;
  goalDistance: number;
  selected: number;
  goal: number;
  candidate: number;
  purpose: number;
  destination: Point;
  direct: boolean;
  sweep: SweepState | null;
  nearest: NearestState | null;
  visible: VisibleState | null;
}

/** Counted SIM7 join selection. One transition, spatial node, or geometry predicate per advance. */
export class AnchorSearch {
  private readonly state: Omit<AnchorState, "sweep" | "nearest" | "visible">;
  private sweep: SegmentSweep | undefined;
  private nearest: NearestAnchor | undefined;
  private visible: VisibleAnchor | undefined;
  private readonly x: number;
  private readonly y: number;
  private readonly containing: number;
  private readonly region: number;
  readonly input: AnchorInput;
  constructor(
    private readonly data: AnchorGrid,
    input: AnchorInput,
  ) {
    this.input = {
      position: { ...input.position },
      requested: { ...input.requested },
      bounded: { ...input.bounded },
      uniform: input.uniform,
    };
    const { grid } = data;
    this.x = Math.min(grid.width - 1, Math.floor(input.position.x / 1024));
    this.y = Math.min(grid.height - 1, Math.floor(input.position.y / 1024));
    this.containing = this.y * grid.width + this.x;
    this.region = grid.physicalRegions[this.containing] ?? 0;
    this.state = {
      phase: Phase.Centre,
      scan: 0,
      preferred: 0,
      preferredGoal: -1,
      goalDistance: Number.MAX_SAFE_INTEGER,
      selected: -1,
      goal: -1,
      candidate: -1,
      purpose: Purpose.Centre,
      destination: { ...input.bounded },
      direct: false,
    };
  }
  private centre(cell: number): Point {
    return {
      x: (cell % this.data.grid.width) * 1024 + 512,
      y: Math.floor(cell / this.data.grid.width) * 1024 + 512,
    };
  }
  private requestedCell(): number {
    const x = Math.floor(this.input.requested.x / 1024),
      y = Math.floor(this.input.requested.y / 1024);
    return x >= 0 && y >= 0 && x < this.data.grid.width && y < this.data.grid.height
      ? y * this.data.grid.width + x
      : -1;
  }
  private distance(cell: number): number {
    const dx = Math.abs((cell % this.data.grid.width) - Math.floor(this.input.requested.x / 1024));
    const dy = Math.abs(
      Math.floor(cell / this.data.grid.width) - Math.floor(this.input.requested.y / 1024),
    );
    return 10 * Math.max(dx, dy) + 4 * Math.min(dx, dy);
  }
  private beginNearest(root: number | undefined): void {
    this.nearest = new NearestAnchor(
      this.data.index,
      Math.floor(this.input.requested.x / 1024),
      Math.floor(this.input.requested.y / 1024),
      root,
    );
  }
  private eligible(cell: number): boolean {
    return !!this.data.labels[cell] && this.data.grid.physicalRegions[cell] === this.region;
  }
  private beginSweep(a: Point, b: Point, purpose: number): void {
    this.state.purpose = purpose;
    this.sweep = new SegmentSweep(this.data.grid, a, b);
  }
  private resolveGoal(): void {
    const s = this.state;
    if (s.goal >= 0) {
      s.phase = Phase.Destination;
      return;
    }
    if (s.preferredGoal >= 0 && this.data.labels[s.selected] === s.preferred) {
      s.goal = s.preferredGoal;
      s.phase = Phase.Destination;
      return;
    }
    this.state.phase = Phase.Goal;
    this.state.scan = 0;
    this.state.goalDistance = Number.MAX_SAFE_INTEGER;
  }
  private acceptSweep(): void {
    const s = this.state,
      clear = this.sweep?.result === "clear";
    this.sweep = undefined;
    if (s.purpose === Purpose.Centre) {
      if (clear) {
        s.selected = this.containing;
        this.resolveGoal();
      } else s.phase = Phase.Physical;
    } else if (s.purpose === Purpose.Physical) {
      if (!clear) {
        s.phase = Phase.Done;
        return;
      }
      if (
        this.input.position.x === this.input.bounded.x &&
        this.input.position.y === this.input.bounded.y
      ) {
        s.selected = this.containing;
        s.goal = this.containing;
        s.direct = true;
        s.phase = Phase.Done;
        return;
      }
      s.phase = Phase.Preferred;
      s.scan = 0;
      const goal = this.requestedCell();
      if (goal >= 0 && this.eligible(goal)) {
        s.preferred = this.data.labels[goal] as number;
        s.preferredGoal = goal;
        s.phase = Phase.Visible;
      }
    } else if (s.purpose === Purpose.Destination) {
      if (clear) s.destination = { ...this.input.bounded };
      s.phase = Phase.Direct;
    } else if (s.purpose === Purpose.Direct) {
      s.direct = clear;
      s.phase = Phase.Done;
    }
  }
  advance(): void {
    const s = this.state,
      { grid, labels } = this.data;
    if (this.finished) return;
    if (this.visible) {
      this.visible.advance();
      if (!this.visible.finished) return;
      const cell = this.visible.result;
      this.visible = undefined;
      if (s.phase === Phase.Visible) {
        if (cell >= 0) {
          s.selected = cell;
          this.resolveGoal();
        } else {
          s.phase = Phase.Fallback;
          s.scan = 0;
          s.goalDistance = Number.MAX_SAFE_INTEGER;
        }
      } else if (cell >= 0) {
        s.candidate = cell;
        this.beginNearest(this.data.index.components.get(labels[cell] as number));
      }
      return;
    }
    if (this.nearest) {
      this.nearest.advance();
      if (!this.nearest.finished) return;
      const cell = this.nearest.result;
      this.nearest = undefined;
      if (s.phase === Phase.Preferred) {
        if (cell < 0) s.phase = Phase.Done;
        else {
          s.preferred = labels[cell] as number;
          s.preferredGoal = cell;
          s.phase = Phase.Visible;
        }
      } else if (s.phase === Phase.Goal) {
        s.goal = cell;
        s.phase = cell < 0 ? Phase.Done : Phase.Destination;
      } else if (cell >= 0) {
        const d = this.distance(cell);
        if (d < s.goalDistance || (d === s.goalDistance && cell < s.goal)) {
          s.selected = s.candidate;
          s.goal = cell;
          s.goalDistance = d;
        }
      }
      return;
    }
    if (this.sweep) {
      this.sweep.advance();
      if (this.sweep.result !== "searching") this.acceptSweep();
      return;
    }
    if (s.phase === Phase.Centre) {
      if (labels[this.containing]) {
        const p = this.centre(this.containing);
        if (p.x === this.input.position.x && p.y === this.input.position.y) {
          s.selected = this.containing;
          this.resolveGoal();
        } else this.beginSweep(this.input.position, p, Purpose.Centre);
      } else s.phase = Phase.Physical;
    } else if (s.phase === Phase.Physical)
      this.beginSweep(this.input.position, this.input.position, Purpose.Physical);
    else if (s.phase === Phase.Preferred) {
      this.beginNearest(this.data.index.regions.get(this.region));
    } else if (s.phase === Phase.Visible) {
      this.visible = new VisibleAnchor(
        grid,
        this.data.index,
        this.input.position,
        this.data.index.components.get(s.preferred),
      );
    } else if (s.phase === Phase.Fallback) {
      const components = this.data.index.regionComponents.get(this.region) ?? [];
      if (s.scan === components.length) {
        if (s.selected < 0) s.phase = Phase.Done;
        else this.resolveGoal();
        return;
      }
      const component = components[s.scan++] as number;
      if (component === s.preferred) return;
      this.visible = new VisibleAnchor(
        grid,
        this.data.index,
        this.input.position,
        this.data.index.components.get(component),
      );
    } else if (s.phase === Phase.Goal) {
      const requested = this.requestedCell();
      if (s.scan === 0 && requested >= 0 && labels[requested] === labels[s.selected]) {
        s.goal = requested;
        s.phase = Phase.Destination;
        return;
      }
      this.beginNearest(this.data.index.components.get(labels[s.selected] as number));
    } else if (s.phase === Phase.Destination) {
      s.destination = this.centre(s.goal);
      const boundedCell =
        Math.floor(this.input.bounded.y / 1024) * grid.width +
        Math.floor(this.input.bounded.x / 1024);
      if (s.goal === boundedCell) {
        if (s.destination.x === this.input.bounded.x && s.destination.y === this.input.bounded.y) {
          s.destination = { ...this.input.bounded };
          s.phase = Phase.Direct;
        } else this.beginSweep(s.destination, this.input.bounded, Purpose.Destination);
      } else s.phase = Phase.Direct;
    } else if (s.phase === Phase.Direct) {
      if (this.input.uniform) this.beginSweep(this.input.position, s.destination, Purpose.Direct);
      else s.phase = Phase.Done;
    }
  }
  get finished(): boolean {
    return this.state.phase === Phase.Done;
  }
  result(): AnchorResult | undefined {
    const s = this.state;
    return this.finished && s.selected >= 0 && s.goal >= 0
      ? { start: s.selected, goal: s.goal, destination: { ...s.destination }, direct: s.direct }
      : undefined;
  }
  snapshot(): AnchorState {
    return {
      ...this.state,
      destination: { ...this.state.destination },
      sweep: this.sweep?.snapshot() ?? null,
      nearest: this.nearest?.snapshot() ?? null,
      visible: this.visible?.snapshot() ?? null,
    };
  }
  hashInto(h: Hasher): void {
    const s = this.state;
    for (const n of [
      s.phase,
      s.scan,
      s.preferred,
      s.preferredGoal,
      s.goalDistance,
      s.selected,
      s.goal,
      s.candidate,
      s.purpose,
      s.destination.x,
      s.destination.y,
      s.direct ? 1 : 0,
    ])
      addInt(h, n);
    const sweep = this.sweep?.snapshot();
    addInt(h, sweep ? 1 : 0);
    if (sweep) {
      for (const n of [sweep.a.x, sweep.a.y, sweep.b.x, sweep.b.y, sweep.cursor, sweep.blocker])
        addInt(h, n);
      addString(h, sweep.status);
      addInt(h, sweep.stack.length);
      for (const n of sweep.stack) addInt(h, n);
    }
    const nearest = this.nearest?.snapshot();
    addInt(h, nearest ? 1 : 0);
    if (nearest) {
      for (const n of [nearest.best, nearest.distance, nearest.visits, nearest.stack.length])
        addInt(h, n);
      for (const n of nearest.stack) addInt(h, n);
    }
    addInt(h, this.visible ? 1 : 0);
    this.visible?.hashInto(h);
  }
  static restore(data: AnchorGrid, input: AnchorInput, state: AnchorState): AnchorSearch {
    const search = new AnchorSearch(data, input),
      cells = data.labels.length;
    const ints = [
      state.phase,
      state.scan,
      state.preferred,
      state.preferredGoal,
      state.goalDistance,
      state.selected,
      state.goal,
      state.candidate,
      state.purpose,
      state.destination.x,
      state.destination.y,
    ];
    if (
      !ints.every(Number.isSafeInteger) ||
      state.phase < 0 ||
      state.phase > 8 ||
      state.scan < 0 ||
      state.scan > cells ||
      state.purpose < 0 ||
      state.purpose > 3 ||
      state.preferred < 0 ||
      state.preferred > cells ||
      state.goalDistance < 0 ||
      typeof state.direct !== "boolean"
    )
      throw new RangeError("Invalid anchor continuation");
    for (const cell of [state.selected, state.goal, state.candidate, state.preferredGoal])
      if (cell < -1 || cell >= cells) throw new RangeError("Invalid anchor cell");
    const { sweep, nearest, visible, ...rest } = state;
    Object.assign(search.state, rest, { destination: { ...state.destination } });
    if (sweep) {
      const phaseForPurpose = [Phase.Centre, Phase.Physical, Phase.Destination, Phase.Direct][
        state.purpose
      ];
      const expectedA =
        state.purpose === Purpose.Destination ? search.centre(state.goal) : input.position;
      const expectedB =
        state.purpose === Purpose.Centre
          ? search.centre(search.containing)
          : state.purpose === Purpose.Physical
            ? input.position
            : state.purpose === Purpose.Destination
              ? input.bounded
              : state.destination;
      if (
        state.phase !== phaseForPurpose ||
        (state.purpose === Purpose.Destination && state.goal < 0) ||
        sweep.a.x !== expectedA.x ||
        sweep.a.y !== expectedA.y ||
        sweep.b.x !== expectedB.x ||
        sweep.b.y !== expectedB.y
      )
        throw new RangeError("Sweep does not match anchor phase");
      search.sweep = SegmentSweep.restore(data.grid, sweep);
    }
    if (nearest) {
      if (
        ![Phase.Preferred, Phase.Goal, Phase.Fallback].includes(state.phase as 2 | 4 | 5) ||
        sweep
      )
        throw new RangeError("Nearest query does not match anchor phase");
      search.nearest = NearestAnchor.restore(
        data.index,
        Math.floor(input.requested.x / 1024),
        Math.floor(input.requested.y / 1024),
        state.phase === Phase.Preferred
          ? data.index.regions.get(search.region)
          : data.index.components.get(
              data.labels[state.phase === Phase.Goal ? state.selected : state.candidate] as number,
            ),
        nearest,
      );
    }
    if (visible) {
      if (sweep || nearest || (state.phase !== Phase.Visible && state.phase !== Phase.Fallback))
        throw new RangeError("Visible query does not match anchor phase");
      const component =
        state.phase === Phase.Visible
          ? state.preferred
          : data.index.regionComponents.get(search.region)?.[state.scan - 1];
      search.visible = VisibleAnchor.restore(
        data.grid,
        data.index,
        input.position,
        data.index.components.get(component as number),
        visible,
      );
    }
    if (
      state.phase === Phase.Fallback &&
      state.scan > (data.index.regionComponents.get(search.region)?.length ?? 0)
    )
      throw new RangeError("Invalid fallback cursor");
    return search;
  }
}
