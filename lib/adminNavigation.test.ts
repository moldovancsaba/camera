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
  assert.deepEqual(adminContextOf(`/admin/partners/${ID}/images`), { kind: 'partner', id: ID });
  for (const main of ['/admin', '/admin/events', '/admin/events/', '/admin/events/new', '/admin/partners', '/admin/partners/new', '/admin/frames', '/admin/users', '/admin/vetting', '/admin/analytics', '/']) {
    assert.equal(adminContextOf(main), null, main);
  }
});

test('a global admin and a partner user see the same items of the event menu, Analytics included (issue 521: the numbers of the event are for its managers)', () => {
  const labels = (access: AdminNavigationAccess) => adminContextMenu({ kind: 'event', id: ID }, `/admin/events/${ID}`, access).items.map((item) => item.label);
  assert.deepEqual(labels(GLOBAL_ADMIN), ['Overview', 'Edit and pages', 'Vetting', 'Gallery', 'Analytics', 'Logos', 'Frames', 'Images', 'Texts', 'Emails', 'Slideshows', 'Landing pages']);
  assert.deepEqual(labels(PARTNER_USER), ['Overview', 'Edit and pages', 'Vetting', 'Gallery', 'Analytics', 'Logos', 'Frames', 'Images', 'Texts', 'Emails', 'Slideshows', 'Landing pages']);
});

test('the partner menu has its own pages', () => {
  const menu = adminContextMenu({ kind: 'partner', id: ID }, `/admin/partners/${ID}`, GLOBAL_ADMIN);
  assert.deepEqual(menu.items.map((item) => item.label), ['Overview', 'Edit', 'Logos', 'Frames', 'Images', 'Pictures', 'Texts', 'Emails']);
  assert.deepEqual(menu.items.map((item) => item.href), [`/admin/partners/${ID}`, `/admin/partners/${ID}/edit`, `/admin/partners/${ID}/logos`, `/admin/partners/${ID}/frames`, `/admin/partners/${ID}/images`, `/admin/partners/${ID}/pictures`, `/admin/partners/${ID}/texts`, `/admin/partners/${ID}/emails`]);
});

const activeLabels = (pathname: string, kind: 'event' | 'partner' = 'event') =>
  adminContextMenu({ kind, id: ID }, pathname, GLOBAL_ADMIN).items.filter((item) => item.active).map((item) => item.label);

test('exactly one item is active, and the overview is active only on its own address', () => {
  assert.deepEqual(activeLabels(`/admin/events/${ID}`), ['Overview']);
  assert.deepEqual(activeLabels(`/admin/events/${ID}/`), ['Overview']);
  assert.deepEqual(activeLabels(`/admin/events/${ID}/logos`), ['Logos']);
  assert.deepEqual(activeLabels(`/admin/events/${ID}/gallery`), ['Gallery']);
  assert.deepEqual(activeLabels(`/admin/events/${ID}/edit`), ['Edit and pages']);
  assert.deepEqual(activeLabels(`/admin/events/${ID}/slideshows/new`), ['Slideshows']);
  assert.deepEqual(activeLabels(`/admin/events/${ID}/slideshows/abc123`), ['Slideshows']);
  assert.deepEqual(activeLabels(`/admin/events/${ID}/layouts/abc123`), ['Slideshows']);
  assert.deepEqual(activeLabels(`/admin/events/${ID}/landing-pages/abc123`), ['Landing pages']);
  assert.deepEqual(activeLabels(`/admin/partners/${ID}/images`, 'partner'), ['Images']);
  assert.deepEqual(activeLabels(`/admin/partners/${ID}`, 'partner'), ['Overview']);
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
