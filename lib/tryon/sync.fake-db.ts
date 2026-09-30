/**
 * In-memory stand-in for the slice of the MongoDB `Db` API that the try-on
 * sync, completion and setup-resolution tests exercise. Test-only: no app
 * code imports it.
 *
 * WHAT: Collections are plain arrays keyed by name. find/findOne/updateOne/
 *     insertOne run a small filter matcher (equality on dotted paths, null
 *     matching a missing field, array membership, ObjectId matching its hex
 *     string, $in, $ne, $exists, $type 'string', $or, $and) and support sort,
 *     limit and inclusion projections. Every read and every write call is
 *     recorded.
 * WHY: What these tests check is which documents a code path reads and that a
 *     read-only path writes nothing. A chain of hand-written find().sort()
 *     stubs cannot show either; a fake that filters for real can. An
 *     unsupported operator throws instead of silently matching.
 */

import { ObjectId, type Db } from 'mongodb';

type FakeDoc = Record<string, unknown>;
type SortSpec = Record<string, 1 | -1>;
type Projection = Record<string, 0 | 1>;

export interface FakeRead {
  collection: string;
  op: 'find' | 'findOne';
  filter: FakeDoc;
}

export interface FakeWrite {
  collection: string;
  op: 'updateOne' | 'insertOne';
  filter?: FakeDoc;
  update?: FakeDoc;
  doc?: FakeDoc;
  upsert?: boolean;
}

function getPath(doc: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((value, key) => {
    if (value === null || value === undefined || typeof value !== 'object') return undefined;
    return (value as FakeDoc)[key];
  }, doc);
}

function setPath(doc: FakeDoc, path: string, value: unknown): void {
  const keys = path.split('.');
  let target = doc;
  for (const key of keys.slice(0, -1)) {
    if (typeof target[key] !== 'object' || target[key] === null) target[key] = {};
    target = target[key] as FakeDoc;
  }
  target[keys[keys.length - 1]] = value;
}

// ObjectIds compare by value, as in Mongo. Seed documents store ids as hex
// strings (structuredClone would strip an ObjectId's prototype), so a filter
// on `new ObjectId(hex)` still finds them.
function comparable(value: unknown): unknown {
  return value instanceof ObjectId ? value.toHexString() : value;
}

function equalsValue(value: unknown, expected: unknown): boolean {
  if (expected === null) return value === null || value === undefined;
  if (Array.isArray(value)) return value.some((item) => equalsValue(item, expected));
  return comparable(value) === comparable(expected);
}

function isOperatorObject(value: unknown): value is FakeDoc {
  return typeof value === 'object'
    && value !== null
    && !Array.isArray(value)
    && Object.keys(value).some((key) => key.startsWith('$'));
}

function matchesCondition(value: unknown, condition: unknown): boolean {
  if (!isOperatorObject(condition)) return equalsValue(value, condition);
  return Object.entries(condition).every(([operator, argument]) => {
    switch (operator) {
      case '$in':
        return (argument as unknown[]).some((candidate) => equalsValue(value, candidate));
      case '$ne':
        return !equalsValue(value, argument);
      case '$exists':
        return argument ? value !== undefined : value === undefined;
      case '$type':
        if (argument === 'string') return typeof value === 'string';
        throw new Error(`fake db: unsupported $type ${String(argument)}`);
      default:
        throw new Error(`fake db: unsupported operator ${operator}`);
    }
  });
}

export function matchesFilter(doc: FakeDoc, filter: FakeDoc): boolean {
  return Object.entries(filter).every(([key, condition]) => {
    if (key === '$or') return (condition as FakeDoc[]).some((clause) => matchesFilter(doc, clause));
    if (key === '$and') return (condition as FakeDoc[]).every((clause) => matchesFilter(doc, clause));
    if (key.startsWith('$')) throw new Error(`fake db: unsupported top-level operator ${key}`);
    return matchesCondition(getPath(doc, key), condition);
  });
}

function compareValues(left: unknown, right: unknown): number {
  if (left === right) return 0;
  if (left === undefined || left === null) return -1;
  if (right === undefined || right === null) return 1;
  return (left as string | number) < (right as string | number) ? -1 : 1;
}

function sortDocs(docs: FakeDoc[], spec: SortSpec | undefined): FakeDoc[] {
  if (!spec) return docs;
  const entries = Object.entries(spec);
  return [...docs].sort((a, b) => {
    for (const [path, direction] of entries) {
      const order = compareValues(getPath(a, path), getPath(b, path));
      if (order !== 0) return order * direction;
    }
    return 0;
  });
}

function project(doc: FakeDoc, projection: Projection | undefined): FakeDoc {
  const copy = structuredClone(doc);
  if (!projection) return copy;
  const included = Object.entries(projection).filter(([, flag]) => flag === 1).map(([path]) => path);
  if (included.length === 0) {
    if (projection._id === 0) delete copy._id;
    return copy;
  }
  const out: FakeDoc = {};
  if (projection._id !== 0 && copy._id !== undefined) out._id = copy._id;
  for (const path of included) {
    const value = getPath(copy, path);
    if (value !== undefined) setPath(out, path, value);
  }
  return out;
}

function applyUpdate(doc: FakeDoc, update: FakeDoc, inserting: boolean): void {
  for (const [operator, fields] of Object.entries(update)) {
    if (operator === '$setOnInsert' && !inserting) continue;
    if (operator !== '$set' && operator !== '$setOnInsert') {
      throw new Error(`fake db: unsupported update operator ${operator}`);
    }
    for (const [path, value] of Object.entries(fields as FakeDoc)) {
      setPath(doc, path, structuredClone(value));
    }
  }
}

export function createFakeDb(seed: Record<string, FakeDoc[]> = {}) {
  const data = new Map<string, FakeDoc[]>();
  for (const [name, docs] of Object.entries(seed)) {
    data.set(name, docs.map((doc) => structuredClone(doc)));
  }
  const reads: FakeRead[] = [];
  const writes: FakeWrite[] = [];
  let nextId = 1;

  function docsOf(name: string): FakeDoc[] {
    if (!data.has(name)) data.set(name, []);
    return data.get(name) as FakeDoc[];
  }

  function collection(name: string) {
    function runFind(filter: FakeDoc, options: { projection?: Projection; sort?: SortSpec } = {}) {
      let sortSpec = options.sort;
      let limitCount: number | undefined;
      const cursor = {
        sort(spec: SortSpec) {
          sortSpec = spec;
          return cursor;
        },
        limit(count: number) {
          limitCount = count;
          return cursor;
        },
        async toArray() {
          const matched = sortDocs(docsOf(name).filter((doc) => matchesFilter(doc, filter)), sortSpec);
          const limited = limitCount && limitCount > 0 ? matched.slice(0, limitCount) : matched;
          return limited.map((doc) => project(doc, options.projection));
        },
        async next() {
          const [first] = await cursor.limit(1).toArray();
          return first ?? null;
        },
      };
      return cursor;
    }

    return {
      find(filter: FakeDoc = {}, options: { projection?: Projection; sort?: SortSpec } = {}) {
        reads.push({ collection: name, op: 'find', filter });
        return runFind(filter, options);
      },
      async findOne(filter: FakeDoc = {}, options: { projection?: Projection; sort?: SortSpec } = {}) {
        reads.push({ collection: name, op: 'findOne', filter });
        const [first] = await runFind(filter, options).limit(1).toArray();
        return first ?? null;
      },
      async updateOne(filter: FakeDoc, update: FakeDoc, options: { upsert?: boolean } = {}) {
        writes.push({ collection: name, op: 'updateOne', filter, update, upsert: Boolean(options.upsert) });
        const existing = docsOf(name).find((doc) => matchesFilter(doc, filter));
        if (existing) {
          const before = JSON.stringify(existing);
          applyUpdate(existing, update, false);
          return { matchedCount: 1, modifiedCount: before === JSON.stringify(existing) ? 0 : 1, upsertedCount: 0 };
        }
        if (!options.upsert) return { matchedCount: 0, modifiedCount: 0, upsertedCount: 0 };
        const inserted: FakeDoc = { _id: `fake_${nextId++}` };
        for (const [path, value] of Object.entries(filter)) {
          if (!path.startsWith('$') && !isOperatorObject(value)) setPath(inserted, path, value);
        }
        applyUpdate(inserted, update, true);
        docsOf(name).push(inserted);
        return { matchedCount: 0, modifiedCount: 0, upsertedCount: 1 };
      },
      async insertOne(doc: FakeDoc) {
        writes.push({ collection: name, op: 'insertOne', doc });
        const inserted = { _id: `fake_${nextId++}`, ...structuredClone(doc) };
        docsOf(name).push(inserted);
        return { insertedId: inserted._id };
      },
    };
  }

  return {
    db: { collection } as unknown as Db,
    docs: (name: string) => docsOf(name),
    reads,
    writes,
  };
}
