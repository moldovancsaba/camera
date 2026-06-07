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
    <section
      style={{
        border: '1px solid var(--mantine-color-gray-3)',
        borderRadius: 'var(--mantine-radius-md)',
        overflow: 'hidden',
      }}
    >
      <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--mantine-color-gray-2)' }}>
        <h3 style={{ margin: 0 }}>{title}</h3>
        <p style={{ color: 'var(--mantine-color-dimmed)', margin: 'var(--mantine-spacing-xs) 0 0' }}>
          {description}
        </p>
      </div>
      <div>
        {ROWS.map((row, index) => (
          <div
            key={row.label}
            style={{
              alignItems: 'flex-start',
              borderTop: index > 0 ? '1px solid var(--mantine-color-gray-2)' : undefined,
              display: 'flex',
              flexWrap: 'wrap',
              gap: 'var(--mantine-spacing-xl)',
              justifyContent: 'space-between',
              padding: 'var(--mantine-spacing-xl)',
            }}
          >
            <div style={{ display: 'grid', gap: 4, maxWidth: 260 }}>
              <strong style={{ color: 'var(--mantine-color-dimmed)', fontSize: 'var(--mantine-font-size-xs)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                Role
              </strong>
              <span style={{ fontWeight: 600 }}>
                {row.label}
              </span>
            </div>
            <div style={{ display: 'grid', gap: 4, maxWidth: 260 }}>
              <strong style={{ color: 'var(--mantine-color-dimmed)', fontSize: 'var(--mantine-font-size-xs)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                Visible Surfaces
              </strong>
              <span style={{ color: 'var(--mantine-color-dimmed)' }}>
                {row.access}
              </span>
            </div>
            {!compact ? (
              <div style={{ display: 'grid', gap: 4, maxWidth: 220 }}>
                <strong style={{ color: 'var(--mantine-color-dimmed)', fontSize: 'var(--mantine-font-size-xs)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                  Scope
                </strong>
                <span style={{ color: 'var(--mantine-color-dimmed)' }}>
                  {row.scope}
                </span>
              </div>
            ) : null}
            <div style={{ display: 'grid', gap: 4, maxWidth: 220 }}>
              <strong style={{ color: 'var(--mantine-color-dimmed)', fontSize: 'var(--mantine-font-size-xs)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                Global Inventory
              </strong>
              <span style={{ color: 'var(--mantine-color-dimmed)' }}>
                {row.inventory}
              </span>
            </div>
            <div style={{ display: 'grid', gap: 4, maxWidth: 220 }}>
              <strong style={{ color: 'var(--mantine-color-dimmed)', fontSize: 'var(--mantine-font-size-xs)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                Mutations
              </strong>
              <span style={{ color: 'var(--mantine-color-dimmed)' }}>
                {row.actions}
              </span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
