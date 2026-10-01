'use client';

import SemanticButton from '@/components/gds/CameraSemanticButton';
import { Stack, Text } from '@/components/gds/PublicPrimitives';
import { AdminModal, AdminTextarea } from '@sovereignsquad/gds-admin/client';

export interface TryOnPromptFormValue {
  positive: string;
  negative: string;
  reason: string;
}

export default function TryOnRerunPromptModal({
  opened,
  onClose,
  onSubmit,
  value,
  onChange,
  loading,
  error,
  title = 'Rerun with prompt settings',
  savedPrompt,
}: {
  opened: boolean;
  onClose: () => void;
  onSubmit: () => void;
  value: TryOnPromptFormValue;
  onChange: (next: TryOnPromptFormValue) => void;
  loading: boolean;
  error: string | null;
  title?: string;
  savedPrompt?: { positive: string; negative: string; version: number } | null;
}) {
  const hasOverride = Boolean(value.positive.trim() || value.negative.trim());

  return (
    <AdminModal opened={opened} onClose={onClose} title={title} size="lg">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
        style={{ display: 'grid', gap: '1rem' }}
      >
        <Text size="sm">
          Prompt changes apply only to this new rerun. Leave both fields empty to use the selected setup prompt, or keep the saved snapshot when no new setup prompt is selected. The new result still requires human approval.
        </Text>
        {savedPrompt ? (
          <details>
            <summary><Text component="span" size="sm">View saved prompt snapshot (version {savedPrompt.version})</Text></summary>
            <Stack gap="xs" mt="sm">
              <div><Text fw={700} size="sm">Positive</Text><Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>{savedPrompt.positive}</Text></div>
              <div><Text fw={700} size="sm">Negative</Text><Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>{savedPrompt.negative || 'None'}</Text></div>
            </Stack>
          </details>
        ) : null}
        <AdminTextarea
          name="rerunPositivePrompt"
          label="Positive prompt override"
          value={value.positive}
          onChange={(positive) => onChange({ ...value, positive })}
          placeholder="Leave blank to keep the saved positive prompt..."
        />
        <AdminTextarea
          name="rerunNegativePrompt"
          label="Negative prompt override"
          value={value.negative}
          onChange={(negative) => onChange({ ...value, negative })}
          placeholder="Leave blank to keep the saved negative prompt..."
        />
        {hasOverride ? (
          <AdminTextarea
            name="rerunPromptReason"
            label="Why are you changing the prompt?"
            value={value.reason}
            onChange={(reason) => onChange({ ...value, reason })}
            placeholder="Record a short operational reason..."
          />
        ) : null}
        {error ? <p role="alert">{error}</p> : null}
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
          <SemanticButton action="tryon:cancel-prompt-rerun" variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </SemanticButton>
          <SemanticButton
            action="tryon:submit-prompt-rerun"
            type="submit"
            loading={loading}
            disabled={hasOverride && !value.reason.trim()}
          >
            Queue rerun
          </SemanticButton>
        </div>
      </form>
    </AdminModal>
  );
}
