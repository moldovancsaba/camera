'use client';

import Link from 'next/link';
import { Button } from '@/components/gds/PublicPrimitives';
import { useUiLanguage } from '@/components/i18n/UiLanguageProvider';
import { adminPageText } from '@/lib/i18n/admin-pages';

export default function PartnerEventsOpenAll({
  partnerId,
  partnerName,
  eventCount,
}: {
  partnerId: string;
  partnerName: string;
  eventCount: number;
}) {
  const language = useUiLanguage();
  const number = new Intl.NumberFormat(language).format(eventCount);
  const label = `${adminPageText('Open', language)} ${adminPageText('Events', language)}`;

  return (
    <Button
      component={Link}
      href={`/admin/events?partnerId=${encodeURIComponent(partnerId)}`}
      variant="default"
      aria-label={`${label} for ${partnerName} (${number})`}
    >
      {label} ({number})
    </Button>
  );
}
