'use client';

import Link from 'next/link';
import { useUiLanguage } from '@/components/i18n/UiLanguageProvider';
import { adminShellText } from '@/lib/i18n/admin-shell';
import { uiLanguageDirection } from '@/lib/i18n/locale-negotiation';
import { Button, Card, Group, SimpleGrid, Stack, Text, Title } from '@/components/gds/PublicPrimitives';

/** The second setup step: inspect saved compositions, then walk the real public journey. */
export default function EventExperienceReviewPanel({ eventId }: { eventId: string }) {
  const language = useUiLanguage();
  const t = (source: string) => adminShellText(source, language);
  const base = `/admin/events/${encodeURIComponent(eventId)}`;
  const direction = uiLanguageDirection(language);

  return (
    <Card component="section" withBorder radius="md" p="lg" aria-labelledby="event-experience-review-title" lang={language} dir={direction}>
      <Stack gap="sm">
        <Title id="event-experience-review-title" order={2}>2. {t('Preview and test')}</Title>
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="sm">
          <Button component={Link} href={`${base}/pages`} variant="light" fullWidth>
            {t('Pages of the user journey')}
          </Button>
          <Button component={Link} href={`${base}/frames`} variant="light" fullWidth>
            {t('Frames')}
          </Button>
          <Button component={Link} href={`${base}#slideshows`} variant="light" fullWidth>
            {t('Slideshows')}
          </Button>
          <Button component="a" href={`/capture/${encodeURIComponent(eventId)}`} target="_blank" rel="noopener noreferrer" fullWidth>
            {t('Open the live guest journey')}
          </Button>
        </SimpleGrid>
        <Group gap="xs" align="flex-start" wrap="nowrap" role="note">
          <Text fw={700} aria-hidden="true">!</Text>
          <Text size="sm">{t('Live event: selfies submitted here are real event submissions. They follow this event’s consent, vetting, publication, email and analytics settings.')}</Text>
        </Group>
      </Stack>
    </Card>
  );
}
