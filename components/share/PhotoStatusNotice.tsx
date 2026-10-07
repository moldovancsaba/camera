/**
 * The share page of a vetted photo that is not public yet (camera#269, docs/PHOTO_VETTING_PLAN.md): waiting for approval, or not
 * approved. It never shows the photo and sends no preview image; the waiting page refreshes itself.
 */

import PublicShell from '@/components/public/PublicPageShell';
import { Alert, Button, Stack, Text, Title } from '@/components/gds/PublicPrimitives';
import AutoRefresh from '@/components/share/AutoRefresh';

interface PhotoStatusNoticeProps {
  state: 'waiting' | 'not_approved';
  eventName: string;
  /** Where "Take another photo" goes (the capture page of the event). */
  captureHref: string;
}

// The title is a flex row as wide as the alert, so it is centred with the text under it by centring the row.
const CENTERED_ALERT = { title: { justifyContent: 'center' } };

export default function PhotoStatusNotice({ state, eventName, captureHref }: PhotoStatusNoticeProps) {
  return (
    <PublicShell size="sm">
      <Stack gap="lg" align="center" ta="center" data-share-state={state}>
        <Title order={1} size="1.5rem">
          {eventName}
        </Title>
        {state === 'waiting' ? (
          <>
            <Alert color="blue" variant="light" title="Waiting for approval" styles={CENTERED_ALERT}>
              Your photo is waiting for approval. This page updates by itself, and we will email you the link as soon as it is approved.
            </Alert>
            <AutoRefresh />
          </>
        ) : (
          <>
            <Alert color="gray" variant="light" title="Not approved" styles={CENTERED_ALERT}>
              Your photo could not be approved, so it will not be published.
            </Alert>
            <Text size="sm" c="dimmed">
              You are welcome to take another photo.
            </Text>
            <Button component="a" href={captureHref} size="lg">
              Take another photo
            </Button>
          </>
        )}
      </Stack>
    </PublicShell>
  );
}
