/**
 * Serialize MongoDB list documents into plain JSON-safe rows for client GDS components.
 */

export function formatAdminDate(value: unknown): string {
  if (value == null || value === '') return '—';
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString();
}

export function mongoIdString(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && value !== null && 'toString' in value) {
    return (value as { toString(): string }).toString();
  }
  return String(value);
}
