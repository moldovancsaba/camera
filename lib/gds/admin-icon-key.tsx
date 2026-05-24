'use client';

import {
  IconBuildingStore,
  IconCalendarEvent,
  IconFrame,
  IconLayoutDashboard,
  IconPhoto,
  IconPhotoScan,
  IconPlus,
  IconSearch,
  IconUser,
  IconUsers,
  IconUserShield,
  IconWorld,
} from '@tabler/icons-react';

export type AdminIconKey =
  | 'buildingStore'
  | 'calendarEvent'
  | 'frame'
  | 'layoutDashboard'
  | 'photo'
  | 'photoScan'
  | 'plus'
  | 'search'
  | 'user'
  | 'users'
  | 'userShield'
  | 'world';

const iconMap = {
  buildingStore: IconBuildingStore,
  calendarEvent: IconCalendarEvent,
  frame: IconFrame,
  layoutDashboard: IconLayoutDashboard,
  photo: IconPhoto,
  photoScan: IconPhotoScan,
  plus: IconPlus,
  search: IconSearch,
  user: IconUser,
  users: IconUsers,
  userShield: IconUserShield,
  world: IconWorld,
} satisfies Record<AdminIconKey, typeof IconFrame>;

export function AdminIcon({ iconKey, size = 20 }: { iconKey: AdminIconKey; size?: number }) {
  const Icon = iconMap[iconKey];
  return <Icon size={size} />;
}
