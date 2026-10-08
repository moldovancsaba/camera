/**
 * The share page of a vetted photo that is not public yet (camera#269, docs/PHOTO_VETTING_PLAN.md): waiting for approval, or not
 * approved. It never shows the photo and sends no preview image; the waiting page refreshes itself.
 */

import PublicShell from '@/components/public/PublicPageShell';
import { Alert, Button, Stack, Text, Title } from '@/components/gds/PublicPrimitives';
import AutoRefresh from '@/components/share/AutoRefresh';
import { sharePageText, type SharePageTexts } from '@/lib/events/share-page-settings';
import type { UiLanguage } from '@/lib/i18n';

interface PhotoStatusNoticeProps {
  state: 'waiting' | 'not_approved';
  eventName: string;
  /** Where "Take another photo" goes (the capture page of the event). */
  captureHref: string;
  /** The event's share page settings: its own texts for the notice, the defaults where it has none. */
  settings?: { texts?: SharePageTexts } | null;
  /** The language of the event (camera#352): the language of the defaults. English when absent. */
  language?: UiLanguage;
}

// The title is a flex row as wide as the alert, so it is centred with the text under it by centring the row.
const CENTERED_ALERT = { title: { justifyContent: 'center' } };

export default function PhotoStatusNotice({ state, eventName, captureHref, settings, language }: PhotoStatusNoticeProps) {
  const text = (key: Parameters<typeof sharePageText>[1]) => sharePageText(settings, key, language);
  return (
    <PublicShell size="sm">
      <Stack gap="lg" align="center" ta="center" data-share-state={state}>
        <Title order={1} size="1.5rem">
          {eventName}
        </Title>
        {state === 'waiting' ? (
          <>
            <Alert color="blue" variant="light" title={text('waitingTitle')} styles={CENTERED_ALERT}>
              {text('waitingMessage')}
            </Alert>
            <AutoRefresh />
          </>
        ) : (
          <>
            <Alert color="gray" variant="light" title={text('notApprovedTitle')} styles={CENTERED_ALERT}>
              {text('notApprovedMessage')}
            </Alert>
            <Text size="sm" c="dimmed">
              {text('notApprovedHint')}
            </Text>
            <Button component="a" href={captureHref} size="lg">
              {text('takeAnotherPhotoButton')}
            </Button>
          </>
        )}
      </Stack>
    </PublicShell>
  );
}
