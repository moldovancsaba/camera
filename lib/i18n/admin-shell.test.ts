import assert from 'node:assert/strict';
import { test } from 'node:test';
import { UI_LANGUAGES } from './index';
import { ADMIN_SHELL_ENGLISH_TEXTS, adminShellText, hasAdminShellTranslation } from './admin-shell';
import { ADMIN_NAVIGATION, EVENT_CONTEXT_MENU, PARTNER_CONTEXT_MENU } from '@/lib/adminNavigation';

test('admin shell translations are populated in every supported UI language', () => {
  for (const language of UI_LANGUAGES) {
    for (const english of ADMIN_SHELL_ENGLISH_TEXTS) {
      assert.ok(adminShellText(english, language).trim(), `${language}: ${english}`);
    }
  }
});

test('unknown admin shell text safely falls back to its English source', () => {
  assert.equal(adminShellText('Future admin label', 'ar'), 'Future admin label');
});

test('every label in the main, event, and partner menus has an explicit localization entry', () => {
  const labels = [
    ...ADMIN_NAVIGATION.flatMap((section) => [section.title, ...section.items.map((item) => item.label)]),
    ...EVENT_CONTEXT_MENU.map((item) => item.label),
    ...PARTNER_CONTEXT_MENU.map((item) => item.label),
    'Back to the main menu', 'Back to App', 'Return to Camera home', 'Logout',
    'End your admin session', 'Show admin tour', 'Admin Panel', 'No access', 'User', 'Admin', 'Superadmin',
  ];
  for (const label of labels) assert.equal(hasAdminShellTranslation(label), true, label);
});
