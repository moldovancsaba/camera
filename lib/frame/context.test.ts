import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FRAME_SYSTEM_BAR_COLOR, FRAME_SYSTEM_HEADING_COLOR } from '@/lib/gds/tokens/colors';
import { contextHash, nativeFrameContext, parseFrameContext } from './context';

const NOW = '2026-10-06T12:00:00.000Z';

function answer(over: Record<string, unknown> = {}) {
  return {
    success: true,
    event: {
      id: 'e1',
      name: ' El Clásico ',
      date: '2026-10-12',
      homeTeam: { id: 'h', name: 'FC Barcelona', shortName: 'Barça', logoUrl: 'https://i.ibb.co/home.png' },
      visitorTeam: { id: 'v', name: 'Real Madrid', shortName: null, logoUrl: null },
    },
    partner: { id: 'h', name: 'FC Barcelona', logoUrl: 'https://i.ibb.co/home.png' },
    template: { id: 't', name: 'Match report', resolvedFrom: 'partner' },
    style: {
      id: 's', name: 'Barça theme', resolvedFrom: 'partner', fontFamily: 'AS Roma', fontSource: 'custom',
      fontFile: '/fonts/ASRoma-Regular.woff', headingColor: '#FFFFFFFF', heroBackground: '#0b1d51ff',
    },
    ...over,
  };
}

test('a messmass answer becomes a snapshot with teams, partner, theme and a hash', () => {
  const context = parseFrameContext(answer(), NOW);
  assert.ok(context);
  assert.equal(context.source, 'messmass');
  assert.equal(context.fetchedAt, NOW);
  assert.equal(context.event.name, 'El Clásico');
  assert.deepEqual(context.event.homeTeam, { id: 'h', name: 'FC Barcelona', shortName: 'Barça', logoUrl: 'https://i.ibb.co/home.png' });
  assert.equal(context.event.visitorTeam?.name, 'Real Madrid');
  assert.deepEqual(context.partner, { name: 'FC Barcelona', logoUrl: 'https://i.ibb.co/home.png' });
  assert.deepEqual(context.template, { name: 'Match report', resolvedFrom: 'partner' });
  assert.equal(context.style.fontFile, '/fonts/ASRoma-Regular.woff');
  assert.equal(context.style.headingColor, '#ffffffff', 'colours are normalised to lower case');
  assert.match(context.inputHash, /^[0-9a-f]{64}$/);
});

test('an answer without an event name or without a style is not usable', () => {
  assert.equal(parseFrameContext(null, NOW), null);
  assert.equal(parseFrameContext('x', NOW), null);
  assert.equal(parseFrameContext(answer({ event: { name: '  ' } }), NOW), null);
  assert.equal(parseFrameContext(answer({ style: undefined }), NOW), null);
  assert.equal(parseFrameContext({ success: true }, NOW), null);
});

test('untrusted values are cleaned: only https logos, only drawable colours, only a plain /fonts/ file', () => {
  const context = parseFrameContext(
    answer({
      partner: { name: 'P', logoUrl: 'http://insecure.example/logo.png' },
      event: { name: 'E', homeTeam: { name: 'A', logoUrl: 'javascript:alert(1)' }, visitorTeam: 'nope' },
      style: { fontFamily: 'X', fontSource: 'custom', fontFile: '/fonts/../../etc/passwd', headingColor: 'url(javascript:1)', heroBackground: 'red' },
    }),
    NOW
  );
  assert.ok(context);
  assert.equal(context.partner?.logoUrl, null);
  assert.equal(context.event.homeTeam?.logoUrl, null);
  assert.equal(context.event.visitorTeam, null);
  assert.equal(context.style.fontFile, null);
  assert.equal(context.style.headingColor, FRAME_SYSTEM_HEADING_COLOR);
  assert.equal(context.style.heroBackground, FRAME_SYSTEM_BAR_COLOR);
});

test('a font file is kept only for a custom font, and an unknown font source is a system font', () => {
  const google = parseFrameContext(answer({ style: { fontFamily: 'Roboto', fontSource: 'google', fontFile: '/fonts/Roboto.woff2', headingColor: '#000000ff', heroBackground: '#ffffffff' } }), NOW);
  assert.equal(google?.style.fontSource, 'google');
  assert.equal(google?.style.fontFile, null);
  const odd = parseFrameContext(answer({ style: { fontFamily: 'Y', fontSource: 'weird', headingColor: '#000000ff', heroBackground: '#ffffffff' } }), NOW);
  assert.equal(odd?.style.fontSource, 'system');
});

test('the hash changes only with what is drawn', () => {
  const base = parseFrameContext(answer(), NOW)!;
  const again = parseFrameContext(answer(), '2027-01-01T00:00:00.000Z')!;
  assert.equal(again.inputHash, base.inputHash, 'fetch time is not drawn');
  const otherTemplate = parseFrameContext(answer({ template: { name: 'Other', resolvedFrom: 'default' } }), NOW)!;
  assert.equal(otherTemplate.inputHash, base.inputHash, 'which template applies is not drawn');

  const hashOf = (over: Record<string, unknown>) => parseFrameContext(answer(over), NOW)!.inputHash;
  const event = (home: string) => ({ name: 'El Clásico', homeTeam: { id: 'h', name: home }, visitorTeam: { id: 'v', name: 'Real Madrid' } });
  const style = (over: Record<string, unknown>) => ({
    name: 'S', fontFamily: 'AS Roma', fontSource: 'custom', fontFile: '/fonts/ASRoma-Regular.woff', headingColor: '#FFFFFFFF', heroBackground: '#0b1d51ff', ...over,
  });
  assert.notEqual(hashOf({ event: event('Other FC') }), base.inputHash);
  assert.notEqual(hashOf({ partner: { name: 'FC Barcelona', logoUrl: 'https://i.ibb.co/new.png' } }), base.inputHash);
  assert.notEqual(hashOf({ style: style({ heroBackground: '#123456ff' }) }), base.inputHash);
  assert.notEqual(hashOf({ style: style({ fontFile: '/fonts/ASRoma-v2.woff' }) }), base.inputHash);
  assert.equal(contextHash(base), base.inputHash);
});

test('the fallback for an event without a messmass snapshot: camera name and partner logo, no teams, the system theme', () => {
  const context = nativeFrameContext({ eventName: ' Fan Day ', eventDate: '2026-10-12', partnerName: 'Fan Club', partnerLogoUrl: 'https://i.ibb.co/fc.png' }, NOW);
  assert.equal(context.source, 'camera');
  assert.equal(context.event.name, 'Fan Day');
  assert.equal(context.event.homeTeam, null);
  assert.equal(context.event.visitorTeam, null);
  assert.deepEqual(context.partner, { name: 'Fan Club', logoUrl: 'https://i.ibb.co/fc.png' });
  assert.deepEqual(context.style, {
    name: 'System default', resolvedFrom: 'system-default', fontFamily: 'Inter', fontSource: 'google', fontFile: null,
    headingColor: FRAME_SYSTEM_HEADING_COLOR, heroBackground: FRAME_SYSTEM_BAR_COLOR,
  });
  assert.equal(nativeFrameContext({ eventName: 'x', partnerName: '   ' }, NOW).partner, null);
});
