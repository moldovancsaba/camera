/**
 * Hashtag Input Component
 * 
 * Multi-select hashtag input with autocomplete
 * - Fetch existing hashtags from API as user types
 * - Display suggestions based on partial match
 * - Allow selecting multiple hashtags
 * - Display selected hashtags as removable chips
 * - Allow inline creation of new hashtags
 */

'use client';

import { useState, useEffect, useRef } from 'react';

interface HashtagInputProps {
  value: string[];
  onChange: (hashtags: string[]) => void;
  placeholder?: string;
  className?: string;
}

export default function HashtagInput({
  value,
  onChange,
  placeholder = 'Type to search or add hashtags...',
  className = '',
}: HashtagInputProps) {
  const [inputValue, setInputValue] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  // Debounced fetch of hashtag suggestions
  useEffect(() => {
    const fetchSuggestions = async () => {
      if (inputValue.trim().length === 0) {
        setSuggestions([]);
        return;
      }

      try {
        const response = await fetch(`/api/hashtags?q=${encodeURIComponent(inputValue)}&limit=10`);
        const data = await response.json();
        
        if (response.ok) {
          // Filter out already selected hashtags
          const filtered = data.hashtags.filter(
            (tag: string) => !value.includes(tag.toLowerCase())
          );
          setSuggestions(filtered);
        }
      } catch (error) {
        console.error('Error fetching hashtags:', error);
      }
    };

    // Debounce: wait 300ms after user stops typing
    const timeoutId = setTimeout(fetchSuggestions, 300);
    return () => clearTimeout(timeoutId);
  }, [inputValue, value]);

  // Handle adding a hashtag
  const addHashtag = (hashtag: string) => {
    const normalized = hashtag.toLowerCase().trim();
    
    // Validate: no empty, no duplicates
    if (normalized && !value.includes(normalized)) {
      onChange([...value, normalized]);
      setInputValue('');
      setSuggestions([]);
      setShowSuggestions(false);
      setFocusedIndex(-1);
      inputRef.current?.focus();
    }
  };

  // Handle removing a hashtag
  const removeHashtag = (hashtag: string) => {
    onChange(value.filter((tag) => tag !== hashtag));
    inputRef.current?.focus();
  };

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Enter: add current input or selected suggestion
    if (e.key === 'Enter') {
      e.preventDefault();
      
      if (focusedIndex >= 0 && suggestions[focusedIndex]) {
        addHashtag(suggestions[focusedIndex]);
      } else if (inputValue.trim()) {
        addHashtag(inputValue);
      }
    }
    // Backspace: remove last hashtag if input is empty
    else if (e.key === 'Backspace' && inputValue === '' && value.length > 0) {
      removeHashtag(value[value.length - 1]);
    }
    // Arrow Down: navigate suggestions
    else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusedIndex((prev) => 
        prev < suggestions.length - 1 ? prev + 1 : prev
      );
    }
    // Arrow Up: navigate suggestions
    else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusedIndex((prev) => (prev > 0 ? prev - 1 : -1));
    }
    // Escape: close suggestions
    else if (e.key === 'Escape') {
      setShowSuggestions(false);
      setFocusedIndex(-1);
    }
  };

  // Scroll focused suggestion into view
  useEffect(() => {
    if (focusedIndex >= 0 && suggestionsRef.current) {
      const focusedElement = suggestionsRef.current.children[focusedIndex] as HTMLElement;
      if (focusedElement) {
        focusedElement.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [focusedIndex]);

  return (
    <div className={className} style={{ position: 'relative' }}>
      {/* Selected hashtags + input field */}
      <div
        style={{
          alignItems: 'center',
          border: '1px solid var(--gds-color-border)',
          borderRadius: '0.75rem',
          display: 'flex',
          flexWrap: 'wrap',
          gap: '0.5rem',
          minHeight: 44,
          padding: '0.5rem',
        }}
      >
        {/* Selected hashtags as chips */}
        {value.map((hashtag) => (
          <button
            key={hashtag}
            type="button"
            aria-label={`Remove ${hashtag}`}
            onClick={() => removeHashtag(hashtag)}
            style={{
              border: '1px solid var(--gds-color-border)',
              borderRadius: '999px',
              padding: '0.25rem 0.6rem',
            }}
          >
            #{hashtag} <span aria-hidden>×</span>
          </button>
        ))}

        {/* Input field */}
          <input
          ref={inputRef}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setShowSuggestions(true)}
          onBlur={() => {
            // Delay to allow click on suggestions
            setTimeout(() => setShowSuggestions(false), 200);
          }}
          placeholder={value.length === 0 ? placeholder : ''}
          style={{ border: 0, flex: '1 1 180px', minHeight: 32, outline: 'none' }}
        />
      </div>

      {/* Autocomplete suggestions dropdown */}
      {showSuggestions && (inputValue || suggestions.length > 0) && (
        <div
          ref={suggestionsRef}
          role="listbox"
          style={{
            background: 'var(--gds-color-surface)',
            border: '1px solid var(--gds-color-border)',
            borderRadius: '0.75rem',
            boxShadow: 'var(--gds-shadow-lg)',
            marginTop: 4,
            maxHeight: 240,
            overflowY: 'auto',
            position: 'absolute',
            width: '100%',
            zIndex: 10,
          }}
        >
          {suggestions.length > 0 ? (
            <div style={{ display: 'grid', padding: '0.25rem 0' }}>
              {suggestions.map((hashtag, index) => (
                <button
                  key={hashtag}
                  type="button"
                  role="option"
                  aria-selected={index === focusedIndex}
                  onClick={() => addHashtag(hashtag)}
                  data-active={index === focusedIndex || undefined}
                  style={{
                    background: index === focusedIndex ? 'var(--gds-color-surface-muted)' : 'transparent',
                    border: 0,
                    padding: '0.65rem 0.75rem',
                    textAlign: 'left',
                  }}
                >
                  <span style={{ fontSize: '0.875rem' }}>#{hashtag}</span>
                  <span style={{ color: 'var(--gds-color-muted)', fontSize: '0.75rem', marginLeft: '0.5rem' }}>(existing)</span>
                </button>
              ))}
            </div>
          ) : null}

          {/* Show "create new" option if input doesn't match any existing */}
          {inputValue.trim() && !suggestions.includes(inputValue.toLowerCase()) && (
            <button
              type="button"
              role="option"
              aria-selected={false}
              onClick={() => addHashtag(inputValue)}
              style={{
                background: 'transparent',
                border: 0,
                padding: '0.65rem 0.75rem',
                textAlign: 'left',
                width: '100%',
              }}
            >
              <span style={{ fontSize: '0.875rem' }}>#{inputValue.toLowerCase()}</span>
              <span style={{ color: 'var(--gds-color-muted)', fontSize: '0.75rem', marginLeft: '0.5rem' }}>(create new)</span>
            </button>
          )}

          {suggestions.length === 0 && !inputValue.trim() && (
            <p style={{ color: 'var(--gds-color-muted)', fontSize: '0.875rem', margin: 0, padding: '1rem', textAlign: 'center' }}>
              Type to search or create hashtags
            </p>
          )}
        </div>
      )}

      {/* Helper text */}
      <p style={{ color: 'var(--gds-color-muted)', fontSize: '0.875rem', margin: '0.5rem 0 0' }}>
        Press Enter to add, Backspace to remove. Multiple hashtags allowed.
      </p>
    </div>
  );
}
