'use client';

/**
 * Partner Default Frames Management Page
 *
 * Manage default frame assignments for a partner.
 */

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Alert,
  Badge,
  Breadcrumbs,
  Button,
  Card,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';
import WorkspaceHeader from '@/components/gds/WorkspaceHeader';

interface PartnerRecord {
  name: string;
  defaultFrames?: string[];
}

interface FrameRecord {
  frameId: string;
  name: string;
  thumbnailUrl?: string;
}

interface PartnerResponse {
  data?: { partner?: PartnerRecord };
  partner?: PartnerRecord;
  error?: string;
}

interface FramesResponse {
  data?: { frames?: FrameRecord[] };
  error?: string;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'An unexpected error occurred';
}

export default function PartnerFramesPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const [partnerId, setPartnerId] = useState('');
  const [partner, setPartner] = useState<PartnerRecord | null>(null);
  const [availableFrames, setAvailableFrames] = useState<FrameRecord[]>([]);
  const [defaultFrames, setDefaultFrames] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    params.then((resolved) => setPartnerId(resolved.id));
  }, [params]);

  useEffect(() => {
    if (!partnerId) return;

    const fetchData = async () => {
      try {
        setIsLoading(true);

        const partnerResponse = await fetch(`/api/partners/${partnerId}`);
        const partnerData: PartnerResponse = await partnerResponse.json();
        if (!partnerResponse.ok) {
          throw new Error(partnerData.error || 'Failed to load partner');
        }

        const partnerRecord = partnerData.data?.partner || partnerData.partner;
        if (!partnerRecord) {
          throw new Error('Partner not found');
        }
        setPartner(partnerRecord);
        setDefaultFrames(partnerRecord.defaultFrames || []);

        const framesResponse = await fetch('/api/frames?active=true&limit=100');
        const framesData: FramesResponse = await framesResponse.json();
        if (!framesResponse.ok) {
          throw new Error(framesData.error || 'Failed to load frames');
        }

        setAvailableFrames(framesData.data?.frames || []);
      } catch (fetchError) {
        setError(getErrorMessage(fetchError));
      } finally {
        setIsLoading(false);
      }
    };

    void fetchData();
  }, [partnerId]);

  const handleToggleFrame = (frameId: string) => {
    setDefaultFrames((current) => (current.includes(frameId) ? current.filter((id) => id !== frameId) : [...current, frameId]));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const response = await fetch(`/api/partners/${partnerId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ defaultFrames }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to save');
      }

      router.push(`/admin/partners/${partnerId}`);
      router.refresh();
    } catch (saveError) {
      alert(getErrorMessage(saveError));
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <Stack align="center" justify="center" mih="50vh">
        <Text fz={40}>⏳</Text>
        <Text c="dimmed">Loading...</Text>
      </Stack>
    );
  }

  if (error || !partner) {
    return (
      <Stack gap="lg">
        <Alert color="red" icon={<IconAlertCircle size={16} />}>
          <Text fw={700}>Error</Text>
          <Text size="sm">{error || 'Partner not found'}</Text>
        </Alert>
        <Link href="/admin/partners">← Back to Partners</Link>
      </Stack>
    );
  }

  return (
    <Stack gap="xl">
      <Breadcrumbs>
        <Link href="/admin/partners">Partners</Link>
        <Link href={`/admin/partners/${partnerId}`}>{partner.name}</Link>
        <Text>Default Frames</Text>
      </Breadcrumbs>

      <WorkspaceHeader
        eyebrow="Camera Core"
        title="Manage Default Frames"
        description={`Select frames that will be automatically assigned to new events under ${partner.name}`}
      />

      <Alert color="blue">
        <Text size="sm">
          💡 <strong>Note:</strong> Changes will automatically cascade to all child events marked with 🟢. Events with
          custom frames (🔴) will keep their selections.
        </Text>
      </Alert>

      {availableFrames.length === 0 ? (
        <Card>
          <Stack align="center" gap="sm">
            <Text fz={48}>🖼️</Text>
            <Title order={3}>No frames available</Title>
            <Text c="dimmed">Create frames first to assign them as defaults</Text>
          </Stack>
        </Card>
      ) : (
        <SimpleGrid cols={{ base: 2, md: 3, lg: 4 }} spacing="md">
          {availableFrames.map((frame) => {
            const isSelected = defaultFrames.includes(frame.frameId);

            return (
              <Card
                key={frame.frameId}
                withBorder
                radius="md"
                bg={isSelected ? 'blue.0' : 'white'}
                style={{ cursor: 'pointer' }}
                onClick={() => handleToggleFrame(frame.frameId)}
              >
                <Stack gap="sm" align="center">
                  {isSelected ? <Badge color="blue">✓ Selected</Badge> : null}
                  {frame.thumbnailUrl ? (
                    <Image src={frame.thumbnailUrl} alt={frame.name} width={128} height={128} unoptimized style={{ width: '100%', height: 128, objectFit: 'contain' }} />
                  ) : (
                    <Text fz={40}>🖼️</Text>
                  )}
                  <Text size="sm" fw={600} ta="center" lineClamp={2}>
                    {frame.name}
                  </Text>
                </Stack>
              </Card>
            );
          })}
        </SimpleGrid>
      )}

      <Stack gap="sm">
        <Button onClick={handleSave} loading={isSaving}>
          {isSaving ? 'Saving...' : `Save Defaults (${defaultFrames.length} selected)`}
        </Button>
        <Link href={`/admin/partners/${partnerId}`} style={{ textDecoration: 'none' }}>
          <Button variant="default">Cancel</Button>
        </Link>
      </Stack>
    </Stack>
  );
}
