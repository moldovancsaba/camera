'use client';

export default function AdminLoading() {
  const skeleton = (style: React.CSSProperties) => (
    <div
      style={{
        animation: 'pulse 1.4s ease-in-out infinite',
        background: 'var(--mantine-color-gray-2)',
        borderRadius: 'var(--mantine-radius-md)',
        ...style,
      }}
    />
  );

  return (
    <div style={{ display: 'grid', gap: 'var(--mantine-spacing-xl)' }}>
      <div style={{ display: 'grid', gap: 'var(--mantine-spacing-sm)' }}>
        {skeleton({ height: 12, width: 120 })}
        {skeleton({ height: 36, width: 240 })}
        {skeleton({ height: 18, maxWidth: 420, width: '100%' })}
      </div>

      <div style={{ display: 'grid', gap: 'var(--mantine-spacing-md)', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        {[1, 2, 3].map((item) => (
          <section key={item} style={{ border: '1px solid var(--mantine-color-gray-3)', borderRadius: 'var(--mantine-radius-md)', padding: 'var(--mantine-spacing-md)' }}>
            {skeleton({ height: 64 })}
          </section>
        ))}
      </div>

      <section style={{ border: '1px solid var(--mantine-color-gray-3)', borderRadius: 'var(--mantine-radius-md)', padding: 'var(--mantine-spacing-md)' }}>
        <div style={{ display: 'grid', gap: 'var(--mantine-spacing-md)' }}>
          {skeleton({ height: 24, width: 180 })}
          <div style={{ display: 'grid', gap: 'var(--mantine-spacing-md)', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
            {[1, 2, 3, 4].map((item) => (
              <div key={item}>{skeleton({ height: 96 })}</div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
