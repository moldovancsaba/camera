'use client';

import { Paper, ScrollArea } from '@mantine/core';

export interface DataTableColumn {
  key: string;
  title: string;
  align?: 'left' | 'right' | 'center';
}

export default function DataTable({
  columns,
  children,
}: {
  columns: DataTableColumn[];
  children: React.ReactNode;
}) {
  return (
    <Paper p={0} style={{ overflow: 'hidden' }}>
      <ScrollArea>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead style={{ background: 'var(--mantine-color-gray-0)' }}>
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  style={{
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    fontSize: '0.72rem',
                    textAlign: column.align ?? 'left',
                    padding: '1rem 1.5rem',
                    color: 'var(--mantine-color-gray-6)',
                    borderBottom: '1px solid var(--mantine-color-gray-2)',
                  }}
                >
                  {column.title}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
      </ScrollArea>
    </Paper>
  );
}
