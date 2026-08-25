'use client';

import {
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
  IconUser,
  IconUsers,
  IconUserShield,
  IconWorld,
} from '@tabler/icons-react';

export type AdminIconKey =
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
  | 'user'
  | 'users'
  | 'userShield'
  | 'world';

const iconMap = {
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
  user: IconUser,
  users: IconUsers,
  userShield: IconUserShield,
  world: IconWorld,
} satisfies Record<AdminIconKey, typeof IconFrame>;

export function AdminIcon({ iconKey, size = 20 }: { iconKey: AdminIconKey; size?: number }) {
  const Icon = iconMap[iconKey];
  return <Icon size={size} />;
}
