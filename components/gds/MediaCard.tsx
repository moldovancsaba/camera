'use client';

import Image from 'next/image';
import { AspectRatio, Box, Card, Group, Stack, Text } from '@mantine/core';

interface MediaCardProps {
  src: string;
  alt: string;
  caption?: string;
  action?: React.ReactNode;
  ratio?: number;
  fit?: 'contain' | 'cover';
  padding?: number;
}

export default function MediaCard({
  src,
  alt,
  caption,
  action,
  ratio = 1,
  fit = 'contain',
  padding = 24,
}: MediaCardProps) {
  return (
    <Card withBorder radius="md" bg="var(--mantine-color-gray-0)">
      <Stack gap="sm">
        <AspectRatio ratio={ratio}>
          <Box bg="gray.1" style={{ borderRadius: 12, overflow: 'hidden', position: 'relative' }}>
            <Image
              src={src}
              alt={alt}
              fill
              unoptimized
              style={{ objectFit: fit, padding }}
            />
          </Box>
        </AspectRatio>
        {caption || action ? (
          <Group justify="space-between" align="center">
            {caption ? (
              <Text size="sm" c="dimmed">
                {caption}
              </Text>
            ) : (
              <div />
            )}
            {action}
          </Group>
        ) : null}
      </Stack>
    </Card>
  );
}
