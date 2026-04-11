/**
 * Partner Search Dropdown Component
 * 
 * Searchable dropdown for partner selection with predictive search
 */

'use client';

import { useState, useRef, useEffect } from 'react';

interface Partner {
  _id: string;
  partnerId: string;
  name: string;
  description?: string;
}

interface PartnerSearchDropdownProps {
  partners: Partner[];
  selectedPartnerId: string | null;
  onSelect: (partnerId: string, partnerName: string) => void;
  required?: boolean;
}

export default function PartnerSearchDropdown({
  partners,
  selectedPartnerId,
  onSelect,
  required = false
}: PartnerSearchDropdownProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Find selected partner
  const selectedPartner = partners.find(p => p.partnerId === selectedPartnerId);

  // Filter partners based on search query
  const filteredPartners = partners.filter(partner =>
    partner.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'Enter' || e.key === 'ArrowDown') {
        e.preventDefault();
        setIsOpen(true);
        setHighlightedIndex(0);
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex(prev =>
          prev < filteredPartners.length - 1 ? prev + 1 : prev
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex(prev => (prev > 0 ? prev - 1 : 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (highlightedIndex >= 0 && highlightedIndex < filteredPartners.length) {
          const partner = filteredPartners[highlightedIndex];
          onSelect(partner.partnerId, partner.name);
          setSearchQuery('');
          setIsOpen(false);
          setHighlightedIndex(-1);
        }
        break;
      case 'Escape':
        e.preventDefault();
        setIsOpen(false);
        setHighlightedIndex(-1);
        setSearchQuery('');
        break;
    }
  };

  const handleSelectPartner = (partner: Partner) => {
    onSelect(partner.partnerId, partner.name);
    setSearchQuery('');
    setIsOpen(false);
    setHighlightedIndex(-1);
  };

  const handleClear = () => {
    onSelect('', '');
    setSearchQuery('');
    setIsOpen(false);
    setHighlightedIndex(-1);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Display selected partner or search input */}
      {selectedPartner && !isOpen ? (
        <div className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 flex items-center justify-between">
          <div className="flex-1">
            <p className="text-gray-900 dark:text-white font-medium">{selectedPartner.name}</p>
            {selectedPartner.description && (
              <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
                {selectedPartner.description}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 ml-4">
            <button
              type="button"
              onClick={() => setIsOpen(true)}
              className="text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400 font-medium"
            >
              Change
            </button>
            {!required && (
              <button
                type="button"
                onClick={handleClear}
                className="text-sm text-red-600 hover:text-red-800 dark:text-red-400 font-medium"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      ) : (
        <>
          {/* Search Input */}
          <div className="relative">
            <input
              ref={inputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setIsOpen(true);
                setHighlightedIndex(0);
              }}
              onFocus={() => setIsOpen(true)}
              onKeyDown={handleKeyDown}
              placeholder="Search partners..."
              className="w-full px-4 py-2 pr-10 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
          </div>

          {/* Dropdown List */}
          {isOpen && (
            <div className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg max-h-64 overflow-y-auto">
              {filteredPartners.length === 0 ? (
                <div className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                  No partners found
                </div>
              ) : (
                filteredPartners.map((partner, index) => (
                  <button
                    key={partner.partnerId}
                    type="button"
                    onClick={() => handleSelectPartner(partner)}
                    className={`w-full text-left px-4 py-3 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors ${
                      index === highlightedIndex ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                    } ${
                      partner.partnerId === selectedPartnerId ? 'bg-blue-100 dark:bg-blue-900/30' : ''
                    }`}
                  >
                    <p className="font-medium text-gray-900 dark:text-white">{partner.name}</p>
                    {partner.description && (
                      <p className="text-sm text-gray-500 dark:text-gray-400 truncate mt-0.5">
                        {partner.description}
                      </p>
                    )}
                  </button>
                ))
              )}
            </div>
          )}
        </>
      )}

      {/* Hidden input for form submission */}
      <input
        type="hidden"
        name="partnerId"
        value={selectedPartnerId || ''}
        required={required}
      />
    </div>
  );
}
