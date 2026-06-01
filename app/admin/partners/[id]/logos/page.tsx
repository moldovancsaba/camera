'use client';

/**
 * Partner Default Logos Management Page
 *
 * Manage default logo assignments for a partner.
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
  Group,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';
import WorkspaceHeader from '@/components/admin/WorkspaceHeader';

interface DefaultLogoAssignment {
  logoId: string;
  scenario: string;
  order: number;
}

interface PartnerRecord {
  name: string;
  defaultLogos?: DefaultLogoAssignment[];
}

interface LogoRecord {
  logoId: string;
  name: string;
  thumbnailUrl?: string;
}

interface PartnerResponse {
  data?: { partner?: PartnerRecord };
  partner?: PartnerRecord;
  error?: string;
}

interface LogosResponse {
  data?: { logos?: LogoRecord[] };
  error?: string;
}

const scenarios = [
  { id: 'slideshow-transition', name: 'Slideshow Transitions', icon: '🔄' },
  { id: 'onboarding-thankyou', name: 'Custom Pages', icon: '📝' },
  { id: 'loading-slideshow', name: 'Loading Slideshow', icon: '⏳' },
  { id: 'loading-capture', name: 'Loading Capture', icon: '📸' },
];

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'An unexpected error occurred';
}

export default function PartnerLogosPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const [partnerId, setPartnerId] = useState('');
  const [partner, setPartner] = useState<PartnerRecord | null>(null);
  const [availableLogos, setAvailableLogos] = useState<LogoRecord[]>([]);
  const [defaultLogos, setDefaultLogos] = useState<DefaultLogoAssignment[]>([]);
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
        setDefaultLogos(partnerRecord.defaultLogos || []);

        const logosResponse = await fetch('/api/logos?active=true&limit=100');
        const logosData: LogosResponse = await logosResponse.json();
        if (!logosResponse.ok) {
          throw new Error(logosData.error || 'Failed to load logos');
        }

        setAvailableLogos(logosData.data?.logos || []);
      } catch (fetchError) {
        setError(getErrorMessage(fetchError));
      } finally {
        setIsLoading(false);
      }
    };

    void fetchData();
  }, [partnerId]);

  const handleToggleLogo = (logoId: string, scenario: string) => {
    setDefaultLogos((current) => {
      const exists = current.find((logo) => logo.logoId === logoId && logo.scenario === scenario);
      return exists
        ? current.filter((logo) => !(logo.logoId === logoId && logo.scenario === scenario))
        : [...current, { logoId, scenario, order: current.length }];
    });
  };

  const isLogoSelected = (logoId: string, scenario: string) =>
    defaultLogos.some((logo) => logo.logoId === logoId && logo.scenario === scenario);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const response = await fetch(`/api/partners/${partnerId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ defaultLogos }),
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
        <Alert icon={<IconAlertCircle size={16} />}>
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
        <Text>Default Logos</Text>
      </Breadcrumbs>

      <WorkspaceHeader
        eyebrow="Camera Core"
        title="Manage Default Logos"
        description={`Select logos by scenario that will be automatically assigned to new events under ${partner.name}`}
      />

      <Alert>
        <Text size="sm">
          💡 <strong>Note:</strong> Changes will automatically cascade to all child events marked with 🟢. Events with
          custom logos (🔴) will keep their selections.
        </Text>
      </Alert>

      {availableLogos.length === 0 ? (
        <Card>
          <Stack align="center" gap="sm">
            <Text fz={48}>🎨</Text>
            <Title order={3}>No logos available</Title>
            <Text c="dimmed">Create logos first to assign them as defaults</Text>
          </Stack>
        </Card>
      ) : (
        <Stack gap="lg">
          {scenarios.map((scenario) => (
            <Card key={scenario.id} p={0}>
              <Group justify="space-between" align="center" p="lg" style={{ borderBottom: '1px solid var(--mantine-color-gray-2)' }}>
                <Title order={3}>
                  {scenario.icon} {scenario.name}
                </Title>
                <Badge>
                  {defaultLogos.filter((logo) => logo.scenario === scenario.id).length} selected
                </Badge>
              </Group>
              <SimpleGrid cols={{ base: 2, md: 4, xl: 6 }} spacing="md" p="lg">
                {availableLogos.map((logo) => {
                  const selected = isLogoSelected(logo.logoId, scenario.id);
                  return (
                    <Card
                      key={`${logo.logoId}-${scenario.id}`}
                      withBorder
                      radius="md"
                      bg={selected ? 'blue.0' : 'white'}
                      style={{ cursor: 'pointer' }}
                      onClick={() => handleToggleLogo(logo.logoId, scenario.id)}
                    >
                      <Stack gap="sm" align="center">
                        {selected ? <Badge>✓ Selected</Badge> : null}
                        {logo.thumbnailUrl ? (
                          <Image src={logo.thumbnailUrl} alt={logo.name} width={80} height={80} unoptimized style={{ width: '100%', height: 64, objectFit: 'contain' }} />
                        ) : (
                          <Text fz={32}>🎨</Text>
                        )}
                        <Text size="xs" fw={600} ta="center" lineClamp={2}>
                          {logo.name}
                        </Text>
                      </Stack>
                    </Card>
                  );
                })}
              </SimpleGrid>
            </Card>
          ))}
        </Stack>
      )}

      <Stack gap="sm">
        <Button onClick={handleSave} loading={isSaving}>
          {isSaving ? 'Saving...' : `Save Defaults (${defaultLogos.length} selected)`}
        </Button>
        <Link href={`/admin/partners/${partnerId}`} style={{ textDecoration: 'none' }}>
          <Button variant="default">Cancel</Button>
        </Link>
      </Stack>
    </Stack>
  );
}
