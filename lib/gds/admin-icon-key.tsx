'use client';

import {
  IconAdjustments,
  IconArrowLeft,
  IconBrandDatabricks,
  IconBuildingStore,
  IconCalendarEvent,
  IconFrame,
  IconLayoutDashboard,
  IconPhoto,
  IconPhotoScan,
  IconPlus,
  IconSearch,
  IconSparkles,
  IconTool,
  IconUser,
  IconUsers,
  IconUserShield,
  IconWorld,
} from '@tabler/icons-react';

export type AdminIconKey =
  | 'adjustments'
  | 'arrowLeft'
  | 'brandDatabricks'
  | 'buildingStore'
  | 'calendarEvent'
  | 'frame'
  | 'layoutDashboard'
  | 'photo'
  | 'photoScan'
  | 'plus'
  | 'search'
  | 'sparkles'
  | 'tool'
  | 'user'
  | 'users'
  | 'userShield'
  | 'world';

const iconMap = {
  adjustments: IconAdjustments,
  arrowLeft: IconArrowLeft,
  brandDatabricks: IconBrandDatabricks,
  buildingStore: IconBuildingStore,
  calendarEvent: IconCalendarEvent,
  frame: IconFrame,
  layoutDashboard: IconLayoutDashboard,
  photo: IconPhoto,
  photoScan: IconPhotoScan,
  plus: IconPlus,
  search: IconSearch,
  sparkles: IconSparkles,
  tool: IconTool,
  user: IconUser,
  users: IconUsers,
  userShield: IconUserShield,
  world: IconWorld,
} satisfies Record<AdminIconKey, typeof IconFrame>;

export function AdminIcon({ iconKey, size = 20 }: { iconKey: AdminIconKey; size?: number }) {
  const Icon = iconMap[iconKey];
  return <Icon size={size} />;
}
