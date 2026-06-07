'use client';

export default function FramesLoading() {
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
      {skeleton({ height: 36, width: 280 })}
      <div style={{ display: 'grid', gap: 'var(--mantine-spacing-md)', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        {[1, 2, 3].map((item) => (
          <section key={item} style={{ border: '1px solid var(--mantine-color-gray-3)', borderRadius: 'var(--mantine-radius-md)', padding: 'var(--mantine-spacing-md)' }}>
            {skeleton({ height: 64 })}
          </section>
        ))}
      </div>
      <div style={{ display: 'grid', gap: 'var(--mantine-spacing-md)', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        {[1, 2, 3, 4, 5, 6, 7, 8].map((item) => (
          <section key={item} style={{ border: '1px solid var(--mantine-color-gray-3)', borderRadius: 'var(--mantine-radius-md)', overflow: 'hidden' }}>
            {skeleton({ borderRadius: 0, height: 220 })}
            <div style={{ display: 'grid', gap: 'var(--mantine-spacing-sm)', padding: 'var(--mantine-spacing-md)' }}>
              {skeleton({ height: 16, width: '70%' })}
              {skeleton({ height: 12, width: '90%' })}
              {skeleton({ height: 32 })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
