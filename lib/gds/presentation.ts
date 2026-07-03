import type { AccentTone, StatusVariant } from '@sovereignsquad/gds-core/server';
import type { AdminIconKey } from '@/lib/gds/admin-icon-key';

export type CameraStatusTone = 'active' | 'inactive' | 'info' | 'warning' | 'danger';

const statusMap: Record<CameraStatusTone, { status: StatusVariant; labelPrefix?: string }> = {
  active: { status: 'success', labelPrefix: 'Active' },
  inactive: { status: 'neutral', labelPrefix: 'Inactive' },
  info: { status: 'info' },
  warning: { status: 'warning' },
  danger: { status: 'danger' },
};

export function getStatusBadgeProps(tone: CameraStatusTone, label?: string) {
  const config = statusMap[tone];
  return {
    status: config.status,
    children: label ?? config.labelPrefix ?? tone,
  };
}

export type CameraInfoTone = 'neutral' | 'blue' | 'green' | 'cyan' | 'yellow';

export const cameraInfoToneMap: Record<CameraInfoTone, AccentTone> = {
  neutral: 'gray',
  blue: 'blue',
  green: 'green',
  cyan: 'blue',
  yellow: 'amber',
};

export interface CameraStatItem {
  label: string;
  value: string | number;
  iconKey?: AdminIconKey;
}
