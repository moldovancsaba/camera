export function nowIso(): string {
  return new Date().toISOString();
}

export function plusSeconds(iso: string, seconds: number): string {
  return new Date(new Date(iso).getTime() + seconds * 1000).toISOString();
}

export function plusMinutes(iso: string, minutes: number): string {
  return plusSeconds(iso, minutes * 60);
}
