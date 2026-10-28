'use client';

/**
 * Event export controls
 *
 * Download controls on the event detail page for event email addresses and images.
 *
 * Downloads are plain GET links; the API routes set Content-Disposition so the
 * browser saves the file. The ZIP endpoint is capped server-side.
 */

import { Button, Card, Group, Stack, Text, Title } from '@/components/gds/PublicPrimitives';
import { useUiLanguage } from '@/components/i18n/UiLanguageProvider';
import { adminOperationText } from '@/lib/i18n/admin-operations';
import { uiLanguageDirection } from '@/lib/i18n/locale-negotiation';
import { imageExportText } from '@/lib/i18n/image-exports';

export default function EventExportControls({ eventId }: { eventId: string }) {
  const language = useUiLanguage();
  const t = (source: string) => adminOperationText(source, language);
  const base = `/api/admin/events/${eventId}/export`;

  return (
    <Card lang={language} dir={uiLanguageDirection(language)} withBorder radius="lg" padding="lg">
      <Stack gap="md">
        <Title order={3}>{t('Exports')}</Title>

        <div
          style={{
            display: 'grid',
            gap: 'var(--mantine-spacing-md)',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))',
          }}
        >
          <Card padding="md" radius="md" withBorder>
            <Stack gap="sm">
              <div>
                <Text fw={700}>{t('Email addresses')}</Text>
                <Text c="dimmed" size="sm">{t('Download collected email addresses as CSV.')}</Text>
              </div>
              <Button component="a" href={`${base}/emails`} variant="light">
                {t('Download CSV')}
              </Button>
            </Stack>
          </Card>

          <Card padding="md" radius="md" withBorder>
            <Stack gap="sm">
              <div>
                <Text fw={700}>{t('Images')}</Text>
                <Text c="dimmed" size="sm">{t('Download original and final images. CSV lists URLs; ZIP includes files for smaller events.')}</Text>
              </div>
              <Group grow>
                <Button component="a" href={`${base}/images?format=csv`} variant="light">
                  {t('URL CSV')}
                </Button>
                <Button component="a" href={`${base}/images?format=zip`} variant="default">
                  {t('ZIP')}
                </Button>
              </Group>
              <Group grow>
                <Button component="a" href={`${base}/images?format=zip&kind=original`} variant="default">
                  {imageExportText('originals', language)} {t('ZIP')}
                </Button>
                <Button component="a" href={`${base}/images?format=zip&kind=final`} variant="default">
                  {imageExportText('framed', language)} {t('ZIP')}
                </Button>
              </Group>
            </Stack>
          </Card>
        </div>
      </Stack>
    </Card>
  );
}
