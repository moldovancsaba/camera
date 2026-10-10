/**
 * A database of plain arrays for the tests of the libraries: just the calls lib/library and its routes make (find with sort and limit,
 * findOne, countDocuments, insertOne (a duplicate `_id` is refused, as MongoDB does), updateOne with $set, $push and $pull (and `upsert` with plain filters), updateMany with $set, $unset and $pull (also on a dotted path such as
 * `library.images`), deleteOne). Filters: equality (null matches a missing field),
 * $in, $nin, $ne, $exists, $or and dotted paths through arrays (`frames.frameId`; a plain value also matches an array that holds it); $set (also `frames.$.isActive`), $unset, $push and $pull. Not part of the app.
 */

import type { Db } from 'mongodb';

type Doc = Record<string, unknown>;

function valuesAt(doc: unknown, path: string[]): unknown[] {
  // As in MongoDB, a value matches an array field when it is the array or one of its elements (`{ 'library.images': id }`).
  if (path.length === 0) return Array.isArray(doc) ? [doc, ...doc] : [doc];
  if (Array.isArray(doc)) return doc.flatMap((item) => valuesAt(item, path));
  if (doc && typeof doc === 'object') return valuesAt((doc as Doc)[path[0]], path.slice(1));
  return [undefined];
}

function matchesValue(value: unknown, want: unknown): boolean {
  if (want && typeof want === 'object' && !Array.isArray(want) && Object.keys(want).some((k) => k.startsWith('$'))) {
    const ops = want as Doc;
    return Object.entries(ops).every(([op, arg]) => {
      if (op === '$in') return (arg as unknown[]).some((a) => matchesValue(value, a));
      if (op === '$nin') return !(arg as unknown[]).some((a) => matchesValue(value, a));
      if (op === '$ne') return !matchesValue(value, arg);
      if (op === '$exists') return (value !== undefined) === Boolean(arg);
      // Ranges on strings (ISO times) and numbers, as MongoDB compares them; a missing value is outside every range.
      if (op === '$gt' || op === '$gte' || op === '$lt' || op === '$lte') {
        if (value === undefined || value === null) return false;
        const a = value as string | number;
        const b = arg as string | number;
        return op === '$gt' ? a > b : op === '$gte' ? a >= b : op === '$lt' ? a < b : a <= b;
      }
      if (op === '$elemMatch') return Array.isArray(value) && value.some((item) => matches(item as Doc, arg as Doc));
      throw new Error(`fake db: unsupported operator ${op}`);
    });
  }
  if (want === null) return value === null || value === undefined;
  // As in MongoDB, an array field matches a plain value when one of its elements equals it (`library.frames` holding 'f1').
  if (Array.isArray(value) && !Array.isArray(want)) return value.some((item) => matchesValue(item, want));
  return value === want || (typeof value === 'object' && value !== null && String(value) === String(want));
}

/** `$pull` on a plain or dotted path (`slots.logo.items`): takes out the elements that equal the condition, match it, or are in its `$in` list. */
function pullFrom(doc: Doc, path: string, cond: unknown): void {
  const parts = path.split('.');
  const parent = parts.slice(0, -1).reduce<Doc | undefined>((at, part) => (at && at[part] && typeof at[part] === 'object' ? (at[part] as Doc) : undefined), doc);
  const key = parts[parts.length - 1];
  if (!parent || !Array.isArray(parent[key])) return;
  const isIn = cond && typeof cond === 'object' && Array.isArray((cond as Doc).$in);
  parent[key] = (parent[key] as unknown[]).filter((item) => {
    if (isIn) return !((cond as Doc).$in as unknown[]).includes(item);
    return !(cond && typeof cond === 'object' ? matches(item as Doc, cond as Doc) : item === cond);
  });
}

export function matches(doc: Doc, filter: Doc): boolean {
  return Object.entries(filter).every(([key, want]) => {
    if (key === '$or') return (want as Doc[]).some((f) => matches(doc, f));
    if (key === '$and') return (want as Doc[]).every((f) => matches(doc, f));
    const values = valuesAt(doc, key.split('.'));
    return values.some((value) => matchesValue(value, want));
  });
}

/** The index the positional `$` stands for: the first element of the array named in the filter (`frames.frameId`, or `logos` with `$elemMatch`) that matches. */
function positionalIndex(doc: Doc, filter: Doc, arrayName: string): number {
  for (const [key, want] of Object.entries(filter)) {
    const [head, ...rest] = key.split('.');
    const elemMatch = key === arrayName && want && typeof want === 'object' ? (want as Doc).$elemMatch : undefined;
    if (elemMatch) {
      const i = ((doc[arrayName] as unknown[] | undefined) ?? []).findIndex((item) => matches(item as Doc, elemMatch as Doc));
      if (i >= 0) return i;
      continue;
    }
    if (head !== arrayName || rest.length === 0) continue;
    const list = (doc[arrayName] as unknown[] | undefined) ?? [];
    const i = list.findIndex((item) => valuesAt(item, rest).some((value) => matchesValue(value, want)));
    if (i >= 0) return i;
  }
  throw new Error(`fake db: no element for the positional $ of ${arrayName}`);
}

function unsetPath(doc: Doc, path: string): void {
  const parts = path.split('.');
  let target: Doc | undefined = doc;
  for (const part of parts.slice(0, -1)) {
    const next: unknown = target?.[part];
    target = next && typeof next === 'object' ? (next as Doc) : undefined;
  }
  if (target) delete target[parts[parts.length - 1]];
}

function setPath(doc: Doc, path: string, value: unknown, filter: Doc = {}): void {
  const parts = path.split('.');
  let target = doc;
  let previous = '';
  for (const part of parts.slice(0, -1)) {
    const key = part === '$' ? String(positionalIndex(doc, filter, previous)) : part;
    if (!target[key] || typeof target[key] !== 'object') target[key] = {};
    target = target[key] as Doc;
    previous = part;
  }
  target[parts[parts.length - 1]] = value;
}

export function fakeDb(seed: Record<string, Doc[]> = {}): { db: Db; data: Record<string, Doc[]>; calls: Array<{ collection: string; op: string; args: unknown[] }> } {
  const data: Record<string, Doc[]> = {};
  for (const [name, docs] of Object.entries(seed)) data[name] = docs.map((d) => ({ ...d }));
  const calls: Array<{ collection: string; op: string; args: unknown[] }> = [];
  const list = (name: string): Doc[] => (data[name] ??= []);
  const db = {
    collection(name: string) {
      return {
        find(filter: Doc = {}) {
          let rows = list(name).filter((d) => matches(d, filter));
          const cursor = {
            sort(spec: Record<string, 1 | -1>) {
              const [[field, dir]] = Object.entries(spec);
              rows = [...rows].sort((a, b) => String(a[field] ?? '').localeCompare(String(b[field] ?? '')) * dir);
              return cursor;
            },
            skip(n: number) {
              rows = rows.slice(n);
              return cursor;
            },
            limit(n: number) {
              rows = rows.slice(0, n);
              return cursor;
            },
            toArray: async () => rows.map((d) => ({ ...d })),
          };
          return cursor;
        },
        findOne: async (filter: Doc, options?: { sort?: Record<string, 1 | -1> }) => {
          let rows = list(name).filter((d) => matches(d, filter));
          const [field, dir] = Object.entries(options?.sort ?? {})[0] ?? [];
          if (field) rows = [...rows].sort((a, b) => String(a[field] ?? '').localeCompare(String(b[field] ?? '')) * (dir as number));
          return rows[0] ? { ...rows[0] } : null;
        },
        countDocuments: async (filter: Doc = {}) => list(name).filter((d) => matches(d, filter)).length,
        insertOne: async (doc: Doc) => {
          calls.push({ collection: name, op: 'insertOne', args: [doc] });
          // As MongoDB's own unique `_id` index does: a second document with the same `_id` is refused (the follow-up e-mail claims rely on it).
          if (doc._id !== undefined && list(name).some((d) => String(d._id) === String(doc._id))) throw Object.assign(new Error(`E11000 duplicate key error: _id ${String(doc._id)}`), { code: 11000 });
          list(name).push({ ...doc });
          return { insertedId: doc._id ?? 'new' };
        },
        updateOne: async (filter: Doc, update: Doc, options?: { upsert?: boolean }) => {
          calls.push({ collection: name, op: 'updateOne', args: [filter, update] });
          const doc = list(name).find((d) => matches(d, filter));
          if (!doc) {
            // An upsert inserts a document made of the plain equalities of the filter and the $set.
            if (options?.upsert) {
              const fresh: Doc = Object.fromEntries(Object.entries(filter).filter(([key, value]) => !key.startsWith('$') && (value === null || typeof value !== 'object')));
              for (const [path, value] of Object.entries((update.$set as Doc) ?? {})) setPath(fresh, path, value, filter);
              list(name).push(fresh);
              return { matchedCount: 0, modifiedCount: 0, upsertedCount: 1 };
            }
            return { matchedCount: 0, modifiedCount: 0 };
          }
          for (const [path, value] of Object.entries((update.$set as Doc) ?? {})) setPath(doc, path, value, filter);
          for (const path of Object.keys((update.$unset as Doc) ?? {})) unsetPath(doc, path);
          for (const [path, value] of Object.entries((update.$push as Doc) ?? {})) {
            const arr = (doc[path] as unknown[] | undefined) ?? [];
            const each = value && typeof value === 'object' && Array.isArray((value as Doc).$each) ? ((value as Doc).$each as unknown[]) : [value];
            doc[path] = [...arr, ...each];
          }
          for (const [path, cond] of Object.entries((update.$pull as Doc) ?? {})) pullFrom(doc, path, cond);
          return { matchedCount: 1, modifiedCount: 1 };
        },
        updateMany: async (filter: Doc, update: Doc) => {
          calls.push({ collection: name, op: 'updateMany', args: [filter, update] });
          const docs = list(name).filter((d) => matches(d, filter));
          for (const doc of docs) {
            for (const [path, value] of Object.entries((update.$set as Doc) ?? {})) setPath(doc, path, value, filter);
            for (const [path, cond] of Object.entries((update.$pull as Doc) ?? {})) pullFrom(doc, path, cond);
            for (const path of Object.keys((update.$unset as Doc) ?? {})) unsetPath(doc, path);
          }
          return { matchedCount: docs.length, modifiedCount: docs.length };
        },
        findOneAndUpdate: async (filter: Doc, update: Doc) => {
          const doc = list(name).find((d) => matches(d, filter));
          if (!doc) return null;
          for (const [path, value] of Object.entries((update.$set as Doc) ?? {})) setPath(doc, path, value, filter);
          for (const path of Object.keys((update.$unset as Doc) ?? {})) unsetPath(doc, path);
          return { ...doc };
        },
        deleteMany: async (filter: Doc) => {
          calls.push({ collection: name, op: 'deleteMany', args: [filter] });
          const rows = list(name);
          let deleted = 0;
          for (let i = rows.length - 1; i >= 0; i -= 1) {
            if (matches(rows[i], filter)) {
              rows.splice(i, 1);
              deleted += 1;
            }
          }
          return { deletedCount: deleted };
        },
        deleteOne: async (filter: Doc) => {
          calls.push({ collection: name, op: 'deleteOne', args: [filter] });
          const i = list(name).findIndex((d) => matches(d, filter));
          if (i >= 0) list(name).splice(i, 1);
          return { deletedCount: i >= 0 ? 1 : 0 };
        },
      };
    },
  };
  return { db: db as unknown as Db, data, calls };
}
