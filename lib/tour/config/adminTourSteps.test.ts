import assert from 'node:assert/strict';
import { test } from 'node:test';
import { UI_LANGUAGES } from '@/lib/i18n';
import { getAdminTourSteps } from './adminTourSteps';

const ACCESS = { isGlobalAdmin: true, hasAnyPartnerAccess: true, hasEventsAccess: true };

test('admin tour titles and descriptions follow every selected admin locale', () => {
  const english = getAdminTourSteps(ACCESS, { language: 'en' });
  for (const language of UI_LANGUAGES) {
    const steps = getAdminTourSteps(ACCESS, { language });
    assert.equal(steps.length, english.length);
    for (let index = 0; index < steps.length; index += 1) {
      assert.ok(String(steps[index].title).trim(), `${language}: title ${index}`);
      assert.ok(String(steps[index].description).trim(), `${language}: description ${index}`);
      if (language !== 'en') {
        assert.notEqual(steps[index].description, english[index].description, `${language}: description ${steps[index].id}`);
      }
    }
  }
});

test('the contextual tour names the current workspace type and keeps account guidance localized', () => {
  for (const language of UI_LANGUAGES) {
    for (const contextKind of ['event', 'partner'] as const) {
      const steps = getAdminTourSteps(ACCESS, { inContext: true, contextKind, language });
      assert.equal(steps.length, 2);
      assert.ok(String(steps[0].title).trim());
      assert.ok(String(steps[1].title).trim());
      if (language !== 'en') {
        assert.notEqual(steps[0].description, getAdminTourSteps(ACCESS, { inContext: true, contextKind, language: 'en' })[0].description);
        assert.notEqual(steps[1].description, getAdminTourSteps(ACCESS, { inContext: true, contextKind, language: 'en' })[1].description);
      }
    }
  }
});
