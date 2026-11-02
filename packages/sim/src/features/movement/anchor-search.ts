import { addInt, addString, type Hasher } from "@open-neo-rts/deterministic";
import type { NavigationGrid } from "./navigation";
import { clearSegment, type Point, SegmentSweep, type SweepState } from "./segment";

const Phase = {
  Centre: 0,
  Physical: 1,
  Preferred: 2,
  Rings: 3,
  Fallback: 4,
  Goal: 5,
  Destination: 6,
  Direct: 7,
  Done: 8,
} as const;
const Purpose = { Centre: 0, Physical: 1, Candidate: 2, Destination: 3, Direct: 4 } as const;

export interface AnchorInput {
  position: Point;
  requested: Point;
  bounded: Point;
  uniform: boolean;
}
export interface AnchorGrid {
  grid: NavigationGrid;
  labels: Uint32Array;
}
export interface AnchorResult {
  start: number;
  goal: number;
  destination: Point;
  direct: boolean;
}
interface Best {
  component: number;
  cell: number;
  distance: number;
}
export interface AnchorState {
  phase: number;
  scan: number;
  ring: number;
  offset: number;
  preferred: number;
  preferredGoal: number;
  goalDistance: number;
  selected: number;
  goal: number;
  candidate: number;
  purpose: number;
  destination: Point;
  direct: boolean;
  anchors: Best[];
  sweep: SweepState | null;
}

/** Counted SIM7 join selection. Each advance visits one cell, transition, or barrier. */
export class AnchorSearch {
  private readonly state: Omit<AnchorState, "anchors" | "sweep">;
  private readonly anchors = new Map<number, Best>();
  private sweep: SegmentSweep | undefined;
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
      ring: 0,
      offset: 0,
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
        s.phase = Phase.Rings;
      }
    } else if (s.purpose === Purpose.Candidate) {
      if (clear) {
        const p = this.centre(s.candidate),
          distance = (p.x - this.input.position.x) ** 2 + (p.y - this.input.position.y) ** 2;
        const component = this.data.labels[s.candidate] as number;
        this.anchors.set(component, { component, cell: s.candidate, distance });
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
      if (s.scan === labels.length) {
        s.phase = s.preferred ? Phase.Rings : Phase.Done;
        return;
      }
      const cell = s.scan++;
      if (!this.eligible(cell)) return;
      const d = this.distance(cell);
      if (d < s.goalDistance) {
        s.goalDistance = d;
        s.preferred = labels[cell] as number;
        s.preferredGoal = cell;
      }
    } else if (s.phase === Phase.Rings) {
      const limit = Math.max(this.x, this.y, grid.width - 1 - this.x, grid.height - 1 - this.y),
        count = s.ring ? 8 * s.ring : 1;
      if (s.offset === count) {
        const best = this.anchors.get(s.preferred);
        if (best && best.distance < (s.ring * 1024 + 512) ** 2) {
          s.selected = best.cell;
          this.resolveGoal();
          return;
        }
        if (s.ring === limit) {
          s.phase = Phase.Fallback;
          s.scan = 0;
          s.goalDistance = Number.MAX_SAFE_INTEGER;
          return;
        }
        s.ring++;
        s.offset = 0;
        return;
      }
      const r = s.ring,
        n = s.offset++,
        row = 2 * r + 1;
      let x = this.x,
        y = this.y;
      if (r) {
        if (n < row) {
          x = this.x - r + n;
          y = this.y - r;
        } else if (n < row + 2 * (2 * r - 1)) {
          const i = n - row;
          x = this.x + (i % 2 ? r : -r);
          y = this.y - r + 1 + Math.floor(i / 2);
        } else {
          x = this.x - r + n - row - 2 * (2 * r - 1);
          y = this.y + r;
        }
      }
      if (x < 0 || y < 0 || x >= grid.width || y >= grid.height) return;
      const cell = y * grid.width + x;
      if (cell === this.containing || !this.eligible(cell)) return;
      const p = this.centre(cell),
        distance = (p.x - this.input.position.x) ** 2 + (p.y - this.input.position.y) ** 2;
      const old = this.anchors.get(labels[cell] as number);
      if (old && (distance > old.distance || (distance === old.distance && cell > old.cell)))
        return;
      s.candidate = cell;
      this.beginSweep(this.input.position, p, Purpose.Candidate);
    } else if (s.phase === Phase.Fallback) {
      if (s.scan === labels.length) {
        if (s.selected < 0) s.phase = Phase.Done;
        else this.resolveGoal();
        return;
      }
      const cell = s.scan++,
        anchor = this.anchors.get(labels[cell] as number);
      if (!anchor) return;
      const d = this.distance(cell);
      if (d < s.goalDistance) {
        s.selected = anchor.cell;
        s.goal = cell;
        s.goalDistance = d;
      }
    } else if (s.phase === Phase.Goal) {
      const requested = this.requestedCell();
      if (s.scan === 0 && requested >= 0 && labels[requested] === labels[s.selected]) {
        s.goal = requested;
        s.phase = Phase.Destination;
        return;
      }
      if (s.scan === labels.length) {
        s.phase = s.goal < 0 ? Phase.Done : Phase.Destination;
        return;
      }
      const cell = s.scan++;
      if (labels[cell] !== labels[s.selected]) return;
      const d = this.distance(cell);
      if (d < s.goalDistance) {
        s.goal = cell;
        s.goalDistance = d;
      }
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
      anchors: [...this.anchors.values()]
        .sort((a, b) => a.component - b.component)
        .map((a) => ({ ...a })),
      sweep: this.sweep?.snapshot() ?? null,
    };
  }
  hashInto(h: Hasher): void {
    const s = this.state;
    for (const n of [
      s.phase,
      s.scan,
      s.ring,
      s.offset,
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
    addInt(h, this.anchors.size);
    for (const a of [...this.anchors.values()].sort((a, b) => a.component - b.component))
      for (const n of [a.component, a.cell, a.distance]) addInt(h, n);
    const sweep = this.sweep?.snapshot();
    addInt(h, sweep ? 1 : 0);
    if (sweep) {
      for (const n of [sweep.a.x, sweep.a.y, sweep.b.x, sweep.b.y, sweep.cursor]) addInt(h, n);
      addString(h, sweep.status);
    }
  }
  static restore(data: AnchorGrid, input: AnchorInput, state: AnchorState): AnchorSearch {
    const search = new AnchorSearch(data, input),
      cells = data.labels.length;
    const ints = [
      state.phase,
      state.scan,
      state.ring,
      state.offset,
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
      state.ring < 0 ||
      state.ring > Math.max(data.grid.width, data.grid.height) ||
      state.offset < 0 ||
      state.offset > Math.max(1, 8 * state.ring) ||
      state.purpose < 0 ||
      state.purpose > 4 ||
      state.preferred < 0 ||
      state.preferred > cells ||
      state.goalDistance < 0 ||
      typeof state.direct !== "boolean"
    )
      throw new RangeError("Invalid anchor continuation");
    for (const cell of [state.selected, state.goal, state.candidate, state.preferredGoal])
      if (cell < -1 || cell >= cells) throw new RangeError("Invalid anchor cell");
    let previous = 0;
    for (const best of state.anchors) {
      if (
        !Number.isInteger(best.component) ||
        best.component <= previous ||
        best.cell < 0 ||
        best.cell >= cells ||
        data.labels[best.cell] !== best.component
      )
        throw new RangeError("Invalid anchor candidate");
      const p = search.centre(best.cell),
        distance = (p.x - input.position.x) ** 2 + (p.y - input.position.y) ** 2;
      if (best.distance !== distance || !clearSegment(data.grid, input.position, p))
        throw new RangeError("Invalid visible anchor");
      search.anchors.set(best.component, { ...best });
      previous = best.component;
    }
    const { anchors: _, sweep, ...rest } = state;
    Object.assign(search.state, rest, { destination: { ...state.destination } });
    if (sweep) {
      const phaseForPurpose = [
        Phase.Centre,
        Phase.Physical,
        Phase.Rings,
        Phase.Destination,
        Phase.Direct,
      ][state.purpose];
      const expectedA =
        state.purpose === Purpose.Destination ? search.centre(state.goal) : input.position;
      const expectedB =
        state.purpose === Purpose.Centre
          ? search.centre(search.containing)
          : state.purpose === Purpose.Physical
            ? input.position
            : state.purpose === Purpose.Candidate
              ? search.centre(state.candidate)
              : state.purpose === Purpose.Destination
                ? input.bounded
                : state.destination;
      if (
        state.phase !== phaseForPurpose ||
        (state.purpose === Purpose.Candidate && state.candidate < 0) ||
        (state.purpose === Purpose.Destination && state.goal < 0) ||
        sweep.a.x !== expectedA.x ||
        sweep.a.y !== expectedA.y ||
        sweep.b.x !== expectedB.x ||
        sweep.b.y !== expectedB.y
      )
        throw new RangeError("Sweep does not match anchor phase");
      search.sweep = SegmentSweep.restore(data.grid, sweep);
    }
    return search;
  }
}
