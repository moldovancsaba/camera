'use client';

import { useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  Grid,
  Group,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { IconAlertCircle, IconCheck, IconUserPlus } from '@tabler/icons-react';

type PartnerAppKey = 'events';
type PartnerAccessRole = 'viewer' | 'manager' | 'admin';

export interface PartnerAccessAssignmentView {
  accessId: string;
  partnerId: string;
  partnerName: string;
  userId?: string | null;
  userEmail: string;
  userName?: string | null;
  appKey: PartnerAppKey;
  role: PartnerAccessRole;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface Props {
  partnerMongoId: string;
  initialAssignments: PartnerAccessAssignmentView[];
}

const APP_LABELS: Record<PartnerAppKey, string> = {
  events: 'Events App',
};

const ROLE_LABELS: Record<PartnerAccessRole, string> = {
  viewer: 'Viewer',
  manager: 'Manager',
  admin: 'Admin',
};

export default function PartnerUserAccessManager({
  partnerMongoId,
  initialAssignments,
}: Props) {
  const [assignments, setAssignments] = useState(initialAssignments);
  const [userEmail, setUserEmail] = useState('');
  const [userName, setUserName] = useState('');
  const [appKey, setAppKey] = useState<PartnerAppKey>('events');
  const [role, setRole] = useState<PartnerAccessRole>('manager');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    setIsSubmitting(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch(`/api/partners/${partnerMongoId}/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userEmail,
          userName,
          appKey,
          role,
          isActive: true,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload.error || 'Failed to create partner access assignment.');
      }
      const assignment = payload.assignment as PartnerAccessAssignmentView;
      setAssignments((current) => {
        const deduped = current.filter((item) => item.accessId !== assignment.accessId);
        return [assignment, ...deduped].sort(
          (a, b) => Number(b.isActive) - Number(a.isActive) || a.userEmail.localeCompare(b.userEmail)
        );
      });
      setUserEmail('');
      setUserName('');
      setAppKey('events');
      setRole('manager');
      setMessage('Partner access saved.');
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Failed to save partner access.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function patchAssignment(
    accessId: string,
    patch: Partial<Pick<PartnerAccessAssignmentView, 'appKey' | 'role' | 'isActive' | 'userName'>>
  ) {
    setMessage(null);
    setError(null);
    try {
      const res = await fetch(`/api/partners/${partnerMongoId}/users/${accessId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload.error || 'Failed to update partner access.');
      }
      const assignment = payload.assignment as PartnerAccessAssignmentView;
      setAssignments((current) => current.map((item) => (item.accessId === accessId ? assignment : item)));
      setMessage('Partner access updated.');
    } catch (patchError) {
      setError(patchError instanceof Error ? patchError.message : 'Failed to update partner access.');
    }
  }

  async function removeAssignment(accessId: string) {
    setMessage(null);
    setError(null);
    try {
      const res = await fetch(`/api/partners/${partnerMongoId}/users/${accessId}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload.error || 'Failed to remove partner access.');
      }
      setAssignments((current) => current.filter((item) => item.accessId !== accessId));
      setMessage('Partner access removed.');
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Failed to remove partner access.');
    }
  }

  return (
    <Card p={0}>
      <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--mantine-color-gray-2)' }}>
        <Title order={3}>Partner User Access</Title>
        <Text size="sm" c="dimmed" mt="xs">
          Manage partner-scoped app access separately from global Camera roles. This is the source of truth for who
          can operate this partner inside Events.
        </Text>
      </div>

      <Stack gap="lg" p="xl">
        <Grid>
          <Grid.Col span={{ base: 12, xl: 5 }}>
            <TextInput
              label="User email"
              placeholder="user@example.com"
              value={userEmail}
              onChange={(event) => setUserEmail(event.currentTarget.value)}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, md: 4, xl: 3 }}>
            <TextInput
              label="Display name"
              placeholder="Optional"
              value={userName}
              onChange={(event) => setUserName(event.currentTarget.value)}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, md: 4, xl: 2 }}>
            <Select label="App" data={[{ value: 'events', label: 'Events App' }]} value={appKey} readOnly />
          </Grid.Col>
          <Grid.Col span={{ base: 12, md: 4, xl: 2 }}>
            <Select
              label="Role"
              data={[
                { value: 'viewer', label: 'Viewer' },
                { value: 'manager', label: 'Manager' },
                { value: 'admin', label: 'Admin' },
              ]}
              value={role}
              onChange={(value) => setRole((value as PartnerAccessRole) || 'manager')}
            />
          </Grid.Col>
        </Grid>

        <Group justify="space-between" align="flex-start">
          <Text size="xs" c="dimmed" maw={760}>
            If the user has not appeared in Camera yet, the email assignment is still saved and will match later when
            they sign in or create activity.
          </Text>
          <Button
            color="amber"
            leftSection={<IconUserPlus size={16} />}
            onClick={() => void handleCreate()}
            loading={isSubmitting}
            disabled={!userEmail.trim()}
          >
            Add Access
          </Button>
        </Group>

        {message ? (
          <Alert color="green" icon={<IconCheck size={16} />}>
            {message}
          </Alert>
        ) : null}
        {error ? (
          <Alert color="red" icon={<IconAlertCircle size={16} />}>
            {error}
          </Alert>
        ) : null}

        {assignments.length === 0 ? (
          <Card withBorder radius="md" p="xl" bg="var(--mantine-color-gray-0)">
            <Text size="sm" c="dimmed" ta="center">
              No partner user assignments yet.
            </Text>
          </Card>
        ) : (
          <Stack gap="md">
            {assignments.map((assignment) => (
              <Card key={assignment.accessId} withBorder radius="md" bg="var(--mantine-color-gray-0)">
                <SimpleGrid cols={{ base: 1, xl: 2 }} spacing="lg">
                  <Stack gap={4}>
                    <Group gap="sm">
                      <Text fw={700}>{assignment.userName?.trim() || assignment.userEmail}</Text>
                      <Badge color={assignment.isActive ? 'green' : 'gray'}>
                        {assignment.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </Group>
                    <Text size="sm" c="dimmed">
                      {assignment.userEmail}
                    </Text>
                    <Text size="xs" c="dimmed">
                      Updated {new Date(assignment.updatedAt).toLocaleString()}
                    </Text>
                  </Stack>

                  <Stack gap="sm">
                    <SimpleGrid cols={{ base: 1, md: 3 }}>
                      <Select
                        data={Object.entries(APP_LABELS).map(([value, label]) => ({ value, label }))}
                        value={assignment.appKey}
                        onChange={(value) =>
                          void patchAssignment(assignment.accessId, { appKey: value as PartnerAppKey })
                        }
                      />
                      <Select
                        data={Object.entries(ROLE_LABELS).map(([value, label]) => ({ value, label }))}
                        value={assignment.role}
                        onChange={(value) =>
                          void patchAssignment(assignment.accessId, { role: value as PartnerAccessRole })
                        }
                      />
                      <Group grow>
                        <Button
                          variant={assignment.isActive ? 'light' : 'filled'}
                          color={assignment.isActive ? 'gray' : 'green'}
                          onClick={() =>
                            void patchAssignment(assignment.accessId, { isActive: !assignment.isActive })
                          }
                        >
                          {assignment.isActive ? 'Deactivate' : 'Activate'}
                        </Button>
                        <Button color="red" variant="light" onClick={() => void removeAssignment(assignment.accessId)}>
                          Remove
                        </Button>
                      </Group>
                    </SimpleGrid>
                  </Stack>
                </SimpleGrid>
              </Card>
            ))}
          </Stack>
        )}
      </Stack>
    </Card>
  );
}
