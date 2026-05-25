'use client';

import { Card, Stack, Text, Title } from '@mantine/core';

type InfoTone = 'neutral' | 'blue' | 'green' | 'cyan' | 'yellow';

interface InfoCardProps {
  title: string;
  description: string;
  tone?: InfoTone;
}

const toneStyles: Record<InfoTone, { bg?: string; titleColor?: string; bodyColor?: string }> = {
  neutral: {},
  blue: { bg: 'blue.0', titleColor: 'blue.9', bodyColor: 'blue.8' },
  green: { bg: 'green.0', titleColor: 'green.9', bodyColor: 'green.8' },
  cyan: { bg: 'cyan.0', titleColor: 'cyan.9', bodyColor: 'cyan.8' },
  yellow: { bg: 'yellow.0', titleColor: 'yellow.9', bodyColor: 'yellow.8' },
};

export default function InfoCard({
  title,
  description,
  tone = 'neutral',
}: InfoCardProps) {
  const style = toneStyles[tone];

  return (
    <Card bg={style.bg}>
      <Stack gap="sm">
        <Title order={4} c={style.titleColor}>
          {title}
        </Title>
        <Text size="sm" c={style.bodyColor ?? 'dimmed'}>
          {description}
        </Text>
      </Stack>
    </Card>
  );
}
