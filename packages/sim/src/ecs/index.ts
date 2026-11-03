// Our ECS: stable entity IDs, integer typed-array component storage, queries, isolated worlds, versioned serialization.

/** Field types and their typed arrays: the only arrays numerics.md allows in sim state. */
const TYPES = {
  i32: { array: Int32Array, min: -0x80000000, max: 0x7fffffff, bytes: 4 },
  u32: { array: Uint32Array, min: 0, max: 0xffffffff, bytes: 4 },
  u16: { array: Uint16Array, min: 0, max: 0xffff, bytes: 2 },
  u8: { array: Uint8Array, min: 0, max: 0xff, bytes: 1 },
} as const;

export type FieldType = keyof typeof TYPES;
export type Fields = Record<string, FieldType>;

/** A component type: a name and integer fields in declaration order. Shared, frozen data; storage lives in each World. */
export interface Component<F extends Fields = Fields> {
  readonly name: string;
  readonly fields: F;
}

/** Version of the `World.serialize` byte layout. Component schemas are embedded and checked on load separately. */
export const ECS_FORMAT_VERSION = 1;

const IDENTIFIER = /^[A-Za-z][A-Za-z0-9]*$/;
const MAX_ID = 0xfffffffe; // so `nextId` still fits in a u32

export function defineComponent<F extends Fields>(name: string, fields: F): Component<F> {
  return Object.freeze({ name, fields: Object.freeze({ ...fields }) });
}

interface Column {
  readonly name: string; // `Component.field`, for errors
  readonly type: FieldType;
  data: Int32Array | Uint32Array | Uint16Array | Uint8Array;
}

interface Storage {
  readonly component: Component;
  has: Uint8Array; // per slot: 1 if the entity there has the component
  readonly columns: Map<string, Column>; // field → column, in declaration order
}

/** One match's, test's or replay's entities and components. Worlds share no state. */
export class World {
  private nextId = 1;
  /** Live IDs, ascending: a new ID is always the largest, and loads arrive sorted. */
  private readonly alive: number[] = [];
  /** Entity ID → storage slot. Slots are recycled and never leave the world; IDs are never reused. */
  private readonly slots = new Map<number, number>();
  private readonly freeSlots: number[] = [];
  private usedSlots = 0;
  private capacity = 64;
  private readonly storages = new Map<string, Storage>();

  /** Adds a component type. Registering the same definition again is a no-op. */
  register(component: Component): void {
    const existing = this.storages.get(component.name);
    if (existing) {
      if (existing.component !== component)
        throw new Error(`A different component named ${component.name} is already registered`);
      return;
    }
    for (const name of [component.name, ...Object.keys(component.fields)])
      if (!IDENTIFIER.test(name))
        throw new Error(`Component and field names must be ASCII identifiers, got "${name}"`);
    const columns = new Map<string, Column>();
    for (const [field, type] of Object.entries(component.fields))
      columns.set(field, {
        name: `${component.name}.${field}`,
        type,
        data: new TYPES[type].array(this.capacity),
      });
    this.storages.set(component.name, { component, has: new Uint8Array(this.capacity), columns });
  }

  /** A new entity. IDs start at 1 (0 can mean "none" in fields) and are never reused in this world. */
  create(): number {
    if (this.nextId > MAX_ID) throw new RangeError("Entity IDs exhausted");
    const id = this.nextId++;
    this.spawn(id);
    return id;
  }

  /** Removes the entity and its components. The ID stays retired. */
  destroy(id: number): void {
    const slot = this.slot(id);
    for (const storage of this.storages.values()) storage.has[slot] = 0;
    this.slots.delete(id);
    // ponytail: O(live entities) per destroy; index or batch removals if mass deaths show up in profiles.
    this.alive.splice(this.alive.indexOf(id), 1);
    this.freeSlots.push(slot);
  }

  isAlive(id: number): boolean {
    return this.slots.has(id);
  }

  /** Attaches a component with every field zeroed, then applies `values`. */
  add<F extends Fields>(
    id: number,
    component: Component<F>,
    values: Partial<Record<keyof F & string, number>> = {},
  ): void {
    const storage = this.storage(component);
    const slot = this.slot(id);
    if (storage.has[slot]) throw new Error(`Entity ${id} already has ${component.name}`);
    for (const column of storage.columns.values()) column.data[slot] = 0;
    for (const [field, value] of Object.entries(values))
      if (value !== undefined) write(this.column(storage, field), slot, value);
    storage.has[slot] = 1; // last, so a rejected value leaves the entity without the component
  }

  remove(id: number, component: Component): void {
    this.storage(component).has[this.slot(id)] = 0;
  }

  has(id: number, component: Component): boolean {
    return this.storage(component).has[this.slot(id)] === 1;
  }

  get<F extends Fields>(id: number, component: Component<F>, field: keyof F & string): number {
    const storage = this.storage(component);
    return this.column(storage, field).data[this.slotWith(id, storage)] ?? 0;
  }

  /** Throws unless `value` is an integer in the field type's range. */
  set<F extends Fields>(
    id: number,
    component: Component<F>,
    field: keyof F & string,
    value: number,
  ): void {
    const storage = this.storage(component);
    write(this.column(storage, field), this.slotWith(id, storage), value);
  }

  /**
   * IDs of live entities having every given component (all live entities if none), ascending.
   * Returns a copy, so systems may change the world while iterating; check `isAlive` after destroys.
   */
  query(...components: Component[]): number[] {
    const has = components.map((component) => this.storage(component).has);
    // ponytail: scans every live entity; keep sorted per-component ID lists if profiling shows it.
    return this.alive.filter((id) => {
      const slot = this.slots.get(id) ?? 0;
      return has.every((h) => h[slot] === 1);
    });
  }

  /**
   * Canonical little-endian bytes, independent of slot layout and of history beyond IDs and values:
   * u32 version, u32 nextId, u32 length + ASCII schema, u32 count + ascending IDs, then per component
   * in name order: u32 count + rows of (u32 id, each field at its own width).
   */
  serialize(): Uint8Array {
    const out: number[] = [];
    const schema = this.schema();
    put(out, ECS_FORMAT_VERSION, 4);
    put(out, this.nextId, 4);
    put(out, schema.length, 4);
    for (let i = 0; i < schema.length; i++) out.push(schema.charCodeAt(i));
    put(out, this.alive.length, 4);
    for (const id of this.alive) put(out, id, 4);
    for (const storage of this.sortedStorages()) {
      const ids = this.query(storage.component);
      put(out, ids.length, 4);
      for (const id of ids) {
        const slot = this.slot(id);
        put(out, id, 4);
        for (const column of storage.columns.values())
          put(out, column.data[slot] ?? 0, TYPES[column.type].bytes);
      }
    }
    return new Uint8Array(out);
  }

  /** Loads `serialize` output into this fresh world, with the same components registered. On error, discard the world. */
  load(bytes: Uint8Array, maxEntities = MAX_ID): void {
    if (this.nextId !== 1 || this.alive.length > 0) throw new Error("Load into a fresh world");
    if (!Number.isInteger(maxEntities) || maxEntities < 0 || maxEntities > MAX_ID)
      throw new RangeError("Invalid ECS snapshot entity limit");
    let offset = 0;
    const take = (n: number): number => {
      if (offset + n > bytes.length) throw new Error("ECS snapshot is truncated");
      let value = 0;
      for (let b = n - 1; b >= 0; b--) value = value * 256 + (bytes[offset + b] ?? 0);
      offset += n;
      return value;
    };
    const version = take(4);
    if (version !== ECS_FORMAT_VERSION)
      throw new Error(
        `ECS snapshot format version ${version} is not supported; this build reads version ${ECS_FORMAT_VERSION}`,
      );
    const nextId = take(4);
    if (nextId < 1) throw new Error("Invalid ECS snapshot nextId");
    let schema = "";
    for (let i = take(4); i > 0; i--) schema += String.fromCharCode(take(1));
    if (schema !== this.schema())
      throw new Error(
        `ECS snapshot components "${schema}" do not match the world's "${this.schema()}"`,
      );
    let previous = 0;
    const entityCount = take(4);
    if (entityCount > maxEntities) throw new Error("ECS snapshot exceeds entity limit");
    for (let i = entityCount; i > 0; i--) {
      const id = take(4);
      if (id <= previous || id >= nextId)
        throw new Error(`ECS snapshot entity ${id} is out of order or not below nextId ${nextId}`);
      this.spawn(id);
      previous = id;
    }
    this.nextId = nextId;
    for (const storage of this.sortedStorages()) {
      previous = 0;
      const rows = take(4);
      if (rows > entityCount) throw new Error("ECS snapshot exceeds component row limit");
      for (let i = rows; i > 0; i--) {
        const id = take(4);
        if (id <= previous || !this.slots.has(id))
          throw new Error(`ECS snapshot ${storage.component.name} row for entity ${id} is invalid`);
        const slot = this.slot(id);
        storage.has[slot] = 1;
        for (const column of storage.columns.values())
          column.data[slot] = take(TYPES[column.type].bytes); // i32 wraps back to signed
        previous = id;
      }
    }
    if (offset !== bytes.length) throw new Error("ECS snapshot has trailing bytes");
  }

  /** Isolated candidate hosts only: retain registered layouts/owner references, replace all rows. On error discard the host. */
  replace(bytes: Uint8Array, maxEntities: number): void {
    this.nextId = 1;
    this.alive.length = this.freeSlots.length = 0;
    this.slots.clear();
    this.usedSlots = 0;
    for (const storage of this.storages.values()) {
      storage.has.fill(0);
      for (const column of storage.columns.values()) column.data.fill(0);
    }
    this.load(bytes, maxEntities);
  }

  private spawn(id: number): void {
    let slot = this.freeSlots.pop();
    if (slot === undefined) {
      if (this.usedSlots === this.capacity) this.grow();
      slot = this.usedSlots++;
    }
    this.slots.set(id, slot);
    this.alive.push(id);
  }

  private grow(): void {
    this.capacity *= 2;
    for (const storage of this.storages.values()) {
      const has = new Uint8Array(this.capacity);
      has.set(storage.has);
      storage.has = has;
      for (const column of storage.columns.values()) {
        const data = new TYPES[column.type].array(this.capacity);
        data.set(column.data);
        column.data = data;
      }
    }
  }

  private sortedStorages(): Storage[] {
    // Default sort compares UTF-16 code units: engine-independent.
    return [...this.storages.keys()].sort().map((name) => this.storages.get(name) as Storage);
  }

  /** E.g. `Health{hp:u16,armor:u8};Position{x:i32,y:i32}`. */
  private schema(): string {
    return this.sortedStorages()
      .map(({ component }) => {
        const fields = Object.entries(component.fields).map(([field, type]) => `${field}:${type}`);
        return `${component.name}{${fields.join(",")}}`;
      })
      .join(";");
  }

  private storage(component: Component): Storage {
    const storage = this.storages.get(component.name);
    if (storage?.component !== component)
      throw new Error(`Component ${component.name} is not registered in this world`);
    return storage;
  }

  private slot(id: number): number {
    const slot = this.slots.get(id);
    if (slot === undefined) throw new Error(`Entity ${id} is not alive`);
    return slot;
  }

  private slotWith(id: number, storage: Storage): number {
    const slot = this.slot(id);
    if (storage.has[slot] !== 1) throw new Error(`Entity ${id} has no ${storage.component.name}`);
    return slot;
  }

  private column(storage: Storage, field: string): Column {
    const column = storage.columns.get(field);
    if (!column) throw new Error(`${storage.component.name} has no field ${field}`);
    return column;
  }
}

function write(column: Column, slot: number, value: number): void {
  const { min, max } = TYPES[column.type];
  if (!Number.isInteger(value) || value < min || value > max)
    throw new RangeError(`${column.name} must be a ${column.type} integer, got ${value}`);
  column.data[slot] = value;
}

/** Appends `value` as `bytes` little-endian bytes; `>>>` gives two's complement for negative i32. */
function put(out: number[], value: number, bytes: number): void {
  for (let b = 0; b < bytes; b++) out.push((value >>> (8 * b)) & 0xff);
}
