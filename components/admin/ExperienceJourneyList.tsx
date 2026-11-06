'use client';

import type { ReactNode } from 'react';
import { AdminTextInput } from '@sovereignsquad/gds-admin/client';
import { GdsStack, InlineAlert, MetadataText, SectionPanel } from '@sovereignsquad/gds-core/client';
import SemanticButton from '@/components/gds/CameraSemanticButton';
import { useUiLanguage } from '@/components/i18n/UiLanguageProvider';
import { adminOperationText } from '@/lib/i18n/admin-operations';
import styles from './ExperienceJourneyList.module.css';

export interface ExperienceJourneyListRow {
  id: string;
  value: string;
  name: string;
  detail?: string;
  selected: boolean;
  busy?: boolean;
  canSelect?: boolean;
  canEdit?: boolean;
  canRename?: boolean;
  canDelete?: boolean;
  canCustomize?: boolean;
}

interface Props {
  title: string;
  description: string;
  groupName: string;
  actionNamespace: 'experience-template' | 'event-journey';
  rows: ExperienceJourneyListRow[];
  canManage: boolean;
  saving?: boolean;
  renameId?: string | null;
  renameValue?: string;
  deleteId?: string | null;
  onSelect: (value: string) => void;
  onEdit: (id: string) => void;
  onRenameStart: (id: string, name: string) => void;
  onRenameChange: (name: string) => void;
  onRenameSave: (id: string) => void;
  onRenameCancel: () => void;
  onDeleteStart: (id: string) => void;
  onDeleteConfirm: (id: string) => void;
  onDeleteCancel: () => void;
  onCustomize?: () => void;
  emptyMessage: string;
  createForm?: ReactNode;
  listNotice?: ReactNode;
}

/** Shared list-first surface; Global, Partner and Event callers retain their scoped persistence. */
export default function ExperienceJourneyList({
  title, description, groupName, actionNamespace, rows, canManage, saving = false,
  renameId, renameValue = '', deleteId, onSelect, onEdit, onRenameStart,
  onRenameChange, onRenameSave, onRenameCancel, onDeleteStart,
  onDeleteConfirm, onDeleteCancel, onCustomize, emptyMessage, createForm,
  listNotice,
}: Props) {
  const language = useUiLanguage();
  const ui = (text: string) => adminOperationText(text, language);
  const customizeAction = actionNamespace === 'event-journey'
    ? 'event-journey:customize-inherited'
    : 'experience-template:customize-inherited-global';

  return (
    <SectionPanel title={title} description={description}>
      <GdsStack gap="md">
        {listNotice}
        {rows.length > 0 ? (
          <fieldset className={styles.list}>
            <legend className={styles.visuallyHidden}>{title}</legend>
            {rows.map((row) => {
              const rowBusy = saving || Boolean(row.busy);
              const renaming = renameId === row.id;
              const confirmingDelete = deleteId === row.id;
              return (
                <div className={styles.row} key={row.id}>
                  <label className={styles.choice}>
                    <input
                      type="radio"
                      name={groupName}
                      value={row.value}
                      checked={row.selected}
                      disabled={saving || !canManage || row.canSelect === false}
                      onChange={() => onSelect(row.value)}
                    />
                    <span className={styles.copy}>
                      <span className={styles.name}>{row.name}</span>
                      {row.detail ? <span className={styles.detail}>{row.detail}</span> : null}
                    </span>
                  </label>
                  <div className={styles.actions}>
                    {row.selected ? <span className={styles.selected}>{ui('Selected default')}</span> : null}
                    {row.canCustomize && canManage && onCustomize ? (
                      <SemanticButton action={customizeAction} disabled={rowBusy} onClick={onCustomize} />
                    ) : null}
                    {row.canEdit && canManage ? (
                      <SemanticButton action={`${actionNamespace}:edit`} disabled={rowBusy} onClick={() => onEdit(row.id)} />
                    ) : null}
                    {row.canRename && canManage && !renaming ? (
                      <SemanticButton action={`${actionNamespace}:rename`} disabled={rowBusy} onClick={() => onRenameStart(row.id, row.name)} />
                    ) : null}
                    {row.canDelete && canManage && !confirmingDelete ? (
                      <SemanticButton action={`${actionNamespace}:delete`} variant="secondary" disabled={rowBusy || row.selected} onClick={() => onDeleteStart(row.id)} />
                    ) : null}
                  </div>
                  {renaming ? (
                    <div className={styles.inlineForm}>
                      <AdminTextInput name={`journey-name-${row.id}`} label={ui('Journey name')} value={renameValue} onChange={onRenameChange} maxLength={120} />
                      <SemanticButton action={`${actionNamespace}:save-name`} loading={rowBusy} disabled={rowBusy || !renameValue.trim() || renameValue.trim() === row.name} onClick={() => onRenameSave(row.id)} />
                      <SemanticButton action={`${actionNamespace}:cancel-name`} variant="secondary" disabled={rowBusy} onClick={onRenameCancel} />
                    </div>
                  ) : null}
                  {confirmingDelete ? (
                    <div className={styles.deleteForm}>
                      <InlineAlert title={ui('Confirm deletion')} message={ui('This journey can only be deleted after all levels stop using it.')} severity="warning" />
                      <div className={styles.actions}>
                        <SemanticButton action={`${actionNamespace}:confirm-delete`} loading={rowBusy} disabled={rowBusy} onClick={() => onDeleteConfirm(row.id)} />
                        <SemanticButton action={`${actionNamespace}:cancel-delete`} variant="secondary" disabled={rowBusy} onClick={onDeleteCancel} />
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </fieldset>
        ) : <MetadataText>{emptyMessage}</MetadataText>}
        {createForm ? <div className={styles.create}>{createForm}</div> : null}
      </GdsStack>
    </SectionPanel>
  );
}
