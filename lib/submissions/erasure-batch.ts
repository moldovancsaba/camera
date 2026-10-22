/** A database candidate must have the Mongo identity used to avoid double processing. */
export interface ErasureCandidate {
  _id: unknown;
}

function idKey(value: unknown): string {
  if (value && typeof value === 'object' && 'toHexString' in value && typeof value.toHexString === 'function') {
    return value.toHexString();
  }
  return String(value);
}

/** Keep missing-consent erasures ahead of lower-priority identity cleanup retries. */
export function prioritizeErasureCandidates<T extends ErasureCandidate>(
  consentPriority: T[],
  lowerPriority: T[],
  limit: number,
): T[] {
  const capacity = Math.max(0, Math.floor(limit));
  if (capacity === 0) return [];
  const selected: T[] = [];
  const seen = new Set<string>();
  for (const candidate of [...consentPriority, ...lowerPriority]) {
    const key = idKey(candidate._id);
    if (seen.has(key)) continue;
    seen.add(key);
    selected.push(candidate);
    if (selected.length >= capacity) break;
  }
  return selected;
}
