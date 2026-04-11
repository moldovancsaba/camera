'use client';

/**
 * Slideshow Manager Component
 * 
 * Client component for managing event slideshows from admin event detail page
 */

import { useState, useRef, type ChangeEvent } from 'react';
import Link from 'next/link';

interface Slideshow {
  _id: string;
  slideshowId: string;
  name: string;
  isActive: boolean;
  createdAt: string;
  bufferSize?: number;
  transitionDurationMs?: number;
  fadeDurationMs?: number;
  refreshStrategy?: 'continuous' | 'batch';
  playMode?: 'once' | 'loop';
  orderMode?: 'fixed' | 'random';
  backgroundPrimaryColor?: string;
  backgroundAccentColor?: string;
  backgroundImageUrl?: string | null;
  viewportScale?: 'fit' | 'fill';
}

interface Props {
  eventId: string;
  initialSlideshows: Slideshow[];
}

export default function SlideshowManager({ eventId, initialSlideshows }: Props) {
  const [slideshows, setSlideshows] = useState<Slideshow[]>(initialSlideshows);
  const [isCreating, setIsCreating] = useState(false);
  const [editingSlideshow, setEditingSlideshow] = useState<Slideshow | null>(null);
  const [bgUploading, setBgUploading] = useState(false);
  const bgFileInputRef = useRef<HTMLInputElement>(null);

  const handleCreateSlideshow = async () => {
    const name = prompt('Enter slideshow name (e.g., "Main Screen", "VIP Lounge"):');
    if (!name) return;

    setIsCreating(true);
    try {
      const response = await fetch('/api/slideshows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId, name }),
      });
      
      if (response.ok) {
        const data = await response.json();
        setSlideshows([...slideshows, data.slideshow]);
      } else {
        alert('Failed to create slideshow');
      }
    } catch (err) {
      alert('Failed to create slideshow');
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteSlideshow = async (slideshowId: string) => {
    if (!confirm('Delete this slideshow?')) return;

    try {
      const response = await fetch(`/api/slideshows?id=${slideshowId}`, {
        method: 'DELETE',
      });
      
      if (response.ok) {
        setSlideshows(slideshows.filter(s => s._id !== slideshowId));
      } else {
        alert('Failed to delete slideshow');
      }
    } catch (err) {
      alert('Failed to delete slideshow');
    }
  };

  const handleBackgroundFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !editingSlideshow) return;
    setBgUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(
        `/api/slideshows/${editingSlideshow.slideshowId}/background-image`,
        { method: 'POST', body: fd }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error || 'Failed to upload background');
        return;
      }
      const payload = await res.json();
      const url = payload.data?.imageUrl as string | undefined;
      if (url) {
        setEditingSlideshow({ ...editingSlideshow, backgroundImageUrl: url });
        setSlideshows((prev) =>
          prev.map((s) =>
            s.slideshowId === editingSlideshow.slideshowId
              ? { ...s, backgroundImageUrl: url }
              : s
          )
        );
      }
    } catch {
      alert('Failed to upload background');
    } finally {
      setBgUploading(false);
      e.target.value = '';
    }
  };

  const copySlideshowUrl = (slideshowId: string) => {
    const url = `${window.location.origin}/slideshow/${slideshowId}`;
    navigator.clipboard.writeText(url);
    alert('Slideshow URL copied to clipboard!');
  };

  const handleEditSlideshow = async (updated: Slideshow) => {
    try {
      const response = await fetch(`/api/slideshows?id=${updated._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: updated.name,
          bufferSize: updated.bufferSize,
          transitionDurationMs: updated.transitionDurationMs,
          fadeDurationMs: updated.fadeDurationMs,
          refreshStrategy: updated.refreshStrategy,
          playMode: updated.playMode ?? 'loop',
          orderMode: updated.orderMode ?? 'fixed',
          backgroundPrimaryColor:
            updated.backgroundPrimaryColor?.trim() || '#312e81',
          backgroundAccentColor:
            updated.backgroundAccentColor?.trim() || '#0f172a',
          backgroundImageUrl:
            updated.backgroundImageUrl === undefined
              ? undefined
              : updated.backgroundImageUrl || null,
          viewportScale: updated.viewportScale ?? 'fit',
        }),
      });
      
      if (response.ok) {
        const data = await response.json();
        setSlideshows(slideshows.map(s => s._id === updated._id ? data.slideshow : s));
        setEditingSlideshow(null);
      } else {
        alert('Failed to update slideshow');
      }
    } catch (err) {
      alert('Failed to update slideshow');
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
      <div className="p-6 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-white">
              📺 Event Slideshows
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mt-1">
              Display submissions on screens during the event
            </p>
          </div>
          <button
            onClick={handleCreateSlideshow}
            disabled={isCreating}
            className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-semibold hover:bg-purple-700 transition-colors disabled:opacity-50"
          >
            {isCreating ? 'Creating...' : '➕ New Slideshow'}
          </button>
        </div>
      </div>

      {slideshows.length === 0 ? (
        <div className="p-12 text-center">
          <div className="text-5xl mb-4">📺</div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
            No slideshows yet
          </h3>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            Create a slideshow to display event photos on screens with smart playlist rotation
          </p>
        </div>
      ) : (
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {slideshows.map((slideshow) => (
              <div
                key={slideshow._id}
                className="bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-4"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-900 dark:text-white">
                      {slideshow.name}
                    </h3>
                    <span className={`inline-flex mt-1 px-2 py-1 text-xs font-semibold rounded-full ${
                      slideshow.isActive
                        ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                        : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-400'
                    }`}>
                      {slideshow.isActive ? '● Active' : '○ Inactive'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDeleteSlideshow(slideshow._id)}
                    className="text-red-500 hover:text-red-700 text-sm shrink-0"
                    title="Delete"
                  >
                    🗑️
                  </button>
                </div>
                <div className="space-y-2">
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    Created {new Date(slideshow.createdAt).toLocaleDateString()}
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditingSlideshow(slideshow)}
                    className="block w-full px-3 py-2 bg-purple-600 text-white rounded text-sm font-semibold hover:bg-purple-700 transition-colors text-center"
                  >
                    ✏️ Edit slideshow
                  </button>
                  <Link
                    href={`/slideshow/${slideshow.slideshowId}`}
                    target="_blank"
                    className="block w-full px-3 py-2 bg-gray-800 text-white rounded text-sm font-semibold hover:bg-gray-900 transition-colors text-center"
                  >
                    🎬 Open Slideshow
                  </Link>
                  <button
                    onClick={() => copySlideshowUrl(slideshow.slideshowId)}
                    className="w-full px-3 py-2 bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white rounded text-xs hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                  >
                    📋 Copy public URL
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Settings Dialog — scrollable body + pinned actions so short viewports can still save */}
      {editingSlideshow && (
        <div
          className="fixed inset-0 z-50 overflow-y-auto bg-black/50 p-4"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) setEditingSlideshow(null);
          }}
        >
          <div className="flex min-h-[100dvh] items-center justify-center py-8">
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="slideshow-settings-title"
              className="flex max-h-[min(90dvh,100dvh-2rem)] w-full max-w-md flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-800"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="shrink-0 border-b border-gray-200 px-6 py-4 dark:border-gray-700">
                <h3
                  id="slideshow-settings-title"
                  className="text-xl font-bold text-gray-900 dark:text-white"
                >
                  Slideshow Settings
                </h3>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-4">
                <div className="space-y-4">
              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Name
                </label>
                <input
                  type="text"
                  value={editingSlideshow.name}
                  onChange={(e) => setEditingSlideshow({ ...editingSlideshow, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>

              {/* 16:9 stage vs window / layout cell */}
              <div>
                <span className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  16:9 stage in window or layout cell
                </span>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                  Fit keeps the full 16:9 stage visible (letterbox). Fill scales the stage to cover the
                  area (may crop). Applies on the public slideshow page and inside layout regions.
                </p>
                <p className="text-xs text-amber-800 dark:text-amber-200/90 mb-2 rounded-md bg-amber-50 dark:bg-amber-950/40 px-2 py-1.5 border border-amber-200/80 dark:border-amber-800/60">
                  <strong className="font-semibold">Aspect ratio:</strong> the slideshow stage is{' '}
                  <strong className="font-semibold">always 16:9</strong>. There is no separate setting to
                  switch to 4:3 or 9:16 for the stage—only <em>Fit</em> vs <em>Fill</em> below. Photo
                  shapes (landscape / square / portrait) still come from each image; the player may show
                  mosaics for non-wide shots.
                </p>
                <div className="flex flex-wrap gap-6">
                  <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-800 dark:text-gray-200">
                    <input
                      type="radio"
                      name="slideshowViewportScale"
                      className="accent-purple-600"
                      checked={(editingSlideshow.viewportScale ?? 'fit') === 'fit'}
                      onChange={() =>
                        setEditingSlideshow({ ...editingSlideshow, viewportScale: 'fit' })
                      }
                    />
                    Fit (letterbox)
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-800 dark:text-gray-200">
                    <input
                      type="radio"
                      name="slideshowViewportScale"
                      className="accent-purple-600"
                      checked={(editingSlideshow.viewportScale ?? 'fit') === 'fill'}
                      onChange={() =>
                        setEditingSlideshow({ ...editingSlideshow, viewportScale: 'fill' })
                      }
                    />
                    Fill (crop)
                  </label>
                </div>
              </div>

              {/* Buffer Size */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Buffer Size (slides in memory)
                </label>
                <input
                  type="number"
                  min="1"
                  max="50"
                  value={editingSlideshow.bufferSize || 10}
                  onChange={(e) => setEditingSlideshow({ ...editingSlideshow, bufferSize: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Number of upcoming slides kept preloaded in a FIFO queue. If the network drops,
                  playback rotates through this queue so the screen stays filled (one image can repeat
                  to fill the queue).
                </p>
              </div>

              {/* Failover gradient */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Primary color (top-right)
                  </label>
                  <input
                    type="text"
                    value={
                      editingSlideshow.backgroundPrimaryColor?.trim() || '#312e81'
                    }
                    onChange={(e) =>
                      setEditingSlideshow({
                        ...editingSlideshow,
                        backgroundPrimaryColor: e.target.value,
                      })
                    }
                    placeholder="#312e81"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-mono text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Accent color (bottom-left)
                  </label>
                  <input
                    type="text"
                    value={
                      editingSlideshow.backgroundAccentColor?.trim() || '#0f172a'
                    }
                    onChange={(e) =>
                      setEditingSlideshow({
                        ...editingSlideshow,
                        backgroundAccentColor: e.target.value,
                      })
                    }
                    placeholder="#0f172a"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-mono text-sm"
                  />
                </div>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 -mt-2">
                Gradient runs top-right → bottom-left behind slides (letterbox / empty states).
              </p>

              {/* Background image */}
              <div>
                <span className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Failover background photo
                </span>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                  Shown above the gradient and under slide images when you need a branded backdrop.
                </p>
                <input
                  ref={bgFileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleBackgroundFile}
                />
                <div className="flex flex-wrap gap-2 items-center">
                  <button
                    type="button"
                    disabled={bgUploading}
                    onClick={() => bgFileInputRef.current?.click()}
                    className="px-3 py-2 bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg text-sm font-semibold hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50"
                  >
                    {bgUploading ? 'Uploading…' : 'Upload image'}
                  </button>
                  {(editingSlideshow.backgroundImageUrl || '').trim() ? (
                    <button
                      type="button"
                      onClick={() =>
                        setEditingSlideshow({
                          ...editingSlideshow,
                          backgroundImageUrl: null,
                        })
                      }
                      className="px-3 py-2 text-red-600 dark:text-red-400 text-sm"
                    >
                      Remove photo
                    </button>
                  ) : null}
                </div>
                {(editingSlideshow.backgroundImageUrl || '').trim() ? (
                  <div className="mt-2 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-600 max-h-32">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={editingSlideshow.backgroundImageUrl!}
                      alt="Background preview"
                      className="w-full h-32 object-cover"
                    />
                  </div>
                ) : null}
              </div>

              {/* Transition duration (stored as ms everywhere: API, DB, player) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Slide duration (ms)
                </label>
                <input
                  type="number"
                  min={1000}
                  max={600000}
                  step={100}
                  value={editingSlideshow.transitionDurationMs ?? 5000}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10);
                    const ms = Number.isFinite(v)
                      ? Math.max(1000, Math.min(600_000, v))
                      : 5000;
                    setEditingSlideshow({
                      ...editingSlideshow,
                      transitionDurationMs: ms,
                    });
                  }}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  How long each slide stays visible (1000–600000 ms).
                </p>
              </div>

              {/* Fade duration (ms); stored for future cross-fade — player may use instant cuts today */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Fade duration (ms)
                </label>
                <input
                  type="number"
                  min={0}
                  max={60000}
                  step={50}
                  value={editingSlideshow.fadeDurationMs ?? 1000}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10);
                    const ms = Number.isFinite(v)
                      ? Math.max(0, Math.min(60_000, v))
                      : 0;
                    setEditingSlideshow({
                      ...editingSlideshow,
                      fadeDurationMs: ms,
                    });
                  }}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Reserved for transitions (0–60000 ms). Public player may still cut instantly.
                </p>
              </div>

              {/* Refresh Strategy */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Refresh Strategy
                </label>
                <select
                  value={editingSlideshow.refreshStrategy || 'continuous'}
                  onChange={(e) => setEditingSlideshow({ ...editingSlideshow, refreshStrategy: e.target.value as 'continuous' | 'batch' })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  <option value="continuous">Continuous (background refresh)</option>
                  <option value="batch">Batch (reload all at once)</option>
                </select>
              </div>

              {/* Playback: once vs loop */}
              <div>
                <span className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Playback
                </span>
                <div className="flex flex-wrap gap-6">
                  <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-800 dark:text-gray-200">
                    <input
                      type="radio"
                      name="playMode"
                      className="accent-purple-600"
                      checked={(editingSlideshow.playMode ?? 'loop') === 'once'}
                      onChange={() =>
                        setEditingSlideshow({ ...editingSlideshow, playMode: 'once' })
                      }
                    />
                    Play once
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-800 dark:text-gray-200">
                    <input
                      type="radio"
                      name="playMode"
                      className="accent-purple-600"
                      checked={(editingSlideshow.playMode ?? 'loop') === 'loop'}
                      onChange={() =>
                        setEditingSlideshow({ ...editingSlideshow, playMode: 'loop' })
                      }
                    />
                    Loop
                  </label>
                </div>
              </div>

              {/* Order: fixed vs random */}
              <div>
                <span className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Order
                </span>
                <div className="flex flex-wrap gap-6">
                  <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-800 dark:text-gray-200">
                    <input
                      type="radio"
                      name="orderMode"
                      className="accent-purple-600"
                      checked={(editingSlideshow.orderMode ?? 'fixed') === 'fixed'}
                      onChange={() =>
                        setEditingSlideshow({ ...editingSlideshow, orderMode: 'fixed' })
                      }
                    />
                    Fixed
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-800 dark:text-gray-200">
                    <input
                      type="radio"
                      name="orderMode"
                      className="accent-purple-600"
                      checked={(editingSlideshow.orderMode ?? 'fixed') === 'random'}
                      onChange={() =>
                        setEditingSlideshow({ ...editingSlideshow, orderMode: 'random' })
                      }
                    />
                    Random
                  </label>
                </div>
              </div>
                </div>
              </div>

              <div className="shrink-0 border-t border-gray-200 bg-white px-6 py-4 dark:border-gray-700 dark:bg-gray-800">
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => handleEditSlideshow(editingSlideshow)}
                    className="flex-1 rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white transition-colors hover:bg-blue-700"
                  >
                    Save Changes
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingSlideshow(null)}
                    className="flex-1 rounded-lg bg-gray-200 px-4 py-2 font-semibold text-gray-900 transition-colors hover:bg-gray-300 dark:bg-gray-700 dark:text-white dark:hover:bg-gray-600"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
