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
    <div className={`relative ${className}`}>
      {/* Selected hashtags + input field */}
      <div className="min-h-[42px] px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 flex flex-wrap gap-2 items-center focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-transparent">
        {/* Selected hashtags as chips */}
        {value.map((hashtag) => (
          <span
            key={hashtag}
            className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 text-sm rounded-full"
          >
            <span>#{hashtag}</span>
            <button
              type="button"
              onClick={() => removeHashtag(hashtag)}
              className="hover:bg-blue-200 dark:hover:bg-blue-800 rounded-full p-0.5 transition-colors"
              aria-label={`Remove ${hashtag}`}
            >
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
          </span>
        ))}

        {/* Input field */}
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setShowSuggestions(true)}
          onBlur={() => {
            // Delay to allow click on suggestions
            setTimeout(() => setShowSuggestions(false), 200);
          }}
          placeholder={value.length === 0 ? placeholder : ''}
          className="flex-1 min-w-[120px] outline-none bg-transparent text-gray-900 dark:text-white text-sm"
        />
      </div>

      {/* Autocomplete suggestions dropdown */}
      {showSuggestions && (inputValue || suggestions.length > 0) && (
        <div
          ref={suggestionsRef}
          className="absolute z-10 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg max-h-60 overflow-y-auto"
        >
          {suggestions.length > 0 ? (
            <div className="py-1">
              {suggestions.map((hashtag, index) => (
                <button
                  key={hashtag}
                  type="button"
                  onClick={() => addHashtag(hashtag)}
                  className={`w-full px-4 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors ${
                    index === focusedIndex
                      ? 'bg-blue-50 dark:bg-blue-900/20'
                      : ''
                  }`}
                >
                  <span className="text-gray-900 dark:text-white">#{hashtag}</span>
                  <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">(existing)</span>
                </button>
              ))}
            </div>
          ) : null}

          {/* Show "create new" option if input doesn't match any existing */}
          {inputValue.trim() && !suggestions.includes(inputValue.toLowerCase()) && (
            <button
              type="button"
              onClick={() => addHashtag(inputValue)}
              className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors border-t border-gray-200 dark:border-gray-700"
            >
              <span className="text-gray-900 dark:text-white">#{inputValue.toLowerCase()}</span>
              <span className="ml-2 text-xs text-green-600 dark:text-green-400">(create new)</span>
            </button>
          )}

          {suggestions.length === 0 && !inputValue.trim() && (
            <div className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 text-center">
              Type to search or create hashtags
            </div>
          )}
        </div>
      )}

      {/* Helper text */}
      <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
        Press Enter to add, Backspace to remove. Multiple hashtags allowed.
      </p>
    </div>
  );
}
