import assert from 'node:assert/strict';
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { adminContextMenu, adminContextOf, type AdminNavigationAccess } from './adminNavigation';

const GLOBAL_ADMIN: AdminNavigationAccess = { isGlobalAdmin: true, hasAnyPartnerAccess: true, hasEventsAccess: true };
const PARTNER_USER: AdminNavigationAccess = { isGlobalAdmin: false, hasAnyPartnerAccess: true, hasEventsAccess: true };
const ID = '65f0c0ffee0000000000abcd';

test('the context comes from the path: an event, a partner, or the main menu', () => {
  assert.deepEqual(adminContextOf(`/admin/events/${ID}`), { kind: 'event', id: ID });
  assert.deepEqual(adminContextOf(`/admin/events/${ID}/logos`), { kind: 'event', id: ID });
  assert.deepEqual(adminContextOf(`/admin/events/${ID}/slideshows/abc`), { kind: 'event', id: ID });
  assert.deepEqual(adminContextOf(`/admin/events/${ID}#slideshows`), { kind: 'event', id: ID });
  assert.deepEqual(adminContextOf(`/admin/partners/${ID}/images`), { kind: 'partner', id: ID });
  for (const main of ['/admin', '/admin/events', '/admin/events/', '/admin/events/new', '/admin/partners', '/admin/partners/new', '/admin/frames', '/admin/users', '/admin/vetting', '/admin/analytics', '/']) {
    assert.equal(adminContextOf(main), null, main);
  }
});

test('a global admin and a partner user see the same items of the event menu, Analytics included (issue 521: the numbers of the event are for its managers)', () => {
  const labels = (access: AdminNavigationAccess) => adminContextMenu({ kind: 'event', id: ID }, `/admin/events/${ID}`, access).items.map((item) => item.label);
  const expected = ['Overview', 'Edit', 'Vetting', 'Photo analysis', 'Analytics', 'Event User Journey', 'Event Images', 'Event Frames', 'Event Frame Slots', 'Event Logos', 'Event Selfies', 'Event Stadiums', 'Event Dictionary', 'Event Vetting words', 'Event Email', 'Event Landing Pages', 'Event Slideshows', 'Event Gallery'];
  assert.deepEqual(labels(GLOBAL_ADMIN), expected);
  assert.deepEqual(labels(PARTNER_USER), expected);
});

test('the partner menu has its own pages', () => {
  const menu = adminContextMenu({ kind: 'partner', id: ID }, `/admin/partners/${ID}`, GLOBAL_ADMIN);
  assert.deepEqual(menu.items.map((item) => item.label), ['Overview', 'Edit', 'Partner User Journey', 'Partner Images', 'Partner Frames', 'Partner Frame Slots', 'Partner Logos', 'Partner Selfies', 'Partner Stadiums', 'Partner Dictionary', 'Partner Vetting words', 'Partner Email', 'Partner Gallery']);
  assert.deepEqual(menu.items.map((item) => item.href), [`/admin/partners/${ID}`, `/admin/partners/${ID}/edit`, `/admin/partners/${ID}#partner-user-journey`, `/admin/partners/${ID}/images`, `/admin/partners/${ID}/frames`, `/admin/partners/${ID}/frame-slots`, `/admin/partners/${ID}/logos`, `/admin/partners/${ID}/selfies`, `/admin/partners/${ID}/stadiums`, `/admin/partners/${ID}/texts`, `/admin/partners/${ID}/annotation-words`, `/admin/partners/${ID}/emails`, `/admin/partners/${ID}#partner-gallery`]);
});

const activeLabels = (pathname: string, kind: 'event' | 'partner' = 'event') =>
  adminContextMenu({ kind, id: ID }, pathname, GLOBAL_ADMIN).items.filter((item) => item.active).map((item) => item.label);

test('exactly one item is active, and the overview is active only on its own address', () => {
  assert.deepEqual(activeLabels(`/admin/events/${ID}`), ['Overview']);
  assert.deepEqual(activeLabels(`/admin/events/${ID}/`), ['Overview']);
  assert.deepEqual(activeLabels(`/admin/events/${ID}/logos`), ['Event Logos']);
  assert.deepEqual(activeLabels(`/admin/events/${ID}/gallery`), ['Event Gallery']);
  assert.deepEqual(activeLabels(`/admin/events/${ID}/vetting`), ['Vetting']);
  assert.deepEqual(activeLabels(`/admin/events/${ID}/analysis`), ['Photo analysis']);
  assert.deepEqual(activeLabels(`/admin/events/${ID}/annotation-words`), ['Event Vetting words']);
  assert.deepEqual(activeLabels(`/admin/partners/${ID}/annotation-words`, 'partner'), ['Partner Vetting words']);
  assert.deepEqual(activeLabels(`/admin/events/${ID}/edit`), ['Edit']);
  assert.deepEqual(activeLabels(`/admin/events/${ID}/pages`), ['Event User Journey']);
  assert.deepEqual(activeLabels(`/admin/events/${ID}/slideshows/new`), ['Event Slideshows']);
  assert.deepEqual(activeLabels(`/admin/events/${ID}/slideshows/abc123`), ['Event Slideshows']);
  assert.deepEqual(activeLabels(`/admin/events/${ID}/layouts/abc123`), ['Event Slideshows']);
  assert.deepEqual(activeLabels(`/admin/events/${ID}/landing-pages/abc123`), ['Event Landing Pages']);
  assert.deepEqual(activeLabels(`/admin/events/${ID}/frame-slots`), ['Event Frame Slots']);
  assert.deepEqual(activeLabels(`/admin/events/${ID}/selfies`), ['Event Selfies']);
  assert.deepEqual(activeLabels(`/admin/events/${ID}/stadiums`), ['Event Stadiums']);
  assert.deepEqual(activeLabels(`/admin/partners/${ID}/images`, 'partner'), ['Partner Images']);
  assert.deepEqual(activeLabels(`/admin/partners/${ID}/frame-slots`, 'partner'), ['Partner Frame Slots']);
  assert.deepEqual(activeLabels(`/admin/partners/${ID}/selfies`, 'partner'), ['Partner Selfies']);
  assert.deepEqual(activeLabels(`/admin/partners/${ID}/stadiums`, 'partner'), ['Partner Stadiums']);
  assert.deepEqual(activeLabels(`/admin/partners/${ID}`, 'partner'), ['Overview']);
  assert.deepEqual(activeLabels(`/admin/partners/${ID}#partner-user-journey`, 'partner'), ['Partner User Journey']);
  assert.deepEqual(activeLabels(`/admin/partners/${ID}#partner-gallery`, 'partner'), ['Partner Gallery']);
  assert.deepEqual(activeLabels(`/admin/events/${ID}#slideshows`), ['Event Slideshows']);
});

test('another id with the same start is not this event', () => {
  assert.deepEqual(activeLabels(`/admin/events/${ID}-other/logos`), []);
});

/** Every page under an event or partner, as the path it is shown at (a dynamic segment becomes `x`). */
function pagesUnder(dir: string, base: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...pagesUnder(full, `${base}/${name.startsWith('[') ? 'x' : name}`));
    else if (name === 'page.tsx') out.push(base);
  }
  return out;
}

test('every page of an event and of a partner belongs to an item of its menu: a new page cannot be left out of the menu', () => {
  for (const [kind, folder] of [['event', 'events'], ['partner', 'partners']] as const) {
    const root = path.join(process.cwd(), 'app', 'admin', folder, '[id]');
    const pages = pagesUnder(root, `/admin/${folder}/${ID}`);
    assert.ok(pages.length >= 4, `found the ${kind} pages`);
    for (const page of pages) {
      assert.ok(activeLabels(page, kind).length === 1, `${page} must make exactly one item of the ${kind} menu active (add it to the menu in lib/adminNavigation.ts, or to the \`also\` of the item that opens it)`);
    }
  }
});
