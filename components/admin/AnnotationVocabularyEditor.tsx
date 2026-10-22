'use client';

/**
 * The editor for photo rejection reasons (lib/photo-vetting/vocabulary.ts), at the general, partner and event levels. Per reason it lists the options as this level sees them, and a row can
 * change its words, offer or hide the option, move it up or down,
 * follow the level above again, or, for an option this level added, delete it (which hides it for good: it keeps its key and can be restored). The key behind a word never changes: it is what
 * is stored with the photo and what the counters for the analytics are named from, so only the words, the order and whether it is offered can be edited.
 *
 * What a level stores is only what it changed (nothing is copied down); every edit is a pure step from lib/photo-vetting/vocabulary-edit.ts on the draft, and Save sends the draft to
 * `/api/annotation-vocabulary`, which checks it again. The page gives the list as the server loaded it (`initial`); the editor never reads the database.
 */

import { useEffect, useMemo, useState } from 'react';
import { GdsInline, GdsSegmentedControl, GdsStack, InlineAlert, LabelTag, MetadataText, SectionPanel, VisuallyHidden } from '@sovereignsquad/gds-core/client';
import { AdminTextInput } from '@sovereignsquad/gds-admin/client';
import SemanticButton from '@/components/gds/CameraSemanticButton';
import { notifyAdminError, notifyAdminSuccess } from '@/components/admin/notify';
import { GROUPS, MAX_LABEL_LENGTH, VOCAB_GROUPS, counterKey, resolveOver, type EditableLevel, type GroupInfo, type StoredOption, type VocabGroup, type VocabOption } from '@/lib/photo-vetting/vocabulary';
import { addCustom, deleteCustom, isAddedHere, isDeletedHere, moveOption, overridesAbove, resetOption, setHidden, setLabel, sourceOf, type EditContext, type EditResult } from '@/lib/photo-vetting/vocabulary-edit';
import type { LevelView } from '@/lib/photo-vetting/vocabulary-level';

export interface AnnotationVocabularyEditorProps {
  level: EditableLevel;
  /** The Mongo id of the partner or the event, as in the path of its pages; null for the general level. */
  id: string | null;
  /** The level as the server loaded it. */
  initial: LevelView;
}

const INTRO: Record<EditableLevel, string> = {
  general: 'These words are used for every partner and event until one of them changes them. An option you do not change here is the standard one.',
  partner: 'These words are used for all events of this partner. An option you do not change here follows the general level; an event can change its own.',
  event: 'These words are used for this event. An option you do not change here follows the partner, which follows the general level.',
};

const ROW = { alignItems: 'flex-start', borderBottom: '1px solid var(--mantine-color-default-border)', display: 'flex', flexWrap: 'wrap', gap: '0.75rem', padding: '0.75rem 0' } as const;

const groupFacts = (info: GroupInfo): string =>
  [
    info.required ? (info.about === 'person' ? 'Required: a person cannot be saved without it' : 'Required: a photo cannot be rejected without it') : 'Optional',
    info.multiple ? 'Several can be chosen' : 'One can be chosen',
    info.about === 'person' ? 'Asked for each person' : 'Asked once for the photo',
  ].join(' · ');

const rowId = (option: { group: VocabGroup; key: string }) => `${option.group}:${option.key}`;
const without = <T,>(record: Record<string, T>, key: string): Record<string, T> => Object.fromEntries(Object.entries(record).filter(([name]) => name !== key));

export default function AnnotationVocabularyEditor({ level, id, initial }: AnnotationVocabularyEditorProps) {
  const [saved, setSaved] = useState<LevelView>(initial);
  const [draft, setDraft] = useState<StoredOption[]>(initial.stored.options);
  const [busy, setBusy] = useState(false);
  /** The words as typed in a row that is being edited (kept as typed until the row is left), and what is wrong with them. */
  const [typed, setTyped] = useState<Record<string, string>>({});
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [groupProblems, setGroupProblems] = useState<Partial<Record<VocabGroup, string>>>({});
  const [adding, setAdding] = useState<Partial<Record<VocabGroup, string>>>({});
  const [showDeleted, setShowDeleted] = useState<Partial<Record<VocabGroup, boolean>>>({});

  const ctx: EditContext = useMemo(() => ({ level, parent: saved.parent }), [level, saved.parent]);
  const resolved = useMemo(() => resolveOver(saved.parent, level, { options: draft }), [saved.parent, level, draft]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved.stored.options);
  const hasErrors = Object.keys(rowErrors).length > 0;

  // An unsaved change is not lost by closing the tab by accident.
  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const apply = (result: EditResult, group: VocabGroup): boolean => {
    setGroupProblems((current) => ({ ...current, [group]: result.ok ? undefined : result.reason }));
    if (result.ok) setDraft(result.options);
    return result.ok;
  };

  const editLabel = (option: VocabOption, value: string) => {
    const key = rowId(option);
    setTyped((current) => ({ ...current, [key]: value }));
    const result = setLabel(ctx, draft, option.group, option.key, value);
    if (result.ok) setDraft(result.options);
    setRowErrors((current) => (result.ok ? without(current, key) : { ...current, [key]: result.reason }));
  };

  /** Leaving a row shows the words as they are kept (trimmed), or the last good words when what was typed could not be kept. */
  const leaveLabel = (option: VocabOption) => {
    const key = rowId(option);
    setTyped((current) => without(current, key));
    setRowErrors((current) => without(current, key));
  };

  const addOption = (group: VocabGroup) => {
    if (apply(addCustom(ctx, draft, group, adding[group] ?? ''), group)) setAdding((current) => ({ ...current, [group]: '' }));
  };

  const discard = () => {
    setDraft(saved.stored.options);
    setTyped({});
    setRowErrors({});
    setGroupProblems({});
  };

  const save = async () => {
    setBusy(true);
    try {
      const query = new URLSearchParams({ level, ...(id ? { id } : {}) });
      const response = await fetch(`/api/annotation-vocabulary?${query.toString()}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ level, ...(id ? { id } : {}), options: draft }),
      });
      const payload = (await response.json().catch(() => null)) as { data?: LevelView; error?: string } | null;
      if (!response.ok || !payload?.data) throw new Error(payload?.error || `Request failed (${response.status})`);
      setSaved(payload.data);
      setDraft(payload.data.stored.options);
      setTyped({});
      setRowErrors({});
      setGroupProblems({});
      notifyAdminSuccess({ title: 'Saved', message: 'The words are saved. A vetting screen that is already open shows them the next time it loads.' });
    } catch (failure) {
      notifyAdminError({ title: 'Not saved', message: failure instanceof Error ? failure.message : 'The words could not be saved.' });
    } finally {
      setBusy(false);
    }
  };

  const actionBar = (
    <GdsInline gap="md" align="center">
      <SemanticButton action="annotation-words:save" loading={busy} disabled={busy || !dirty || hasErrors} onClick={() => void save()}>
        Save
      </SemanticButton>
      <SemanticButton action="annotation-words:discard" variant="secondary" disabled={busy || !dirty} onClick={discard}>
        Discard the changes
      </SemanticButton>
      <MetadataText>{hasErrors ? 'Fix the words marked below before saving.' : dirty ? 'You have changes that are not saved.' : 'Everything is saved.'}</MetadataText>
    </GdsInline>
  );

  return (
    <GdsStack gap="lg">
      <MetadataText>
        {INTRO[level]} Nothing is copied: this level stores only what you change. Each option has a key that never changes (it is what is saved with a photo and what the analytics counters are named from), so a photo
        already marked with an option keeps its meaning. Delete hides an option you added; it can be restored.
      </MetadataText>
      {actionBar}

      {VOCAB_GROUPS.filter((group) => group === 'reject_reason').map((group) => {
        const info = GROUPS[group];
        const inGroup = resolved.options.filter((option) => option.group === group);
        const main = inGroup.filter((option) => !isDeletedHere(ctx, option));
        const deleted = inGroup.filter((option) => isDeletedHere(ctx, option));
        const problem = groupProblems[group];
        return (
          <SectionPanel key={group} id={`words-${group}`} title={info.label} description={`${info.question}. ${groupFacts(info)}.`}>
            <GdsStack gap="sm">
              {problem ? <InlineAlert title="Not changed" message={problem} severity="error" /> : null}

              <div data-vocabulary-group={group}>
                {main.map((option, index) => {
                  const key = rowId(option);
                  const added = isAddedHere(ctx, option);
                  const source = sourceOf(ctx, option);
                  return (
                    <div key={key} style={ROW} data-vocabulary-option={key} data-offered={option.active ? 'yes' : 'no'}>
                      <div style={{ display: 'grid', flex: '1 1 14rem', gap: '0.25rem', minWidth: 0 }}>
                        <AdminTextInput
                          name={`label-${key}`}
                          label={<VisuallyHidden>{`Words for ${option.label}`}</VisuallyHidden>}
                          value={typed[key] ?? option.label}
                          onChange={(value) => editLabel(option, value)}
                          onBlur={() => leaveLabel(option)}
                          error={rowErrors[key]}
                          maxLength={MAX_LABEL_LENGTH}
                          disabled={busy}
                        />
                        <GdsInline gap="xs" align="center">
                          <LabelTag tone={source === 'Standard' ? 'neutral' : added ? 'success' : 'info'} label={source} />
                          {option.active ? null : <LabelTag tone="warning" label="Hidden" />}
                          <MetadataText>{counterKey(option.group, option.key)}</MetadataText>
                        </GdsInline>
                      </div>
                      <GdsInline gap="sm" align="center">
                        {added ? null : (
                          <GdsSegmentedControl<'offered' | 'hidden'>
                            value={option.active ? 'offered' : 'hidden'}
                            onChange={(next) => apply(setHidden(ctx, draft, group, option.key, next === 'hidden'), group)}
                            options={[
                              { value: 'offered', label: 'Offered' },
                              { value: 'hidden', label: 'Hidden' },
                            ]}
                            ariaLabel={`Offered to the reviewer: ${option.label}`}
                            disabled={busy}
                          />
                        )}
                        <SemanticButton action="annotation-words:up" variant="secondary" size="xs" aria-label={`Move ${option.label} up`} disabled={busy || index === 0} onClick={() => apply(moveOption(ctx, draft, group, option.key, 'up'), group)}>
                          Up
                        </SemanticButton>
                        <SemanticButton action="annotation-words:down" variant="secondary" size="xs" aria-label={`Move ${option.label} down`} disabled={busy || index === main.length - 1} onClick={() => apply(moveOption(ctx, draft, group, option.key, 'down'), group)}>
                          Down
                        </SemanticButton>
                        {overridesAbove(ctx, draft, group, option.key) ? (
                          <SemanticButton action="annotation-words:follow-above" variant="secondary" size="xs" aria-label={`${option.label}: follow the level above`} disabled={busy} onClick={() => apply(resetOption(ctx, draft, group, option.key), group)}>
                            Follow the level above
                          </SemanticButton>
                        ) : null}
                        {added ? (
                          <SemanticButton action="annotation-words:delete" variant="danger" size="xs" aria-label={`Delete ${option.label}`} disabled={busy} onClick={() => apply(deleteCustom(ctx, draft, group, option.key), group)}>
                            Delete
                          </SemanticButton>
                        ) : null}
                      </GdsInline>
                    </div>
                  );
                })}
              </div>

              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  addOption(group);
                }}
              >
                <GdsInline gap="sm" align="end">
                  <div style={{ flex: '1 1 14rem', minWidth: 0 }}>
                    <AdminTextInput name={`add-${group}`} label={`Add an option to ${info.label}`} placeholder="e.g. Club scarf" value={adding[group] ?? ''} onChange={(value) => setAdding((current) => ({ ...current, [group]: value }))} maxLength={MAX_LABEL_LENGTH} disabled={busy} />
                  </div>
                  <SemanticButton action="annotation-words:add" type="submit" variant="secondary" disabled={busy || !(adding[group] ?? '').trim()}>
                    Add option
                  </SemanticButton>
                </GdsInline>
              </form>

              {deleted.length > 0 ? (
                <GdsStack gap="xs">
                  <GdsInline gap="sm" align="center">
                    <MetadataText>{`${deleted.length} deleted`}</MetadataText>
                    {showDeleted[group] ? (
                      <SemanticButton action="annotation-words:hide-deleted" variant="secondary" size="xs" onClick={() => setShowDeleted((current) => ({ ...current, [group]: false }))}>
                        Hide deleted
                      </SemanticButton>
                    ) : (
                      <SemanticButton action="annotation-words:show-deleted" variant="secondary" size="xs" onClick={() => setShowDeleted((current) => ({ ...current, [group]: true }))}>
                        Show deleted
                      </SemanticButton>
                    )}
                  </GdsInline>
                  {showDeleted[group]
                    ? deleted.map((option) => (
                        <div key={rowId(option)} style={ROW} data-vocabulary-deleted={rowId(option)}>
                          <div style={{ display: 'grid', flex: '1 1 14rem', gap: '0.25rem', minWidth: 0, overflowWrap: 'anywhere' }}>
                            <strong>{option.label}</strong>
                            <GdsInline gap="xs" align="center">
                              <LabelTag tone="warning" label="Deleted" />
                              <MetadataText>{counterKey(option.group, option.key)}</MetadataText>
                            </GdsInline>
                          </div>
                          <SemanticButton action="annotation-words:restore" variant="secondary" size="xs" aria-label={`Restore ${option.label}`} disabled={busy} onClick={() => apply(setHidden(ctx, draft, group, option.key, false), group)}>
                            Restore
                          </SemanticButton>
                        </div>
                      ))
                    : null}
                </GdsStack>
              ) : null}
            </GdsStack>
          </SectionPanel>
        );
      })}

      {actionBar}
    </GdsStack>
  );
}
