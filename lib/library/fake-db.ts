/**
 * A database of plain arrays for the tests of the libraries: just the calls lib/library and its routes make (find with sort and limit,
 * findOne, countDocuments, insertOne, updateOne with $set, $push and $pull, deleteOne). Filters: equality (null matches a missing field),
 * $in, $nin, $ne, $exists, $or and dotted paths through arrays (`frames.frameId`); $set (also `frames.$.isActive`), $unset, $push and $pull. Not part of the app.
 */

import type { Db } from 'mongodb';

type Doc = Record<string, unknown>;

function valuesAt(doc: unknown, path: string[]): unknown[] {
  if (path.length === 0) return [doc];
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
      throw new Error(`fake db: unsupported operator ${op}`);
    });
  }
  if (want === null) return value === null || value === undefined;
  return value === want || (typeof value === 'object' && value !== null && String(value) === String(want));
}

export function matches(doc: Doc, filter: Doc): boolean {
  return Object.entries(filter).every(([key, want]) => {
    if (key === '$or') return (want as Doc[]).some((f) => matches(doc, f));
    const values = valuesAt(doc, key.split('.'));
    return values.some((value) => matchesValue(value, want));
  });
}

/** The index the positional `$` stands for: the first element of the array named in the filter (`frames.frameId`) that matches. */
function positionalIndex(doc: Doc, filter: Doc, arrayName: string): number {
  for (const [key, want] of Object.entries(filter)) {
    const [head, ...rest] = key.split('.');
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
        findOne: async (filter: Doc) => {
          const found = list(name).find((d) => matches(d, filter));
          return found ? { ...found } : null;
        },
        countDocuments: async (filter: Doc = {}) => list(name).filter((d) => matches(d, filter)).length,
        insertOne: async (doc: Doc) => {
          calls.push({ collection: name, op: 'insertOne', args: [doc] });
          list(name).push({ ...doc });
          return { insertedId: doc._id ?? 'new' };
        },
        updateOne: async (filter: Doc, update: Doc) => {
          calls.push({ collection: name, op: 'updateOne', args: [filter, update] });
          const doc = list(name).find((d) => matches(d, filter));
          if (!doc) return { matchedCount: 0, modifiedCount: 0 };
          for (const [path, value] of Object.entries((update.$set as Doc) ?? {})) setPath(doc, path, value, filter);
          for (const path of Object.keys((update.$unset as Doc) ?? {})) unsetPath(doc, path);
          for (const [path, value] of Object.entries((update.$push as Doc) ?? {})) {
            const arr = (doc[path] as unknown[] | undefined) ?? [];
            doc[path] = [...arr, value];
          }
          for (const [path, cond] of Object.entries((update.$pull as Doc) ?? {})) {
            const arr = (doc[path] as unknown[] | undefined) ?? [];
            doc[path] = arr.filter((item) => !(cond && typeof cond === 'object' ? matches(item as Doc, cond as Doc) : item === cond));
          }
          return { matchedCount: 1, modifiedCount: 1 };
        },
        findOneAndUpdate: async (filter: Doc, update: Doc) => {
          const doc = list(name).find((d) => matches(d, filter));
          if (!doc) return null;
          for (const [path, value] of Object.entries((update.$set as Doc) ?? {})) setPath(doc, path, value, filter);
          for (const path of Object.keys((update.$unset as Doc) ?? {})) unsetPath(doc, path);
          return { ...doc };
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
