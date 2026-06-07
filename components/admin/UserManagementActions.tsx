'use client';

import SemanticButton from '@/components/gds/CameraSemanticButton';
/**
 * User Management Actions Component
 */

import { useState } from 'react';
import { InlineAlert } from '@doneisbetter/gds-core/client';

interface UserManagementActionsProps {
  user: {
    email: string;
    name: string;
    type: 'administrator' | 'real' | 'pseudo' | 'anonymous';
    role?: string;
    isActive?: boolean;
    mergedWith?: string;
  };
  currentUserEmail: string;
}

export default function UserManagementActions({ user, currentUserEmail }: UserManagementActionsProps) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showMergeDialog, setShowMergeDialog] = useState(false);
  const [realUserEmail, setRealUserEmail] = useState('');

  if (user.type === 'anonymous') {
    return null;
  }

  const isSelf = user.email === currentUserEmail;
  const isActive = user.isActive !== false;

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 5000);
  };

  const toggleRole = async () => {
    if (isSelf && user.role === 'admin') {
      showMessage('error', 'Cannot demote yourself from admin');
      return;
    }

    setLoading(true);
    try {
      const newRole = user.role === 'admin' ? 'user' : 'admin';
      const response = await fetch(`/api/admin/users/${encodeURIComponent(user.email)}/role`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      });

      const data = await response.json();
      if (response.ok) {
        showMessage('success', data.message);
        setTimeout(() => window.location.reload(), 1500);
      } else {
        showMessage('error', data.error || 'Failed to update role');
      }
    } catch {
      showMessage('error', 'Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const toggleStatus = async () => {
    if (isSelf && isActive) {
      showMessage('error', 'Cannot deactivate yourself');
      return;
    }

    setLoading(true);
    try {
      const newStatus = !isActive;
      const response = await fetch(`/api/admin/users/${encodeURIComponent(user.email)}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          isActive: newStatus,
          userType: user.type,
        }),
      });

      const data = await response.json();
      if (response.ok) {
        showMessage('success', data.message);
        setTimeout(() => window.location.reload(), 1500);
      } else {
        showMessage('error', data.error || 'Failed to update status');
      }
    } catch {
      showMessage('error', 'Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleMerge = async () => {
    if (!realUserEmail) {
      showMessage('error', 'Please enter a real user email');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/admin/users/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pseudoEmail: user.email,
          realUserEmail,
        }),
      });

      const data = await response.json();
      if (response.ok) {
        showMessage('success', data.message);
        setShowMergeDialog(false);
        setTimeout(() => window.location.reload(), 1500);
      } else {
        showMessage('error', data.error || 'Failed to merge users');
      }
    } catch {
      showMessage('error', 'Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'grid', gap: 'var(--gds-space-2, 0.5rem)' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--gds-space-2, 0.5rem)' }}>
        {(user.type === 'real' || user.type === 'administrator') ? (
          <SemanticButton
            action={user.role === 'admin' ? 'users:demote' : 'users:promote'}
            size="xs"
            variant="secondary"
            onClick={() => void toggleRole()}
            disabled={loading || (isSelf && user.role === 'admin')}
          >
            {user.role === 'admin' ? 'Demote to User' : 'Promote to Admin'}
          </SemanticButton>
        ) : null}

        <SemanticButton
          action={isActive ? 'users:deactivate' : 'users:activate'}
          size="xs"
          variant={isActive ? 'danger' : 'secondary'}
          onClick={() => void toggleStatus()}
          disabled={loading || (isSelf && isActive)}
        >
          {isActive ? 'Deactivate' : 'Activate'}
        </SemanticButton>

        {user.type === 'pseudo' && !user.mergedWith ? (
          <SemanticButton action="users:merge" size="xs" variant="secondary" onClick={() => setShowMergeDialog(true)} disabled={loading}>
            Merge with Real User
          </SemanticButton>
        ) : null}
      </div>

      {message ? (
        <InlineAlert
          title={message.type === 'success' ? 'User update complete' : 'User update failed'}
          message={message.text}
          severity={message.type === 'success' ? 'success' : 'error'}
        />
      ) : null}

      {showMergeDialog ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="merge-pseudo-user-title"
          style={{
            background: 'var(--gds-color-overlay)',
            inset: 0,
            display: 'grid',
            placeItems: 'center',
            padding: '1rem',
            position: 'fixed',
            zIndex: 1000,
          }}
        >
          <div
            style={{
              background: 'var(--gds-color-surface)',
              border: '1px solid var(--gds-color-border)',
              borderRadius: 'var(--gds-radius-lg, 1rem)',
              boxShadow: 'var(--gds-shadow-xl))',
              display: 'grid',
              gap: '1rem',
              maxWidth: 520,
              padding: '1.25rem',
              width: '100%',
            }}
          >
            <h2 id="merge-pseudo-user-title" style={{ margin: 0 }}>Merge Pseudo User with Real User</h2>
            <label style={{ display: 'grid', gap: '0.35rem', fontWeight: 700 }}>
              Pseudo User Email
              <input value={user.email} disabled style={{ minHeight: 42, padding: '0 0.75rem' }} />
            </label>
            <label style={{ display: 'grid', gap: '0.35rem', fontWeight: 700 }}>
              Real User Email
              <input
                type="email"
                value={realUserEmail}
                onChange={(e) => setRealUserEmail(e.currentTarget.value)}
                placeholder="user@example.com"
                style={{ minHeight: 42, padding: '0 0.75rem' }}
              />
            </label>
            <p style={{ color: 'var(--gds-color-muted)', fontSize: '0.875rem', margin: 0 }}>
              This transfers all submissions from the pseudo user to the real user account. This action cannot be undone.
            </p>
            <div style={{ display: 'grid', gap: '0.75rem', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
            <SemanticButton action="users:merge-confirm" onClick={() => void handleMerge()} loading={loading} disabled={!realUserEmail}>
              {loading ? 'Merging...' : 'Merge Users'}
            </SemanticButton>
            <SemanticButton
              action="users:merge-cancel"
              variant="secondary"
              onClick={() => {
                setShowMergeDialog(false);
                setRealUserEmail('');
              }}
              disabled={loading}
            >
              Cancel
            </SemanticButton>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
