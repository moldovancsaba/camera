/**
 * Edit Frame Page
 * 
 * Full CRUD - Update frame details and toggle active status.
 */

'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';

export default function EditFramePage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const { id } = use(params);
  const [frame, setFrame] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch frame data
  useEffect(() => {
    async function fetchFrame() {
      try {
        const response = await fetch(`/api/frames/${id}`);
        if (!response.ok) throw new Error('Frame not found');
        const data = await response.json();
        setFrame(data.frame);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    }

    fetchFrame();
  }, [id]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSaving(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const updateData = {
      name: formData.get('name'),
      description: formData.get('description'),
      category: formData.get('category'),
      isActive: formData.get('isActive') === 'true',
    };

    try {
      const response = await fetch(`/api/frames/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update frame');
      }

      router.push('/admin/frames');
      router.refresh();
    } catch (err: any) {
      setError(err.message);
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this frame? This cannot be undone.')) {
      return;
    }

    setIsDeleting(true);
    setError(null);

    try {
      const response = await fetch(`/api/frames/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete frame');
      }

      router.push('/admin/frames');
      router.refresh();
    } catch (err: any) {
      setError(err.message);
      setIsDeleting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="p-8 max-w-4xl mx-auto">
        <div className="text-center">Loading...</div>
      </div>
    );
  }

  if (!frame) {
    return (
      <div className="p-8 max-w-4xl mx-auto">
        <div className="text-center">
          <p className="text-red-600">Frame not found</p>
          <button onClick={() => router.back()} className="mt-4 text-blue-600">Go Back</button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Edit Frame</h1>
        <p className="text-gray-600 dark:text-gray-400 mt-2">Update frame details and settings</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Frame Preview */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <label className="block text-sm font-medium text-gray-900 dark:text-white mb-4">
            Frame Preview
          </label>
          <div className="relative aspect-square bg-gray-100 dark:bg-gray-700 rounded-lg overflow-hidden">
            <Image
              src={frame.thumbnailUrl || frame.imageUrl}
              alt={frame.name}
              fill
              className="object-contain p-8"
              unoptimized
            />
          </div>
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            To change the image, delete this frame and upload a new one
          </p>
        </div>

        {/* Technical Details (Read-only) */}
        <div className="bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Technical Information</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-600 dark:text-gray-400">Frame ID:</span>
              <p className="font-mono text-xs text-gray-900 dark:text-white break-all">{frame.frameId || 'Not assigned'}</p>
            </div>
            <div>
              <span className="text-gray-600 dark:text-gray-400">MongoDB ID:</span>
              <p className="font-mono text-xs text-gray-900 dark:text-white break-all">{frame._id}</p>
            </div>
            <div>
              <span className="text-gray-600 dark:text-gray-400">Dimensions:</span>
              <p className="text-gray-900 dark:text-white">{frame.width || 'N/A'} × {frame.height || 'N/A'} px</p>
            </div>
            <div>
              <span className="text-gray-600 dark:text-gray-400">File Size:</span>
              <p className="text-gray-900 dark:text-white">{frame.fileSize ? `${(frame.fileSize / 1024).toFixed(2)} KB` : 'N/A'}</p>
            </div>
            <div>
              <span className="text-gray-600 dark:text-gray-400">MIME Type:</span>
              <p className="text-gray-900 dark:text-white">{frame.mimeType || 'N/A'}</p>
            </div>
            <div>
              <span className="text-gray-600 dark:text-gray-400">Created:</span>
              <p className="text-gray-900 dark:text-white">{frame.createdAt ? new Date(frame.createdAt).toLocaleString() : 'N/A'}</p>
            </div>
            <div>
              <span className="text-gray-600 dark:text-gray-400">Updated:</span>
              <p className="text-gray-900 dark:text-white">{frame.updatedAt ? new Date(frame.updatedAt).toLocaleString() : 'N/A'}</p>
            </div>
            <div>
              <span className="text-gray-600 dark:text-gray-400">Created By:</span>
              <p className="text-gray-900 dark:text-white">{frame.createdBy || 'N/A'}</p>
            </div>
          </div>
          
          <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
            <span className="text-gray-600 dark:text-gray-400 text-sm">Image URL:</span>
            <a 
              href={frame.imageUrl} 
              target="_blank" 
              rel="noopener noreferrer"
              className="block font-mono text-xs text-blue-600 dark:text-blue-400 hover:underline break-all mt-1"
            >
              {frame.imageUrl}
            </a>
          </div>
          
          {frame.thumbnailUrl && (
            <div className="mt-2">
              <span className="text-gray-600 dark:text-gray-400 text-sm">Thumbnail URL:</span>
              <a 
                href={frame.thumbnailUrl} 
                target="_blank" 
                rel="noopener noreferrer"
                className="block font-mono text-xs text-blue-600 dark:text-blue-400 hover:underline break-all mt-1"
              >
                {frame.thumbnailUrl}
              </a>
            </div>
          )}
        </div>

        {/* Frame Details */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 space-y-4">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-900 dark:text-white mb-2">
              Frame Name *
            </label>
            <input
              type="text"
              id="name"
              name="name"
              required
              defaultValue={frame.name}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
          </div>

          <div>
            <label htmlFor="description" className="block text-sm font-medium text-gray-900 dark:text-white mb-2">
              Description
            </label>
            <textarea
              id="description"
              name="description"
              rows={3}
              defaultValue={frame.description}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
          </div>

          <div>
            <label htmlFor="category" className="block text-sm font-medium text-gray-900 dark:text-white mb-2">
              Category
            </label>
            <select
              id="category"
              name="category"
              defaultValue={frame.category}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            >
              <option value="general">General</option>
              <option value="holiday">Holiday</option>
              <option value="birthday">Birthday</option>
              <option value="wedding">Wedding</option>
              <option value="corporate">Corporate</option>
            </select>
          </div>

          <div className="flex items-center">
            <input
              type="checkbox"
              id="isActive"
              name="isActive"
              defaultChecked={frame.isActive}
              value="true"
              className="w-4 h-4 text-blue-600 border-gray-300 rounded"
            />
            <label htmlFor="isActive" className="ml-2 text-sm text-gray-900 dark:text-white">
              Make frame active (visible to users)
            </label>
          </div>
        </div>

        {error && (
          <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <p className="text-red-800 dark:text-red-200">{error}</p>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex gap-4">
            <button
              type="submit"
              disabled={isSaving}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {isSaving ? 'Saving...' : 'Save Changes'}
            </button>
            <button
              type="button"
              onClick={() => router.back()}
              className="px-6 py-3 bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg font-semibold hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
            >
              Cancel
            </button>
          </div>

          <button
            type="button"
            onClick={handleDelete}
            disabled={isDeleting}
            className="px-6 py-3 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700 transition-colors disabled:opacity-50"
          >
            {isDeleting ? 'Deleting...' : 'Delete Frame'}
          </button>
        </div>
      </form>
    </div>
  );
}
