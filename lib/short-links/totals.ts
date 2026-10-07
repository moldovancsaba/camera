/**
 * What the hit counts of an event add up to for messmass (camera#320): visitQrCode (every counted visit through a QR link), visitShortUrl (through a
 * plain link, the event's own short URL included), and the device split of the QR visits, qrscanAndroid and qrscanIphone. Pure, unit-tested (totals.test.ts).
 */

import type { HitDevice } from './device';

export type LinkKind = 'qr' | 'link';

export interface LinkStatTotals {
  visitQrCode: number;
  visitShortUrl: number;
  qrscanAndroid: number;
  qrscanIphone: number;
}

export interface HitRow {
  kind: LinkKind;
  device: HitDevice;
  count: number;
}

export const NO_TOTALS: LinkStatTotals = { visitQrCode: 0, visitShortUrl: 0, qrscanAndroid: 0, qrscanIphone: 0 };

export function totalsFromHitRows(rows: HitRow[]): LinkStatTotals {
  const totals = { ...NO_TOTALS };
  for (const row of rows) {
    const count = Number.isFinite(row.count) && row.count > 0 ? Math.floor(row.count) : 0;
    if (row.kind === 'qr') {
      totals.visitQrCode += count;
      if (row.device === 'android') totals.qrscanAndroid += count;
      if (row.device === 'iphone') totals.qrscanIphone += count;
    } else if (row.kind === 'link') {
      totals.visitShortUrl += count;
    }
  }
  return totals;
}

export function sameTotals(a: LinkStatTotals | undefined, b: LinkStatTotals): boolean {
  return !!a && a.visitQrCode === b.visitQrCode && a.visitShortUrl === b.visitShortUrl && a.qrscanAndroid === b.qrscanAndroid && a.qrscanIphone === b.qrscanIphone;
}
