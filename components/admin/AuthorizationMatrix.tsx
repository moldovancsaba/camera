interface AuthorizationMatrixProps {
  title?: string;
  description?: string;
  compact?: boolean;
}

const ROWS = [
  {
    label: 'Global superadmin / admin',
    access: 'All admin surfaces',
    scope: 'Global + partner bypass',
    inventory: 'Full inventory',
    actions: 'Full create/update/delete',
  },
  {
    label: 'Partner app admin',
    access: 'Assigned partner + app surfaces',
    scope: 'Single partner/app',
    inventory: 'No global inventory',
    actions: 'Full partner/app operations',
  },
  {
    label: 'Partner app manager',
    access: 'Assigned partner + app surfaces',
    scope: 'Single partner/app',
    inventory: 'No global inventory',
    actions: 'Create/update inside scope',
  },
  {
    label: 'Partner app viewer',
    access: 'Assigned partner + app surfaces',
    scope: 'Single partner/app',
    inventory: 'No global inventory',
    actions: 'Read-only',
  },
];

export default function AuthorizationMatrix({
  title = 'Permission Matrix',
  description = 'This is the implemented authorization model for the current admin shell.',
  compact = false,
}: AuthorizationMatrixProps) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <div className="border-b border-gray-200 px-6 py-5 dark:border-gray-700">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h2>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">{description}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-900">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400">
                Role
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400">
                Visible Surfaces
              </th>
              {!compact ? (
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400">
                  Scope
                </th>
              ) : null}
              <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400">
                Global Inventory
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400">
                Mutations
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {ROWS.map((row) => (
              <tr key={row.label}>
                <td className="px-6 py-4 text-sm font-medium text-gray-900 dark:text-white">{row.label}</td>
                <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-300">{row.access}</td>
                {!compact ? (
                  <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-300">{row.scope}</td>
                ) : null}
                <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-300">{row.inventory}</td>
                <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-300">{row.actions}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
