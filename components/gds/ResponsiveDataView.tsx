import { Box, Stack } from '@mantine/core';

export interface ResponsiveDataViewProps {
  table: React.ReactNode;
  mobile: React.ReactNode;
}

/**
 * Desktop table + mobile card/list fallback (GDS responsive data view contract).
 */
export default function ResponsiveDataView({ table, mobile }: ResponsiveDataViewProps) {
  return (
    <>
      <Box visibleFrom="md">{table}</Box>
      <Stack gap="md" hiddenFrom="md">
        {mobile}
      </Stack>
    </>
  );
}
