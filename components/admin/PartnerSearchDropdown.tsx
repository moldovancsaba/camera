'use client';

/**
 * Partner Search Dropdown Component
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Combobox, InputBase, Text, useCombobox } from '@mantine/core';

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
  const selectedPartner = partners.find((partner) => partner.partnerId === selectedPartnerId);
  const combobox = useCombobox();
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
    combobox.resetSelectedOption();
  }, [searchQuery, combobox]);

  const handleSelectPartner = (partner: Partner) => {
    onSelect(partner.partnerId, partner.name);
    setSearchQuery('');
    combobox.closeDropdown();
  };

  const options = filteredPartners.map((partner) => (
    <Combobox.Option value={partner.partnerId} key={partner.partnerId}>
      <Text fw={600}>{partner.name}</Text>
    </Combobox.Option>
  ));

  return (
    <>
      <Combobox
        store={combobox}
        onOptionSubmit={(value) => {
          const partner = filteredPartners.find((entry) => entry.partnerId === value);
          if (partner) {
            handleSelectPartner(partner);
          }
        }}
      >
        <Combobox.Target>
          <InputBase
            component="button"
            type="button"
            pointer
            rightSection="▾"
            onClick={() => combobox.toggleDropdown()}
            styles={{ input: { height: 'auto', minHeight: 42, paddingBlock: 8 } }}
          >
            {selectedPartner ? (
              <Text fw={600}>{selectedPartner.name}</Text>
            ) : (
              <Text c="dimmed">Search partners...</Text>
            )}
          </InputBase>
        </Combobox.Target>

        <Combobox.Dropdown>
          <Combobox.Search
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.currentTarget.value)}
            placeholder="Search partners..."
          />
          <Combobox.Options>{options.length > 0 ? options : <Combobox.Empty>No partners found</Combobox.Empty>}</Combobox.Options>
        </Combobox.Dropdown>
      </Combobox>

      <input type="hidden" name="partnerId" value={selectedPartnerId || ''} required={required} />
    </>
  );
}
