/**
 * Detects and repairs "mojibake" text -- valid UTF-8 that was, at some
 * earlier point, decoded as Windows-1252 and stored that way. Classic
 * symptom: "Váci" stored/displayed as "VÃ¡ci".
 *
 * Mirrors messmass's lib/textRepair.ts exactly. Needed independently here
 * (not just fixed in messmass and re-synced) because the sync's link logic
 * deliberately never overwrites an already-linked partner/event's name --
 * so partners/events already synced with corrupted names need their own
 * direct repair pass.
 *
 * repairMojibake() reverses ONE layer of "UTF-8 bytes shown as Windows-1252"
 * by mapping each character back to its cp1252 byte value, then re-decoding
 * those bytes as UTF-8. Returns null (never guesses) if the string isn't
 * representable in cp1252, or the round-trip doesn't produce valid UTF-8 --
 * this is what makes it safe on already-correct text in ANY language/script:
 * real multi-byte UTF-8 characters (á, ő, Ü, 北, ...) fail the round-trip and
 * are left untouched.
 */

const CP1252_TO_CODEPOINT: number[] = (() => {
  const dec = new TextDecoder('windows-1252');
  const table: number[] = new Array(256);
  for (let b = 0; b < 256; b++) {
    table[b] = dec.decode(Buffer.from([b])).codePointAt(0)!;
  }
  return table;
})();

const CODEPOINT_TO_CP1252: Map<number, number> = new Map(
  CP1252_TO_CODEPOINT.map((cp, byte) => [cp, byte])
);

export function repairMojibake(str: string): string | null {
  if (!str) return null;
  const bytes: number[] = [];
  for (const ch of str) {
    const byte = CODEPOINT_TO_CP1252.get(ch.codePointAt(0)!);
    if (byte === undefined) return null;
    bytes.push(byte);
  }
  const repaired = Buffer.from(bytes).toString('utf8');
  if (repaired.includes('�')) return null;
  if (repaired === str) return null;
  return repaired;
}
