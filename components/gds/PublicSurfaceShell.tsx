'use client';

import { Box, Container, Paper, type MantineSize } from '@mantine/core';

interface PublicSurfaceShellProps {
  children: React.ReactNode;
  size?: MantineSize | number | string;
  centered?: boolean;
  padded?: boolean;
}

export default function PublicSurfaceShell({
  children,
  size = 'lg',
  centered = false,
  padded = true,
}: PublicSurfaceShellProps) {
  return (
    <Box
      style={{
        minHeight: '100dvh',
        display: 'flex',
        alignItems: centered ? 'center' : 'stretch',
        paddingBlock: padded ? '2rem' : 0,
      }}
    >
      <Container size={size} style={{ width: '100%' }}>
        <Paper
          radius="xl"
          shadow="xl"
          withBorder
          p={{ base: 'lg', md: 'xl' }}
          style={{
            background: 'rgba(255, 255, 255, 0.94)',
            backdropFilter: 'blur(12px)',
          }}
        >
          {children}
        </Paper>
      </Container>
    </Box>
  );
}
