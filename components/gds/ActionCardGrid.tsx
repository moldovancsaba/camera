'use client';

import Link from 'next/link';
import { ConsumerDashboardGrid, ProductCard } from '@doneisbetter/gds-core/client';
import { AdminIcon, type AdminIconKey } from '@/lib/gds/admin-icon-key';

export interface ActionCardItem {
  href: string;
  title: string;
  description?: string;
  iconKey?: AdminIconKey;
}

export default function ActionCardGrid({ items }: { items: ActionCardItem[] }) {
  return (
    <ConsumerDashboardGrid columns={3}>
      {items.map((item) => (
        <ProductCard
          key={item.href}
          title={item.title}
          description={item.description}
          icon={item.iconKey ? <AdminIcon iconKey={item.iconKey} size={20} /> : undefined}
          primaryAction={
            <Link href={item.href} style={{ textDecoration: 'none' }}>
              Open
            </Link>
          }
        />
      ))}
    </ConsumerDashboardGrid>
  );
}
