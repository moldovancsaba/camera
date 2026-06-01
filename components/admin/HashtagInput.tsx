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
import { Box, Paper, Pill, PillsInput, Stack, Text, UnstyledButton } from '@mantine/core';

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
    <Box className={className} style={{ position: 'relative' }}>
      {/* Selected hashtags + input field */}
      <PillsInput>
        <Pill.Group>
        {/* Selected hashtags as chips */}
        {value.map((hashtag) => (
          <Pill
            key={hashtag}
            withRemoveButton
            onRemove={() => removeHashtag(hashtag)}
            removeButtonProps={{ 'aria-label': `Remove ${hashtag}` }}
          >
            #{hashtag}
          </Pill>
        ))}

        {/* Input field */}
          <PillsInput.Field
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
        />
        </Pill.Group>
      </PillsInput>

      {/* Autocomplete suggestions dropdown */}
      {showSuggestions && (inputValue || suggestions.length > 0) && (
        <Paper
          ref={suggestionsRef}
          withBorder
          shadow="md"
          radius="md"
          mt={4}
          style={{ position: 'absolute', zIndex: 10, width: '100%', maxHeight: 240, overflowY: 'auto' }}
        >
          {suggestions.length > 0 ? (
            <Stack gap={0} py={4}>
              {suggestions.map((hashtag, index) => (
                <UnstyledButton
                  key={hashtag}
                  type="button"
                  onClick={() => addHashtag(hashtag)}
                  p="sm"
                  data-active={index === focusedIndex || undefined}
                >
                  <Text span size="sm">#{hashtag}</Text>
                  <Text span size="xs" c="dimmed" ml="xs">(existing)</Text>
                </UnstyledButton>
              ))}
            </Stack>
          ) : null}

          {/* Show "create new" option if input doesn't match any existing */}
          {inputValue.trim() && !suggestions.includes(inputValue.toLowerCase()) && (
            <UnstyledButton
              type="button"
              onClick={() => addHashtag(inputValue)}
              p="sm"
              w="100%"
            >
              <Text span size="sm">#{inputValue.toLowerCase()}</Text>
              <Text span size="xs" c="dimmed" ml="xs">(create new)</Text>
            </UnstyledButton>
          )}

          {suggestions.length === 0 && !inputValue.trim() && (
            <Text size="sm" c="dimmed" ta="center" p="md">
              Type to search or create hashtags
            </Text>
          )}
        </Paper>
      )}

      {/* Helper text */}
      <Text mt="xs" size="sm" c="dimmed">
        Press Enter to add, Backspace to remove. Multiple hashtags allowed.
      </Text>
    </Box>
  );
}
