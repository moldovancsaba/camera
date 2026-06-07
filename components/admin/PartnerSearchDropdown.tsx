'use client';

/**
 * Partner Search Dropdown Component
 */

import { useEffect, useMemo, useRef, useState } from 'react';

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
  required = false,
}: PartnerSearchDropdownProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const selectedPartner = partners.find((partner) => partner.partnerId === selectedPartnerId);
  const mounted = useRef(false);

  const filteredPartners = useMemo(
    () => partners.filter((partner) => partner.name.toLowerCase().includes(searchQuery.toLowerCase())),
    [partners, searchQuery]
  );

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
  }, [searchQuery]);

  const handleSelectPartner = (partner: Partner) => {
    onSelect(partner.partnerId, partner.name);
    setSearchQuery('');
    setIsOpen(false);
  };

  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        onClick={() => setIsOpen((value) => !value)}
        style={{
          alignItems: 'center',
          background: 'var(--gds-color-surface)',
          border: '1px solid var(--gds-color-border)',
          borderRadius: '0.625rem',
          display: 'flex',
          justifyContent: 'space-between',
          minHeight: 44,
          padding: '0.5rem 0.75rem',
          textAlign: 'left',
          width: '100%',
        }}
      >
        <span style={{ color: selectedPartner ? 'inherit' : 'var(--gds-color-muted)', fontWeight: 700 }}>
          {selectedPartner ? selectedPartner.name : 'Search partners...'}
        </span>
        <span aria-hidden>▾</span>
      </button>

      {isOpen ? (
        <div
          style={{
            background: 'var(--gds-color-surface)',
            border: '1px solid var(--gds-color-border)',
            borderRadius: '0.75rem',
            boxShadow: 'var(--gds-shadow-lg))',
            display: 'grid',
            gap: '0.5rem',
            left: 0,
            marginTop: '0.35rem',
            padding: '0.75rem',
            position: 'absolute',
            right: 0,
            zIndex: 20,
          }}
        >
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.currentTarget.value)}
            placeholder="Search partners..."
            style={{ minHeight: 40, padding: '0 0.75rem' }}
          />
          <div role="listbox" style={{ display: 'grid', maxHeight: 260, overflowY: 'auto' }}>
            {filteredPartners.length > 0 ? (
              filteredPartners.map((partner) => (
                <button
                  key={partner.partnerId}
                  type="button"
                  role="option"
                  aria-selected={partner.partnerId === selectedPartnerId}
                  onClick={() => handleSelectPartner(partner)}
                  style={{
                    background: partner.partnerId === selectedPartnerId ? 'var(--gds-color-surface-muted)' : 'transparent',
                    border: 0,
                    borderRadius: '0.5rem',
                    fontWeight: 700,
                    padding: '0.65rem 0.75rem',
                    textAlign: 'left',
                  }}
                >
                  {partner.name}
                </button>
              ))
            ) : (
              <span style={{ color: 'var(--gds-color-muted)', padding: '0.65rem 0.75rem' }}>No partners found</span>
            )}
          </div>
        </div>
      ) : null}

      <input type="hidden" name="partnerId" value={selectedPartnerId || ''} required={required} />
    </div>
  );
}
