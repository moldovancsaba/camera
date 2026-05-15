'use client';

import { useState } from 'react';

type PartnerAppKey = 'events' | 'gym';
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
  gym: 'Gym App',
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
        return [assignment, ...deduped].sort((a, b) => Number(b.isActive) - Number(a.isActive) || a.userEmail.localeCompare(b.userEmail));
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
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
      <div className="p-6 border-b border-gray-200 dark:border-gray-700">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Partner User Access</h2>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          Manage partner-scoped app access separately from global Camera roles. This is the source of truth for who can operate this partner inside Events and Gym.
        </p>
      </div>

      <div className="p-6 space-y-6">
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
          <div className="xl:col-span-2">
            <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">User email</label>
            <input
              value={userEmail}
              onChange={(event) => setUserEmail(event.target.value)}
              placeholder="user@example.com"
              className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Display name</label>
            <input
              value={userName}
              onChange={(event) => setUserName(event.target.value)}
              placeholder="Optional"
              className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">App</label>
            <select
              value={appKey}
              onChange={(event) => setAppKey(event.target.value as PartnerAppKey)}
              className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
            >
              <option value="events">Events App</option>
              <option value="gym">Gym App</option>
            </select>
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Role</label>
            <select
              value={role}
              onChange={(event) => setRole(event.target.value as PartnerAccessRole)}
              className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
            >
              <option value="viewer">Viewer</option>
              <option value="manager">Manager</option>
              <option value="admin">Admin</option>
            </select>
          </div>
        </div>

        <div className="flex items-center justify-between gap-4">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            If the user has not appeared in Camera yet, the email assignment is still saved and will match later when they sign in or create activity.
          </p>
          <button
            type="button"
            onClick={() => void handleCreate()}
            disabled={isSubmitting || !userEmail.trim()}
            className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-amber-700 disabled:opacity-50"
          >
            {isSubmitting ? 'Saving…' : 'Add Access'}
          </button>
        </div>

        {message ? <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800 dark:border-green-900/40 dark:bg-green-950/30 dark:text-green-200">{message}</div> : null}
        {error ? <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-200">{error}</div> : null}

        {assignments.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
            No partner user assignments yet.
          </div>
        ) : (
          <div className="space-y-4">
            {assignments.map((assignment) => (
              <div
                key={assignment.accessId}
                className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900"
              >
                <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-gray-900 dark:text-white">
                        {assignment.userName?.trim() || assignment.userEmail}
                      </p>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${assignment.isActive ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' : 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300'}`}>
                        {assignment.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{assignment.userEmail}</p>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-500">
                      Updated {new Date(assignment.updatedAt).toLocaleString()}
                    </p>
                  </div>

                  <div className="grid grid-cols-1 gap-3 md:grid-cols-3 xl:w-[30rem]">
                    <select
                      value={assignment.appKey}
                      onChange={(event) => void patchAssignment(assignment.accessId, { appKey: event.target.value as PartnerAppKey })}
                      className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                    >
                      {Object.entries(APP_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                    <select
                      value={assignment.role}
                      onChange={(event) => void patchAssignment(assignment.accessId, { role: event.target.value as PartnerAccessRole })}
                      className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                    >
                      {Object.entries(ROLE_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => void patchAssignment(assignment.accessId, { isActive: !assignment.isActive })}
                        className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${assignment.isActive ? 'bg-gray-200 text-gray-900 hover:bg-gray-300 dark:bg-gray-700 dark:text-white dark:hover:bg-gray-600' : 'bg-green-100 text-green-800 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-200 dark:hover:bg-green-900/50'}`}
                      >
                        {assignment.isActive ? 'Deactivate' : 'Activate'}
                      </button>
                      <button
                        type="button"
                        onClick={() => void removeAssignment(assignment.accessId)}
                        className="rounded-lg bg-red-100 px-3 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-200 dark:bg-red-900/30 dark:text-red-200 dark:hover:bg-red-900/50"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
