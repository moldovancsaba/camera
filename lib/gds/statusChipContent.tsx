import { Group, Text } from '@mantine/core';
import { getStatusBadgeProps, type CameraStatusTone } from './presentation';

const toneColor: Record<CameraStatusTone, string> = {
  active: 'green',
  inactive: 'gray',
  info: 'blue',
  warning: 'yellow',
  danger: 'red',
};

export interface StatusChipPart {
  tone: CameraStatusTone;
  label?: string;
}

/**
 * WHAT: Renders colored label text for a resource-card status chip -- not
 *     a Badge element.
 * WHY: AdminResourceCard's `status` slot (MediaPreviewCard, in
 *     @sovereignsquad/gds-core) already wraps whatever it's given in its
 *     own <Badge variant="light">. Passing a <StatusBadge> (itself a
 *     Badge) rendered a badge nested inside a badge -- a visibly doubled
 *     pill in production. This colors the text instead, so the single
 *     badge the library already renders is the only pill on screen.
 *     Pass more than one part (e.g. scope + active state) to show them
 *     joined inside that one pill rather than as separate badges, since
 *     the slot only ever renders one.
 */
export function getStatusChipContent(...parts: StatusChipPart[]) {
  return (
    <Group gap={6} wrap="nowrap">
      {parts.flatMap(({ tone, label }, index) => {
        const { children } = getStatusBadgeProps(tone, label);
        const nodes = [];
        if (index > 0) {
          nodes.push(
            <Text key={`sep-${index}`} component="span" c="dimmed">
              ·
            </Text>
          );
        }
        nodes.push(
          <Text key={`part-${index}`} component="span" fw={700} c={toneColor[tone]}>
            {children}
          </Text>
        );
        return nodes;
      })}
    </Group>
  );
}
