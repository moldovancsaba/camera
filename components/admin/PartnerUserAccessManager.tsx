'use client';

import { useState } from 'react';
import { InlineAlert, LabelTag, SemanticButton, StateBlock } from '@doneisbetter/gds-core/client';

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
  events: 'Events',
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
    <section style={{ border: '1px solid var(--gds-color-border)', borderRadius: '1rem', overflow: 'hidden' }}>
      <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--gds-color-border)' }}>
        <h3 style={{ margin: 0 }}>Partner User Access</h3>
        <p style={{ color: 'var(--gds-color-muted)', fontSize: '0.875rem', margin: '0.5rem 0 0' }}>
          Manage partner-scoped app access separately from global Camera roles. This is the source of truth for who
          can operate this partner inside Events.
        </p>
      </div>

      <div style={{ display: 'grid', gap: '1.5rem', padding: '1.5rem' }}>
        <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))' }}>
            <label style={{ display: 'grid', gap: '0.35rem', fontWeight: 700 }}>
              User email
              <input
              placeholder="user@example.com"
              value={userEmail}
              onChange={(event) => setUserEmail(event.currentTarget.value)}
              style={{ minHeight: 44, padding: '0 0.75rem' }}
            />
            </label>
            <label style={{ display: 'grid', gap: '0.35rem', fontWeight: 700 }}>
              Display name
              <input
              placeholder="Optional"
              value={userName}
              onChange={(event) => setUserName(event.currentTarget.value)}
              style={{ minHeight: 44, padding: '0 0.75rem' }}
            />
            </label>
            <label style={{ display: 'grid', gap: '0.35rem', fontWeight: 700 }}>
              App
              <select value={appKey} disabled style={{ minHeight: 44, padding: '0 0.75rem' }}>
                <option value="events">Events</option>
              </select>
            </label>
            <label style={{ display: 'grid', gap: '0.35rem', fontWeight: 700 }}>
              Role
              <select
              value={role}
              onChange={(event) => setRole((event.currentTarget.value as PartnerAccessRole) || 'manager')}
              style={{ minHeight: 44, padding: '0 0.75rem' }}
            >
                <option value="viewer">Viewer</option>
                <option value="manager">Manager</option>
                <option value="admin">Admin</option>
              </select>
            </label>
        </div>

        <div style={{ alignItems: 'flex-start', display: 'flex', flexWrap: 'wrap', gap: '1rem', justifyContent: 'space-between' }}>
          <p style={{ color: 'var(--gds-color-muted)', fontSize: '0.75rem', margin: 0, maxWidth: 760 }}>
            If the user has not appeared in Camera yet, the email assignment is still saved and will match later when
            they sign in or create activity.
          </p>
          <SemanticButton
            action="partner-users:add-access"
            onClick={() => void handleCreate()}
            loading={isSubmitting}
            disabled={!userEmail.trim()}
          >
            Add Access
          </SemanticButton>
        </div>

        {message ? (
          <InlineAlert title="Partner access updated" message={message} severity="success" />
        ) : null}
        {error ? (
          <InlineAlert title="Partner access failed" message={error} severity="error" />
        ) : null}

        {assignments.length === 0 ? (
          <StateBlock variant="empty" title="No partner user assignments yet" />
        ) : (
          <div style={{ display: 'grid', gap: '1rem' }}>
            {assignments.map((assignment) => (
              <article key={assignment.accessId} style={{ border: '1px solid var(--gds-color-border)', borderRadius: '0.875rem', padding: '1rem' }}>
                <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))' }}>
                  <div style={{ display: 'grid', gap: '0.25rem' }}>
                    <div style={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                      <strong>{assignment.userName?.trim() || assignment.userEmail}</strong>
                      <LabelTag tone={assignment.isActive ? 'success' : 'neutral'} label={assignment.isActive ? 'Active' : 'Inactive'} />
                    </div>
                    <span style={{ color: 'var(--gds-color-muted)', fontSize: '0.875rem' }}>
                      {assignment.userEmail}
                    </span>
                    <span style={{ color: 'var(--gds-color-muted)', fontSize: '0.75rem' }}>
                      Updated {new Date(assignment.updatedAt).toLocaleString()}
                    </span>
                  </div>

                  <div style={{ display: 'grid', gap: '0.75rem' }}>
                    <div style={{ display: 'grid', gap: '0.75rem', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 140px), 1fr))' }}>
                      <select
                        value={assignment.appKey}
                        onChange={(event) =>
                          void patchAssignment(assignment.accessId, { appKey: event.currentTarget.value as PartnerAppKey })
                        }
                        style={{ minHeight: 40, padding: '0 0.75rem' }}
                      >
                        {Object.entries(APP_LABELS).map(([value, label]) => (
                          <option key={value} value={value}>{label}</option>
                        ))}
                      </select>
                      <select
                        value={assignment.role}
                        onChange={(event) =>
                          void patchAssignment(assignment.accessId, { role: event.currentTarget.value as PartnerAccessRole })
                        }
                        style={{ minHeight: 40, padding: '0 0.75rem' }}
                      >
                        {Object.entries(ROLE_LABELS).map(([value, label]) => (
                          <option key={value} value={value}>{label}</option>
                        ))}
                      </select>
                      <div style={{ display: 'grid', gap: '0.5rem', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))' }}>
                        <SemanticButton
                          action={assignment.isActive ? 'partner-users:deactivate' : 'partner-users:activate'}
                          variant="secondary"
                          onClick={() =>
                            void patchAssignment(assignment.accessId, { isActive: !assignment.isActive })
                          }
                        >
                          {assignment.isActive ? 'Deactivate' : 'Activate'}
                        </SemanticButton>
                        <SemanticButton action="partner-users:remove" variant="danger" onClick={() => void removeAssignment(assignment.accessId)}>
                          Remove
                        </SemanticButton>
                      </div>
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
