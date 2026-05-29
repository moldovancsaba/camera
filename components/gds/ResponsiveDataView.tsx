'use client';

import {
  ResponsiveDataView as GdsResponsiveDataView,
  type DataTableColumn as GdsDataTableColumn,
} from '@doneisbetter/gds-admin/client';
import type { Key, ReactNode } from 'react';

export interface ResponsiveDataViewFilterChip {
  label: string;
  onRemove?: () => void;
}

export interface ResponsiveDataViewProps<T> {
  data: T[];
  columns: Array<{
    key: string;
    label: string;
    render?: (item: T) => ReactNode;
  }>;
  renderCard: (item: T, index: number) => ReactNode;
  loading?: boolean;
  error?: string;
  errorAction?: ReactNode;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
  activeFilters?: ResponsiveDataViewFilterChip[];
  toolbar?: ReactNode;
  filterDrawer?: ReactNode;
  mobileFilters?: ReactNode;
  getRowKey?: (item: T, index: number) => Key;
}

export default function ResponsiveDataView<T extends object>({
  data,
  columns,
  renderCard,
  loading,
  error,
  errorAction,
  emptyTitle,
  emptyDescription,
  emptyAction,
  activeFilters,
  toolbar,
  filterDrawer,
  mobileFilters,
  getRowKey,
}: ResponsiveDataViewProps<T>) {
  return (
    <GdsResponsiveDataView
      data={data as Record<string, unknown>[]}
      columns={columns as GdsDataTableColumn<Record<string, unknown>>[]}
      renderCard={renderCard as (item: Record<string, unknown>, index: number) => ReactNode}
      loading={loading}
      error={error}
      errorAction={errorAction}
      emptyTitle={emptyTitle}
      emptyDescription={emptyDescription}
      emptyAction={emptyAction}
      activeFilters={activeFilters}
      toolbar={toolbar}
      filterDrawer={filterDrawer}
      mobileFilters={mobileFilters}
      getRowKey={getRowKey as ((item: Record<string, unknown>, index: number) => Key) | undefined}
    />
  );
}
