/**
 * User Management Actions Component
 * 
 * Client component for user management actions in admin users page.
 * Provides buttons to toggle roles, activate/deactivate, and merge users.
 * 
 * Features:
 * - Role toggle (user ↔ admin) for real users and administrators
 * - Status toggle (active ↔ inactive) for all user types
 * - Merge functionality for pseudo users
 * - Visual feedback with loading states and toast notifications
 */

'use client';

import { useState } from 'react';

interface UserManagementActionsProps {
  user: {
    email: string;
    name: string;
    type: 'administrator' | 'real' | 'pseudo' | 'anonymous';
    role?: string;
    isActive?: boolean;
    mergedWith?: string;
  };
  currentUserEmail: string; // To prevent self-actions
}

export default function UserManagementActions({ user, currentUserEmail }: UserManagementActionsProps) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showMergeDialog, setShowMergeDialog] = useState(false);
  const [realUserEmail, setRealUserEmail] = useState('');
  
  // Don't show actions for anonymous users
  if (user.type === 'anonymous') {
    return null;
  }
  
  const isSelf = user.email === currentUserEmail;
  const isActive = user.isActive !== false; // Default to true if not set
  
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
        // Refresh page to show updated role
        setTimeout(() => window.location.reload(), 1500);
      } else {
        showMessage('error', data.error || 'Failed to update role');
      }
    } catch (error) {
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
        // Refresh page to show updated status
        setTimeout(() => window.location.reload(), 1500);
      } else {
        showMessage('error', data.error || 'Failed to update status');
      }
    } catch (error) {
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
          realUserEmail: realUserEmail,
        }),
      });
      
      const data = await response.json();
      
      if (response.ok) {
        showMessage('success', data.message);
        setShowMergeDialog(false);
        // Refresh page to show merged status
        setTimeout(() => window.location.reload(), 1500);
      } else {
        showMessage('error', data.error || 'Failed to merge users');
      }
    } catch (error) {
      showMessage('error', 'Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <div className="space-y-2">
      {/* Action Buttons */}
      <div className="flex flex-wrap gap-2">
        {/* Role Toggle - Only for real users and administrators */}
        {(user.type === 'real' || user.type === 'administrator') && (
          <button
            onClick={toggleRole}
            disabled={loading || (isSelf && user.role === 'admin')}
            className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
              user.role === 'admin'
                ? 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                : 'bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300 hover:bg-purple-200 dark:hover:bg-purple-800'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {user.role === 'admin' ? '👤 Demote to User' : '👑 Promote to Admin'}
          </button>
        )}
        
        {/* Status Toggle - For all except anonymous */}
        <button
          onClick={toggleStatus}
          disabled={loading || (isSelf && isActive)}
          className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
            isActive
              ? 'bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-800'
              : 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 hover:bg-green-200 dark:hover:bg-green-800'
          } disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          {isActive ? '🚫 Deactivate' : '✅ Activate'}
        </button>
        
        {/* Merge Button - Only for pseudo users not already merged */}
        {user.type === 'pseudo' && !user.mergedWith && (
          <button
            onClick={() => setShowMergeDialog(true)}
            disabled={loading}
            className="px-3 py-1.5 text-xs font-medium rounded bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            🔗 Merge with Real User
          </button>
        )}
      </div>
      
      {/* Message Display */}
      {message && (
        <div className={`p-2 text-xs rounded ${
          message.type === 'success'
            ? 'bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-200'
            : 'bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200'
        }`}>
          {message.text}
        </div>
      )}
      
      {/* Merge Dialog */}
      {showMergeDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Merge Pseudo User with Real User
            </h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Pseudo User Email
                </label>
                <input
                  type="text"
                  value={user.email}
                  disabled
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Real User Email
                </label>
                <input
                  type="email"
                  value={realUserEmail}
                  onChange={(e) => setRealUserEmail(e.target.value)}
                  placeholder="user@example.com"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500"
                />
              </div>
              
              <p className="text-xs text-gray-600 dark:text-gray-400">
                This will transfer all submissions from the pseudo user to the real user account. This action cannot be undone.
              </p>
            </div>
            
            <div className="flex gap-3 mt-6">
              <button
                onClick={handleMerge}
                disabled={loading || !realUserEmail}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
              >
                {loading ? 'Merging...' : 'Merge Users'}
              </button>
              <button
                onClick={() => {
                  setShowMergeDialog(false);
                  setRealUserEmail('');
                }}
                disabled={loading}
                className="flex-1 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white rounded hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors text-sm font-medium"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
