'use client';

import { useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Grid,
  Group,
  Stack,
  Text,
  TextInput,
  Textarea,
  Title,
} from '@/components/gds/ui';
import { IconAlertCircle, IconCheck } from '@tabler/icons-react';

export interface TryOnSuitAdminRow {
  leatherSuitId: string;
  name: string;
  category: 'motogp_full_body_leather';
  assetKey: string;
  assetVersion: number;
  assetRelativePath?: string | null;
  previewUrl?: string | null;
  sourceImageUrl?: string | null;
  active: boolean;
  metadata?: {
    notes?: string | null;
  };
}

interface Props {
  initialRows: TryOnSuitAdminRow[];
}

interface SuitDraft {
  leatherSuitId: string;
  name: string;
  assetKey: string;
  assetVersion: string;
  assetRelativePath: string;
  previewUrl: string;
  sourceImageUrl: string;
  notes: string;
  active: boolean;
}

const EMPTY_DRAFT: SuitDraft = {
  leatherSuitId: '',
  name: '',
  assetKey: '',
  assetVersion: '1',
  assetRelativePath: '',
  previewUrl: '',
  sourceImageUrl: '',
  notes: '',
  active: true,
};

function toDraft(row: TryOnSuitAdminRow): SuitDraft {
  return {
    leatherSuitId: row.leatherSuitId,
    name: row.name,
    assetKey: row.assetKey,
    assetVersion: String(row.assetVersion || 1),
    assetRelativePath: row.assetRelativePath || '',
    previewUrl: row.previewUrl || '',
    sourceImageUrl: row.sourceImageUrl || '',
    notes: row.metadata?.notes || '',
    active: row.active,
  };
}

export default function TryOnSuitCatalogManager({ initialRows }: Props) {
  const [rows, setRows] = useState(initialRows);
  const [createDraft, setCreateDraft] = useState<SuitDraft>(EMPTY_DRAFT);
  const [editing, setEditing] = useState<Record<string, SuitDraft>>(
    Object.fromEntries(initialRows.map((row) => [row.leatherSuitId, toDraft(row)]))
  );
  const [submittingCreate, setSubmittingCreate] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const updateDraft = (id: string, patch: Partial<SuitDraft>) => {
    setEditing((current) => ({
      ...current,
      [id]: {
        ...current[id],
        ...patch,
      },
    }));
  };

  const saveCreate = async () => {
    setSubmittingCreate(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch('/api/admin/tryon-suits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leatherSuitId: createDraft.leatherSuitId,
          name: createDraft.name,
          assetKey: createDraft.assetKey,
          assetVersion: Number(createDraft.assetVersion),
          assetRelativePath: createDraft.assetRelativePath,
          previewUrl: createDraft.previewUrl,
          sourceImageUrl: createDraft.sourceImageUrl,
          notes: createDraft.notes,
          active: createDraft.active,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to create leather suit.');
      }
      const saved = payload.suit as TryOnSuitAdminRow;
      setRows((current) => [saved, ...current.filter((row) => row.leatherSuitId !== saved.leatherSuitId)]);
      setEditing((current) => ({ ...current, [saved.leatherSuitId]: toDraft(saved) }));
      setCreateDraft(EMPTY_DRAFT);
      setMessage('Leather suit saved.');
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Failed to create leather suit.');
    } finally {
      setSubmittingCreate(false);
    }
  };

  const saveEdit = async (id: string) => {
    const draft = editing[id];
    if (!draft) return;
    setSavingId(id);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`/api/admin/tryon-suits/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: draft.name,
          assetKey: draft.assetKey,
          assetVersion: Number(draft.assetVersion),
          assetRelativePath: draft.assetRelativePath,
          previewUrl: draft.previewUrl,
          sourceImageUrl: draft.sourceImageUrl,
          notes: draft.notes,
          active: draft.active,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to update leather suit.');
      }
      const saved = payload.suit as TryOnSuitAdminRow;
      setRows((current) => current.map((row) => (row.leatherSuitId === id ? saved : row)));
      setEditing((current) => ({ ...current, [saved.leatherSuitId]: toDraft(saved) }));
      setMessage(`Saved ${saved.name}.`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to update leather suit.');
    } finally {
      setSavingId(null);
    }
  };

  return (
    <Stack gap="xl">
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

      <Card>
        <Stack gap="lg">
          <div>
            <Title order={3}>Add Leather Jersey</Title>
            <Text size="sm" c="dimmed" mt="xs">
              Camera manages the public catalog, preview image, and local asset mapping. The actual processing asset must
              also exist in the try-on app under the configured suit asset root.
            </Text>
          </div>
          <SuitFields draft={createDraft} onChange={(patch) => setCreateDraft((current) => ({ ...current, ...patch }))} />
          <Group justify="flex-end">
            <Button onClick={() => void saveCreate()} loading={submittingCreate}>
              Add Leather Jersey
            </Button>
          </Group>
        </Stack>
      </Card>

      <Stack gap="lg">
        {rows.map((row) => {
          const draft = editing[row.leatherSuitId] ?? toDraft(row);
          return (
            <Card key={row.leatherSuitId}>
              <Stack gap="lg">
                <Group justify="space-between" align="flex-start">
                  <div>
                    <Title order={4}>{row.name}</Title>
                    <Text size="sm" c="dimmed" ff="monospace">
                      {row.leatherSuitId}
                    </Text>
                  </div>
                  <Checkbox
                    checked={draft.active}
                    label="Active"
                    onChange={(event) => updateDraft(row.leatherSuitId, { active: event.currentTarget.checked })}
                  />
                </Group>
                <SuitFields draft={draft} onChange={(patch) => updateDraft(row.leatherSuitId, patch)} disableId />
                <Group justify="flex-end">
                  <Button onClick={() => void saveEdit(row.leatherSuitId)} loading={savingId === row.leatherSuitId}>
                    Save Changes
                  </Button>
                </Group>
              </Stack>
            </Card>
          );
        })}
      </Stack>
    </Stack>
  );
}

function SuitFields({
  draft,
  onChange,
  disableId = false,
}: {
  draft: SuitDraft;
  onChange: (patch: Partial<SuitDraft>) => void;
  disableId?: boolean;
}) {
  return (
    <Grid>
      <Grid.Col span={{ base: 12, md: 6 }}>
        <TextInput
          label="Catalog ID"
          placeholder="motogp_honda_castrol_2026_v1"
          value={draft.leatherSuitId}
          disabled={disableId}
          onChange={(event) => onChange({ leatherSuitId: event.currentTarget.value })}
        />
      </Grid.Col>
      <Grid.Col span={{ base: 12, md: 6 }}>
        <TextInput
          label="Display Name"
          placeholder="Honda Castrol 2026"
          value={draft.name}
          onChange={(event) => onChange({ name: event.currentTarget.value })}
        />
      </Grid.Col>
      <Grid.Col span={{ base: 12, md: 6 }}>
        <TextInput
          label="Asset Key"
          placeholder="motogp_honda_castrol_2026"
          value={draft.assetKey}
          onChange={(event) => onChange({ assetKey: event.currentTarget.value })}
        />
      </Grid.Col>
      <Grid.Col span={{ base: 12, md: 6 }}>
        <TextInput
          label="Asset Version"
          placeholder="1"
          value={draft.assetVersion}
          onChange={(event) => onChange({ assetVersion: event.currentTarget.value })}
        />
      </Grid.Col>
      <Grid.Col span={12}>
        <TextInput
          label="Local Asset Relative Path"
          placeholder="motogp/honda-castrol-2026.png"
          value={draft.assetRelativePath}
          onChange={(event) => onChange({ assetRelativePath: event.currentTarget.value })}
        />
      </Grid.Col>
      <Grid.Col span={{ base: 12, md: 6 }}>
        <TextInput
          label="Preview Image URL"
          placeholder="https://..."
          value={draft.previewUrl}
          onChange={(event) => onChange({ previewUrl: event.currentTarget.value })}
        />
      </Grid.Col>
      <Grid.Col span={{ base: 12, md: 6 }}>
        <TextInput
          label="Source Image URL"
          placeholder="https://..."
          value={draft.sourceImageUrl}
          onChange={(event) => onChange({ sourceImageUrl: event.currentTarget.value })}
        />
      </Grid.Col>
      <Grid.Col span={12}>
        <Textarea
          label="Notes"
          rows={3}
          value={draft.notes}
          onChange={(event) => onChange({ notes: event.currentTarget.value })}
        />
      </Grid.Col>
    </Grid>
  );
}
