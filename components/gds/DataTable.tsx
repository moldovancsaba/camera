'use client';

import {
  DataTable as GdsDataTable,
  type DataTableColumn as GdsDataTableColumn,
} from '@doneisbetter/gds-admin/client';
import type { Key, ReactNode } from 'react';

export interface DataTableColumn<T> {
  key: string;
  label: string;
  render?: (item: T) => ReactNode;
}

export interface DataTableProps<T> {
  data: T[];
  columns: DataTableColumn<T>[];
  loading?: boolean;
  getRowKey?: (item: T, index: number) => Key;
}

export default function DataTable<T extends object>({
  data,
  columns,
  loading,
  getRowKey,
}: DataTableProps<T>) {
  return (
    <GdsDataTable
      data={data as Record<string, unknown>[]}
      columns={columns as GdsDataTableColumn<Record<string, unknown>>[]}
      loading={loading}
      getRowKey={getRowKey as ((item: Record<string, unknown>, index: number) => Key) | undefined}
    />
  );
}
