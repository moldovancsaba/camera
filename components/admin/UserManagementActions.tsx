'use client';

/**
 * User Management Actions Component
 */

import { useState } from 'react';
import { Alert, Button, Group, Modal, Stack, Text, TextInput } from '@mantine/core';

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
    <Stack gap="xs">
      <Group gap="xs" wrap="wrap">
        {(user.type === 'real' || user.type === 'administrator') ? (
          <Button
            size="xs"
            variant="light"
            color={user.role === 'admin' ? 'gray' : 'violet'}
            onClick={() => void toggleRole()}
            disabled={loading || (isSelf && user.role === 'admin')}
          >
            {user.role === 'admin' ? '👤 Demote to User' : '👑 Promote to Admin'}
          </Button>
        ) : null}

        <Button
          size="xs"
          variant="light"
          color={isActive ? 'red' : 'green'}
          onClick={() => void toggleStatus()}
          disabled={loading || (isSelf && isActive)}
        >
          {isActive ? '🚫 Deactivate' : '✅ Activate'}
        </Button>

        {user.type === 'pseudo' && !user.mergedWith ? (
          <Button size="xs" variant="light" onClick={() => setShowMergeDialog(true)} disabled={loading}>
            🔗 Merge with Real User
          </Button>
        ) : null}
      </Group>

      {message ? <Alert color={message.type === 'success' ? 'green' : 'red'}>{message.text}</Alert> : null}

      <Modal opened={showMergeDialog} onClose={() => setShowMergeDialog(false)} title="Merge Pseudo User with Real User" centered>
        <Stack gap="md">
          <TextInput label="Pseudo User Email" value={user.email} disabled />
          <TextInput
            type="email"
            label="Real User Email"
            value={realUserEmail}
            onChange={(e) => setRealUserEmail(e.currentTarget.value)}
            placeholder="user@example.com"
          />
          <Text size="xs" c="dimmed">
            This will transfer all submissions from the pseudo user to the real user account. This action cannot be
            undone.
          </Text>
          <Group grow>
            <Button onClick={() => void handleMerge()} loading={loading} disabled={!realUserEmail}>
              {loading ? 'Merging...' : 'Merge Users'}
            </Button>
            <Button
              variant="default"
              onClick={() => {
                setShowMergeDialog(false);
                setRealUserEmail('');
              }}
              disabled={loading}
            >
              Cancel
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
