import Link from 'next/link';
import type { CSSProperties, ElementType, ReactNode } from 'react';

type AnyProps = Record<string, unknown>;

function spacing(value?: unknown): string | undefined {
  if (typeof value === 'number') return `${value}px`;
  if (typeof value !== 'string') return undefined;
  return ({ xs: '0.35rem', sm: '0.55rem', md: '0.85rem', lg: '1.25rem', xl: '1.75rem' } as Record<string, string>)[value] ?? value;
}

function textColor(value?: unknown): string | undefined {
  if (value === 'dimmed') return 'var(--gds-color-text-muted)';
  if (value === 'red') return 'var(--gds-color-danger-strong)';
  if (typeof value === 'string') return value;
  return undefined;
}

function fontSize(value?: unknown): string | undefined {
  if (typeof value === 'number') return `${value}px`;
  if (typeof value !== 'string') return undefined;
  return ({ xs: '0.75rem', sm: '0.875rem', md: '1rem', lg: '1.125rem', xl: '1.25rem' } as Record<string, string>)[value] ?? value;
}

export function Stack({ children, gap = 'md', align, mt, style, ...props }: AnyProps & { children?: ReactNode }) {
  return <div style={{ display: 'flex', flexDirection: 'column', gap: spacing(gap), alignItems: align as CSSProperties['alignItems'], marginTop: spacing(mt), ...(style as CSSProperties) }} {...props}>{children}</div>;
}

export function Group({ children, gap = 'md', justify, align, grow, wrap = 'wrap', mt, pt, style, ...props }: AnyProps & { children?: ReactNode }) {
  return <div style={{ display: 'flex', flexWrap: wrap as CSSProperties['flexWrap'], gap: spacing(gap), justifyContent: justify as CSSProperties['justifyContent'], alignItems: align as CSSProperties['alignItems'], marginTop: spacing(mt), paddingTop: spacing(pt), ...(grow ? { ['--public-group-child-flex' as string]: '1 1 0' } : null), ...(style as CSSProperties) }} {...props}>{children}</div>;
}

export function SimpleGrid({ children, cols = 1, spacing: gap = 'md', style, ...props }: AnyProps & { children?: ReactNode }) {
  const columns = typeof cols === 'number' ? cols : typeof cols === 'object' && cols !== null && 'base' in cols ? Number((cols as { base?: number }).base ?? 1) : 1;
  return <div style={{ display: 'grid', gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gap: spacing(gap), ...(style as CSSProperties) }} {...props}>{children}</div>;
}

export function Card({ children, p, padding, withBorder, style, styles, ...props }: AnyProps & { children?: ReactNode }) {
  return <section style={{ border: withBorder === false ? undefined : '1px solid var(--gds-color-border-subtle)', borderRadius: 'var(--gds-radius-lg)', background: 'var(--gds-color-surface)', padding: spacing(p ?? padding ?? 'md'), boxShadow: 'var(--gds-shadow-sm)', ...((styles as { root?: CSSProperties } | undefined)?.root ?? {}), ...(style as CSSProperties) }} {...props}>{children}</section>;
}

export function Alert({ children, title, style, ...props }: AnyProps & { children?: ReactNode }) {
  return <div role={(props.role as string) ?? 'status'} style={{ border: '1px solid var(--gds-color-border-subtle)', borderRadius: 'var(--gds-radius-md)', background: 'var(--gds-color-surface-muted)', padding: '0.85rem', ...(style as CSSProperties) }} {...props}>{title ? <Text fw={700}>{title as ReactNode}</Text> : null}{children}</div>;
}

export function Text({ children, component, span, fw, fz, size, c, ta, mt, style, ...props }: AnyProps & { children?: ReactNode }) {
  const Component = (component as ElementType) ?? (span ? 'span' : 'p');
  return <Component style={{ margin: span ? undefined : 0, marginTop: spacing(mt), color: textColor(c), fontSize: fontSize(fz ?? size), fontWeight: fw as CSSProperties['fontWeight'], textAlign: ta as CSSProperties['textAlign'], ...(style as CSSProperties) }} {...props}>{children}</Component>;
}

export function Title({ children, order = 2, ta, style, ...props }: AnyProps & { children?: ReactNode }) {
  const Tag = `h${Math.min(Math.max(Number(order) || 2, 1), 6)}` as ElementType;
  return <Tag style={{ margin: 0, textAlign: ta as CSSProperties['textAlign'], ...(style as CSSProperties) }} {...props}>{children}</Tag>;
}

export function Box({ children, w, maw, mx, style, ...props }: AnyProps & { children?: ReactNode }) {
  return <div style={{ width: w === '100%' ? '100%' : typeof w === 'number' ? `${w}px` : (w as string | undefined), maxWidth: typeof maw === 'number' ? `${maw}px` : (maw as string | undefined), marginInline: mx === 'auto' ? 'auto' : undefined, ...(style as CSSProperties) }} {...props}>{children}</div>;
}

export function Center({ children, mih, style, ...props }: AnyProps & { children?: ReactNode }) {
  return <div style={{ minHeight: typeof mih === 'number' ? `${mih}px` : (mih as string | undefined), display: 'grid', placeItems: 'center', ...(style as CSSProperties) }} {...props}>{children}</div>;
}

export function Badge({ children, style, ...props }: AnyProps & { children?: ReactNode }) {
  return <span style={{ display: 'inline-flex', alignItems: 'center', borderRadius: '999px', background: 'var(--gds-color-surface-muted)', color: 'var(--gds-color-text-muted)', padding: '0.2rem 0.55rem', fontSize: '0.75rem', fontWeight: 700, ...(style as CSSProperties) }} {...props}>{children}</span>;
}

export function Button({ children, component, href, variant, fullWidth, disabled, style, ...props }: AnyProps & { children?: ReactNode }) {
  const commonStyle: CSSProperties = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: fullWidth ? '100%' : undefined, borderRadius: '999px', border: '1px solid var(--gds-color-border-subtle)', background: variant === 'default' || variant === 'subtle' || variant === 'light' ? 'var(--gds-color-surface)' : 'var(--gds-color-action-primary)', color: variant === 'default' || variant === 'subtle' || variant === 'light' ? 'var(--gds-color-text)' : 'var(--gds-color-on-action-primary)', padding: '0.65rem 1rem', fontWeight: 800, textDecoration: 'none', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.55 : undefined, ...(style as CSSProperties) };
  if (component === Link || component === 'a' || href) return <Link href={(href as string) ?? '#'} style={commonStyle} {...props}>{children}</Link>;
  if (component === 'span') return <span style={commonStyle} {...props}>{children}</span>;
  return <button type={(props.type as 'button' | 'submit' | 'reset' | undefined) ?? 'button'} disabled={Boolean(disabled)} style={commonStyle} {...props}>{children}</button>;
}

export function Anchor({ children, href = '#', style, ...props }: AnyProps & { children?: ReactNode }) {
  return <Link href={href as string} style={{ color: 'inherit', textDecoration: 'none', ...(style as CSSProperties) }} {...props}>{children}</Link>;
}

export function TextInput({ label, error, style, styles, ...props }: AnyProps) {
  return <label style={{ display: 'grid', gap: '0.35rem', ...(style as CSSProperties) }}>{label ? <span style={{ fontWeight: 700 }}>{label as ReactNode}</span> : null}<input style={{ border: `1px solid ${error ? 'var(--gds-color-danger-strong)' : 'var(--gds-color-border-subtle)'}`, borderRadius: 'var(--gds-radius-md)', padding: '0.75rem', ...((styles as { input?: CSSProperties } | undefined)?.input ?? {}) }} {...props} />{error ? <span style={{ color: 'var(--gds-color-danger-strong)', fontSize: '0.8rem' }}>{error as ReactNode}</span> : null}</label>;
}

export function Select({ label, data = [], value, onChange, clearable, error, ...props }: AnyProps) {
  const options = Array.isArray(data) ? data as Array<{ value: string; label: string }> : [];
  return <label style={{ display: 'grid', gap: '0.35rem' }}>{label ? <span style={{ fontWeight: 700 }}>{label as ReactNode}</span> : null}<select value={(value as string | null) ?? ''} onChange={(event) => (onChange as ((value: string | null) => void) | undefined)?.(event.currentTarget.value || null)} style={{ border: '1px solid var(--gds-color-border-subtle)', borderRadius: 'var(--gds-radius-md)', padding: '0.75rem' }} {...props}>{clearable ? <option value="">None</option> : null}{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>{error ? <span style={{ color: 'var(--gds-color-danger-strong)', fontSize: '0.8rem' }}>{error as ReactNode}</span> : null}</label>;
}

export function Checkbox({ label, checked, onChange, styles, ...props }: AnyProps) {
  return <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.65rem', lineHeight: 1.6, ...((styles as { label?: CSSProperties } | undefined)?.label ?? {}) }}><input type="checkbox" checked={Boolean(checked)} onChange={onChange as never} {...props} /><span>{label as ReactNode}</span></label>;
}

export function Divider({ label, style, ...props }: AnyProps) {
  return <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: 'var(--gds-color-text-muted)', ...(style as CSSProperties) }} {...props}><span style={{ height: 1, flex: 1, background: 'var(--gds-color-border-subtle)' }} />{label ? <span>{label as ReactNode}</span> : null}<span style={{ height: 1, flex: 1, background: 'var(--gds-color-border-subtle)' }} /></div>;
}

export function Container({ children, size, style, ...props }: AnyProps & { children?: ReactNode }) {
  const maxWidth = size === 'xl' ? '1200px' : size === 'lg' ? '960px' : '720px';
  return <main style={{ width: '100%', maxWidth, marginInline: 'auto', padding: '1rem', ...(style as CSSProperties) }} {...props}>{children}</main>;
}

export function AspectRatio({ children, ratio = 1, style, ...props }: AnyProps & { children?: ReactNode }) {
  return <div style={{ position: 'relative', aspectRatio: String(ratio), ...(style as CSSProperties) }} {...props}>{children}</div>;
}
