import { Stack } from '@mantine/core';

export interface ResponsiveDataViewProps {
  table: React.ReactNode;
  mobile: React.ReactNode;
}

/**
 * Desktop table + mobile card/list fallback (GDS responsive data view contract).
 * Uses admin-scoped CSS breakpoints aligned with Mantine `md` (~62em).
 */
export default function ResponsiveDataView({ table, mobile }: ResponsiveDataViewProps) {
  return (
    <>
      <div className="gds-responsive-table">{table}</div>
      <Stack gap="md" className="gds-responsive-mobile">
        {mobile}
      </Stack>
    </>
  );
}
