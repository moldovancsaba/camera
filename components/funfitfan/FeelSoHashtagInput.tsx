'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { normalizeFeelSoTag } from '@/lib/funfitfan/feel-so-tags';

type Props = {
  value: string[];
  onChange: (tags: string[]) => void;
  suggestions: string[];
  id?: string;
};

export default function FeelSoHashtagInput({ value, onChange, suggestions, id }: Props) {
  const [draft, setDraft] = useState('');
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const lowerValue = useMemo(() => new Set(value.map((t) => t.toLowerCase())), [value]);

  const filtered = useMemo(() => {
    const q = draft.trim().replace(/^#+/, '').toLowerCase();
    if (!q) return suggestions.filter((s) => !lowerValue.has(s.toLowerCase())).slice(0, 8);
    return suggestions
      .filter((s) => !lowerValue.has(s.toLowerCase()) && s.toLowerCase().includes(q))
      .slice(0, 8);
  }, [draft, suggestions, lowerValue]);

  const addTag = useCallback(
    (raw: string) => {
      const n = normalizeFeelSoTag(raw);
      if (!n) return;
      if (value.some((t) => t.toLowerCase() === n.toLowerCase())) return;
      if (value.length >= 20) return;
      onChange([...value, n]);
      setDraft('');
      setOpen(false);
    },
    [value, onChange]
  );

  useEffect(() => {
    function onDocDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocDown);
    return () => document.removeEventListener('mousedown', onDocDown);
  }, []);

  function commitDraft() {
    const fromComma = draft.split(',').map((s) => s.trim()).filter(Boolean);
    if (fromComma.length > 1) {
      for (const part of fromComma) addTag(part);
      return;
    }
    addTag(draft);
  }

  return (
    <div ref={rootRef} className="relative">
      <div className="mt-1 flex min-h-[42px] flex-wrap gap-2 rounded-lg border border-slate-700 bg-slate-900 px-2 py-2">
        {value.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded-full bg-emerald-900/50 px-2 py-0.5 text-sm text-emerald-100"
          >
            #{tag}
            <button
              type="button"
              className="rounded p-0.5 text-emerald-300 hover:bg-emerald-800/60"
              aria-label={`Remove ${tag}`}
              onClick={() => onChange(value.filter((t) => t !== tag))}
            >
              ×
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          id={id}
          type="text"
          className="min-w-[8rem] flex-1 bg-transparent py-1 text-white outline-none placeholder:text-slate-500"
          placeholder="Type a hashtag, pick below, or comma-separate"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault();
              commitDraft();
            } else if (e.key === 'Backspace' && !draft && value.length) {
              onChange(value.slice(0, -1));
            }
          }}
        />
      </div>
      {open && filtered.length > 0 ? (
        <ul
          className="absolute z-20 mt-1 max-h-48 w-full overflow-auto rounded-lg border border-slate-600 bg-slate-900 py-1 shadow-lg"
          role="listbox"
        >
          {filtered.map((s) => (
            <li key={s}>
              <button
                type="button"
                className="w-full px-3 py-2 text-left text-sm text-slate-200 hover:bg-slate-800"
                onMouseDown={(ev) => ev.preventDefault()}
                onClick={() => addTag(s)}
              >
                #{s}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
