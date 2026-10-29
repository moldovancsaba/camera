import { Group, Text } from '@mantine/core';
import { getStatusBadgeProps, type CameraStatusTone } from './presentation';
import VisibilityStatusIcon from '@/components/gds/VisibilityStatusIcon';

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
  /** Render the shared visibility icon instead of a text state label. */
  visibility?: boolean;
}

/**
 * WHAT: Renders colored descriptor labels and visibility icons for a
 *     resource-card status chip -- not a Badge element.
 * WHY: AdminResourceCard's `status` slot (MediaPreviewCard, in
 *     @sovereignsquad/gds-core) already wraps whatever it's given in its
 *     own <Badge variant="light">. Passing a <StatusBadge> (itself a
 *     Badge) rendered a badge nested inside a badge -- a visibly doubled
 *     pill in production. Descriptor text is colored in place; visibility
 *     states use the shared eye icon. Pass more than one part (e.g. scope +
 *     visibility) to show them joined inside the one pill the library renders.
 */
export function getStatusChipContent(...parts: StatusChipPart[]) {
  return (
    <Group gap={6} wrap="nowrap">
      {parts.flatMap(({ tone, label, visibility }, index) => {
        const { children } = getStatusBadgeProps(tone, label);
        const nodes = [];
        if (index > 0) {
          nodes.push(
            <Text key={`sep-${index}`} component="span" c="dimmed">
              ·
            </Text>
          );
        }
        nodes.push(visibility === undefined ? (
          <Text key={`part-${index}`} component="span" fw={700} c={toneColor[tone]}>
            {children}
          </Text>
        ) : (
          <VisibilityStatusIcon key={`part-${index}`} isVisible={visibility} />
        ));
        return nodes;
      })}
    </Group>
  );
}
