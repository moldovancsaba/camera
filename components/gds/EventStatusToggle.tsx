'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { GdsIcons } from '@sovereignsquad/gds-core/client';
import { notifyAdminError } from '@/components/admin/notify';
import { Button } from '@/components/gds/PublicPrimitives';
import { useUiLanguage } from '@/components/i18n/UiLanguageProvider';
import { adminPageText } from '@/lib/i18n/admin-pages';

/** A manager-only control for the event's public active/inactive state. */
export default function EventStatusToggle({
  eventId,
  eventName,
  initialIsActive,
}: {
  eventId: string;
  eventName: string;
  initialIsActive: boolean;
}) {
  const router = useRouter();
  const language = useUiLanguage();
  const [isActive, setIsActive] = useState(initialIsActive);
  const [isSaving, setIsSaving] = useState(false);
  const requestInFlight = useRef(false);
  useEffect(() => setIsActive(initialIsActive), [initialIsActive]);
  const actionLabel = adminPageText(isActive ? 'Deactivate event' : 'Activate event', language);
  const accessibleName = `${actionLabel}: ${eventName}`;

  const toggleStatus = async () => {
    if (requestInFlight.current) return;
    requestInFlight.current = true;
    setIsSaving(true);

    try {
      const response = await fetch(`/api/events/${encodeURIComponent(eventId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !isActive }),
      });

      if (!response.ok) {
        notifyAdminError(adminPageText('Could not update the event status. Please try again.', language));
        return;
      }

      setIsActive((current) => !current);
      router.refresh();
    } catch {
      notifyAdminError(adminPageText('Could not update the event status. Please try again.', language));
    } finally {
      requestInFlight.current = false;
      setIsSaving(false);
    }
  };

  const Icon = isActive ? GdsIcons.Eye : GdsIcons.EyeOff;
  const tone = isActive ? 'var(--mantine-color-green-7)' : 'var(--mantine-color-red-7)';

  return (
    <Button
      type="button"
      variant="default"
      aria-label={accessibleName}
      aria-pressed={isActive}
      aria-busy={isSaving}
      title={accessibleName}
      data-event-status={isActive ? 'active' : 'inactive'}
      disabled={isSaving}
      loading={isSaving}
      onClick={() => void toggleStatus()}
      leftSection={<Icon size="1.15rem" aria-hidden="true" />}
      styles={{
        root: {
          borderColor: tone,
          color: tone,
          minHeight: 44,
          minWidth: 44,
          paddingInline: 10,
        },
        section: { marginInlineEnd: 0 },
      }}
    >
      <span className="sr-only">{accessibleName}</span>
    </Button>
  );
}
