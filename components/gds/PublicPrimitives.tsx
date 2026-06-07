import Link from 'next/link';
import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  CSSProperties,
  ElementType,
  HTMLAttributes,
  ImgHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';

type AnyProps = Record<string, unknown>;
type WithChildren = { children?: ReactNode };
type WithStyle = { style?: CSSProperties };
type CompatProps = { [key: string]: unknown };
type SpacingValue = number | string;
type LayoutProps = HTMLAttributes<HTMLDivElement> & WithChildren & WithStyle & {
  gap?: SpacingValue;
  align?: CSSProperties['alignItems'];
  justify?: CSSProperties['justifyContent'];
  wrap?: CSSProperties['flexWrap'];
  mt?: SpacingValue;
  mb?: SpacingValue;
  pt?: SpacingValue;
  grow?: boolean;
  maw?: SpacingValue;
  mx?: SpacingValue;
  ta?: CSSProperties['textAlign'];
} & CompatProps;
type LabelledInputProps = {
  label?: ReactNode;
  description?: ReactNode;
  error?: ReactNode;
  styles?: { input?: CSSProperties; label?: CSSProperties; root?: CSSProperties };
  placeholder?: string;
  size?: string;
  radius?: string;
};
type TextInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> & LabelledInputProps & WithStyle & CompatProps;
type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & LabelledInputProps & WithStyle & {
  autosize?: boolean;
  minRows?: number;
} & CompatProps;
type SelectOption = { value: string; label: string };
type SelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'value' | 'onChange' | 'size'> & LabelledInputProps & {
  data?: SelectOption[];
  value?: string | null;
  onChange?: (value: string | null) => void;
  clearable?: boolean;
  checkIconPosition?: string;
} & CompatProps;
type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'size' | 'type'> & LabelledInputProps & CompatProps;
type FileInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'onChange' | 'size' | 'value'> & LabelledInputProps & {
  onChange?: (file: File | null) => void;
} & CompatProps;
type ColorInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'onChange' | 'size' | 'value'> & LabelledInputProps & {
  value?: string;
  onChange?: (value: string) => void;
} & CompatProps;
type NumberInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'onChange' | 'size' | 'value'> & LabelledInputProps & {
  value?: number | string;
  onChange?: (value: number | string) => void;
} & CompatProps;
type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & WithChildren & WithStyle & {
  component?: ElementType;
  href?: string;
  variant?: string;
  fullWidth?: boolean;
  size?: string;
  radius?: string;
  color?: string;
  loading?: boolean;
  mt?: SpacingValue;
  target?: string;
  rel?: string;
  download?: boolean | string;
} & CompatProps;
type AnchorProps = AnchorHTMLAttributes<HTMLAnchorElement> & WithChildren & WithStyle & {
  href?: string;
  component?: ElementType;
  size?: string;
  underline?: string;
} & CompatProps;
type TextProps = HTMLAttributes<HTMLElement> & WithChildren & WithStyle & {
  component?: ElementType;
  span?: boolean;
  fw?: CSSProperties['fontWeight'];
  fz?: SpacingValue;
  size?: SpacingValue;
  c?: string;
  ta?: CSSProperties['textAlign'];
  mt?: SpacingValue;
  mb?: SpacingValue;
  miw?: SpacingValue;
  tt?: CSSProperties['textTransform'];
  ff?: CSSProperties['fontFamily'];
  href?: string;
} & CompatProps;
type RadioGroupProps = WithChildren & {
  value?: string;
  onChange?: (value: string) => void;
} & CompatProps;

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

function consumeCompat(...values: unknown[]) {
  return values.length;
}

export function Stack({ children, gap = 'md', align, mt, mb, maw, mx, ta, style, ...props }: LayoutProps) {
  return <div style={{ display: 'flex', flexDirection: 'column', gap: spacing(gap), alignItems: align, marginTop: spacing(mt), marginBottom: spacing(mb), maxWidth: spacing(maw), marginInline: mx === 'auto' ? 'auto' : spacing(mx), textAlign: ta, ...style }} {...(props as HTMLAttributes<HTMLDivElement>)}>{children}</div>;
}

export function Group({ children, gap = 'md', justify, align, grow, wrap = 'wrap', mt, mb, pt, maw, mx, ta, style, ...props }: LayoutProps) {
  return <div style={{ display: 'flex', flexWrap: wrap, gap: spacing(gap), justifyContent: justify, alignItems: align, marginTop: spacing(mt), marginBottom: spacing(mb), paddingTop: spacing(pt), maxWidth: spacing(maw), marginInline: mx === 'auto' ? 'auto' : spacing(mx), textAlign: ta, ...(grow ? { ['--public-group-child-flex' as string]: '1 1 0' } : null), ...style }} {...(props as HTMLAttributes<HTMLDivElement>)}>{children}</div>;
}

export function SimpleGrid({ children, cols = 1, spacing: gap = 'md', style, ...props }: AnyProps & { children?: ReactNode }) {
  const columns = typeof cols === 'number' ? cols : typeof cols === 'object' && cols !== null && 'base' in cols ? Number((cols as { base?: number }).base ?? 1) : 1;
  return <div style={{ display: 'grid', gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gap: spacing(gap), ...(style as CSSProperties) }} {...props}>{children}</div>;
}

export function Grid({ children, style, ...props }: AnyProps & { children?: ReactNode }) {
  return <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))', ...(style as CSSProperties) }} {...props}>{children}</div>;
}

Grid.Col = function GridCol({ children, style, ...props }: AnyProps & { children?: ReactNode }) {
  return <div style={style as CSSProperties} {...props}>{children}</div>;
};

export function Card({ children, p, padding, withBorder, style, styles, ...props }: AnyProps & { children?: ReactNode }) {
  return <section style={{ border: withBorder === false ? undefined : '1px solid var(--gds-color-border-subtle)', borderRadius: 'var(--gds-radius-lg)', background: 'var(--gds-color-surface)', padding: spacing(p ?? padding ?? 'md'), boxShadow: 'var(--gds-shadow-sm)', ...((styles as { root?: CSSProperties } | undefined)?.root ?? {}), ...(style as CSSProperties) }} {...props}>{children}</section>;
}

export function Alert({ children, title, style, ...props }: AnyProps & { children?: ReactNode }) {
  return <div role={(props.role as string) ?? 'status'} style={{ border: '1px solid var(--gds-color-border-subtle)', borderRadius: 'var(--gds-radius-md)', background: 'var(--gds-color-surface-muted)', padding: '0.85rem', ...(style as CSSProperties) }} {...props}>{title ? <Text fw={700}>{title as ReactNode}</Text> : null}{children}</div>;
}

export function Text({ children, component, span, fw, fz, size, c, ta, mt, mb, miw, tt, ff, href, style, ...props }: TextProps) {
  const Component = (component as ElementType) ?? (span ? 'span' : 'p');
  return <Component href={href} style={{ margin: span ? undefined : 0, marginTop: spacing(mt), marginBottom: spacing(mb), minWidth: spacing(miw), color: textColor(c), fontSize: fontSize(fz ?? size), fontWeight: fw, textAlign: ta, textTransform: tt, fontFamily: ff, ...style }} {...props}>{children}</Component>;
}

export function Code({ children, block, style, ...props }: AnyProps & { children?: ReactNode }) {
  return <code style={{ display: block ? 'block' : undefined, overflowWrap: 'anywhere', fontFamily: 'var(--mantine-font-family-monospace, ui-monospace, SFMono-Regular, Menlo, monospace)', fontSize: '0.875em', ...(style as CSSProperties) }} {...props}>{children}</code>;
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

export function Button({ children, component, href, variant, fullWidth, disabled, loading, mt, style, ...props }: ButtonProps) {
  const commonStyle: CSSProperties = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: fullWidth ? '100%' : undefined, marginTop: spacing(mt), borderRadius: '999px', border: '1px solid var(--gds-color-border-subtle)', background: variant === 'default' || variant === 'subtle' || variant === 'light' ? 'var(--gds-color-surface)' : 'var(--gds-color-action-primary)', color: variant === 'default' || variant === 'subtle' || variant === 'light' ? 'var(--gds-color-text)' : 'var(--gds-color-on-action-primary)', padding: '0.65rem 1rem', fontWeight: 800, textDecoration: 'none', cursor: disabled || loading ? 'not-allowed' : 'pointer', opacity: disabled || loading ? 0.55 : undefined, ...style };
  const linkProps = props as AnchorHTMLAttributes<HTMLAnchorElement>;
  if (component === Link || component === 'a' || href) return <Link href={href ?? '#'} style={commonStyle} {...linkProps}>{loading ? 'Loading...' : children}</Link>;
  if (component === 'span') return <span style={commonStyle} {...props}>{children}</span>;
  return <button type={props.type ?? 'button'} disabled={Boolean(disabled || loading)} style={commonStyle} {...(props as ButtonHTMLAttributes<HTMLButtonElement>)}>{loading ? 'Loading...' : children}</button>;
}

export function Anchor({ children, href = '#', style, ...props }: AnchorProps) {
  return <Link href={href} style={{ color: 'inherit', textDecoration: 'none', ...style }} {...(props as AnchorHTMLAttributes<HTMLAnchorElement>)}>{children}</Link>;
}

export function Breadcrumbs({ children, style, ...props }: AnyProps & { children?: ReactNode }) {
  return <nav aria-label="Breadcrumb" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', ...(style as CSSProperties) }} {...props}>{children}</nav>;
}

export function TextInput({ label, error, style, styles, size: _size, radius: _radius, ...props }: TextInputProps) {
  consumeCompat(_size, _radius);
  return <label style={{ display: 'grid', gap: '0.35rem', ...style }}>{label ? <span style={{ fontWeight: 700 }}>{label}</span> : null}<input style={{ border: `1px solid ${error ? 'var(--gds-color-danger-strong)' : 'var(--gds-color-border-subtle)'}`, borderRadius: 'var(--gds-radius-md)', padding: '0.75rem', ...(styles?.input ?? {}) }} {...props} />{error ? <span style={{ color: 'var(--gds-color-danger-strong)', fontSize: '0.8rem' }}>{error}</span> : null}</label>;
}

export function NumberInput({ value, onChange, min, max, step, style, size: _size, radius: _radius, label: _label, description: _description, error: _error, styles: _styles, ...props }: NumberInputProps) {
  consumeCompat(_size, _radius, _label, _description, _error, _styles);
  return <input type="number" value={value} min={min} max={max} step={step} onChange={(event) => onChange?.(event.currentTarget.value === '' ? '' : Number(event.currentTarget.value))} style={{ minHeight: 44, padding: '0 0.75rem', ...style }} {...props} />;
}

export function Textarea({ label, description, error, style, styles, autosize, minRows, ...props }: TextareaProps) {
  return <label style={{ display: 'grid', gap: '0.35rem', ...style }}>{label ? <span style={{ fontWeight: 700 }}>{label}</span> : null}<textarea rows={minRows} style={{ border: `1px solid ${error ? 'var(--gds-color-danger-strong)' : 'var(--gds-color-border-subtle)'}`, borderRadius: 'var(--gds-radius-md)', padding: '0.75rem', resize: autosize ? 'vertical' : undefined, ...(styles?.input ?? {}) }} {...props} />{description ? <span style={{ color: 'var(--gds-color-text-muted)', fontSize: '0.8rem' }}>{description}</span> : null}{error ? <span style={{ color: 'var(--gds-color-danger-strong)', fontSize: '0.8rem' }}>{error}</span> : null}</label>;
}

export function Select({ label, data = [], value, onChange, clearable, error, size: _size, radius: _radius, placeholder: _placeholder, description: _description, styles: _styles, checkIconPosition: _checkIconPosition, ...props }: SelectProps) {
  consumeCompat(_size, _radius, _placeholder, _description, _styles, _checkIconPosition);
  return <label style={{ display: 'grid', gap: '0.35rem' }}>{label ? <span style={{ fontWeight: 700 }}>{label}</span> : null}<select value={value ?? ''} onChange={(event) => onChange?.(event.currentTarget.value || null)} style={{ border: '1px solid var(--gds-color-border-subtle)', borderRadius: 'var(--gds-radius-md)', padding: '0.75rem' }} {...props}>{clearable ? <option value="">None</option> : null}{data.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>{error ? <span style={{ color: 'var(--gds-color-danger-strong)', fontSize: '0.8rem' }}>{error}</span> : null}</label>;
}

export function Checkbox({ label, description, checked, defaultChecked, onChange, styles, size: _size, radius: _radius, ...props }: CheckboxProps) {
  consumeCompat(_size, _radius);
  return <label style={{ display: 'grid', gap: '0.35rem', lineHeight: 1.6, ...(styles?.label ?? {}) }}><span style={{ display: 'flex', alignItems: 'flex-start', gap: '0.65rem' }}><input type="checkbox" checked={checked} defaultChecked={defaultChecked} onChange={onChange} {...props} /><span>{label}</span></span>{description ? <span style={{ color: 'var(--gds-color-text-muted)', fontSize: '0.8rem' }}>{description}</span> : null}</label>;
}

export function FileInput({ label, description, accept, onChange, style, size: _size, radius: _radius, error: _error, styles: _styles, ...props }: FileInputProps) {
  consumeCompat(_size, _radius, _error, _styles);
  return <label style={{ display: 'grid', gap: '0.35rem', fontWeight: 700, ...style }}>{label}<input type="file" accept={accept} onChange={(event) => onChange?.(event.currentTarget.files?.[0] ?? null)} {...props} />{description ? <span style={{ color: 'var(--gds-color-text-muted)', fontSize: '0.8rem', fontWeight: 400 }}>{description}</span> : null}</label>;
}

export function ColorInput({ label, description, value, onChange, style, size: _size, radius: _radius, error: _error, styles: _styles, ...props }: ColorInputProps) {
  consumeCompat(_size, _radius, _error, _styles);
  return <label style={{ display: 'grid', gap: '0.35rem', fontWeight: 700, ...style }}>{label}<input type="color" value={value} onChange={(event) => onChange?.(event.currentTarget.value)} style={{ minHeight: 44 }} {...props} />{description ? <span style={{ color: 'var(--gds-color-text-muted)', fontSize: '0.8rem', fontWeight: 400 }}>{description}</span> : null}</label>;
}

export function Radio({ value, label }: { value: string; label: string }) {
  return <option value={value}>{label}</option>;
}

Radio.Group = function RadioGroup({ value, onChange, children }: RadioGroupProps) {
  const options = Array.isArray(children) ? children : [children];
  return (
    <select value={value as string} onChange={(event) => (onChange as ((value: string) => void) | undefined)?.(event.currentTarget.value)} style={{ minHeight: 44, padding: '0 0.75rem' }}>
      {options.flatMap((child) => {
        if (!child || typeof child !== 'object' || !('props' in child)) return [];
        const props = (child as { props?: { children?: ReactNode; value?: string; label?: string } }).props;
        if (props?.children) {
          const nested = Array.isArray(props.children) ? props.children : [props.children];
          return nested.flatMap((nestedChild) => {
            if (!nestedChild || typeof nestedChild !== 'object' || !('props' in nestedChild)) return [];
            const nestedProps = (nestedChild as { props?: { value?: string; label?: string } }).props;
            return nestedProps?.value ? [<option key={nestedProps.value} value={nestedProps.value}>{nestedProps.label}</option>] : [];
          });
        }
        return props?.value ? [<option key={props.value} value={props.value}>{props.label}</option>] : [];
      })}
    </select>
  );
};

export function Field({ label, children, helper }: AnyProps & { children?: ReactNode }) {
  return <Stack gap={6}><Text size="sm" fw={500}>{label as ReactNode}</Text>{children}{helper ? <Text size="xs" c="dimmed">{helper as ReactNode}</Text> : null}</Stack>;
}

export function ColorField({ id, label, value, onChange, helper }: AnyProps) {
  return (
    <Field label={label as ReactNode} helper={helper as string | undefined}>
      <ColorInput id={id as string | undefined} value={value as string | undefined} onChange={onChange as ((value: string) => void) | undefined} />
    </Field>
  );
}

export function Image({ src, alt, style, h, fit, ...props }: ImgHTMLAttributes<HTMLImageElement> & { h?: number | string; fit?: CSSProperties['objectFit'] }) {
  // Local GDS boundary replacement for legacy Mantine Image usage.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} style={{ display: 'block', height: spacing(h) ?? 160, objectFit: fit ?? 'cover', width: '100%', ...style }} {...props} />;
}

export function Paper({ children, style, ...props }: AnyProps & { children?: ReactNode }) {
  return <div style={{ border: '1px solid var(--gds-color-border)', borderRadius: '0.75rem', padding: '0.75rem', ...(style as CSSProperties) }} {...props}>{children}</div>;
}

export function UnstyledButton({ children, onClick, style, ...props }: AnyProps & { children?: ReactNode }) {
  return <button type="button" onClick={onClick as (() => void) | undefined} style={{ background: 'transparent', border: 0, ...style as CSSProperties }} {...props}>{children}</button>;
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
