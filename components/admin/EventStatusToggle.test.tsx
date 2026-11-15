import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { MantineProvider } from '@mantine/core';

async function render(t: TestContext, initialIsActive: boolean): Promise<string> {
  t.mock.module('next/navigation', { exports: { useRouter: () => ({ refresh: () => undefined }) } });
  const { default: EventStatusToggle } = await import(`@/components/gds/EventStatusToggle?status=${initialIsActive}`);
  return renderToStaticMarkup(
    <MantineProvider>
      <EventStatusToggle eventId="event-1" eventName="Derby" initialIsActive={initialIsActive} />
    </MantineProvider>
  );
}

test('the active event status control is a named eye button without visible status copy', async (t) => {
  const html = await render(t, true);
  assert.match(html, /<button[^>]*aria-label="Deactivate event: Derby"/);
  assert.match(html, /aria-pressed="true"/);
  assert.match(html, /data-event-status="active"/);
  assert.match(html, /sr-only/);
  assert.equal(/>\s*(Active|Inactive)\s*</.test(html), false);
});

test('the inactive event status control provides the activation action and closed-eye state', async (t) => {
  const html = await render(t, false);
  assert.match(html, /<button[^>]*aria-label="Activate event: Derby"/);
  assert.match(html, /aria-pressed="false"/);
  assert.match(html, /data-event-status="inactive"/);
});
