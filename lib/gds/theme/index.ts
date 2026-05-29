import {
  rem,
  type MantineColorsTuple,
  type MantineThemeOverride,
} from '@mantine/core';
import { extendGdsTheme } from '@doneisbetter/gds-theme/server';

const cameraTeal: MantineColorsTuple = [
  '#ebfffa',
  '#d1fef0',
  '#a1f8de',
  '#6ef2cb',
  '#46eebc',
  '#2cebb3',
  '#1ceab0',
  '#0fd09a',
  '#00b989',
  '#00a077',
];

const cameraSlate: MantineColorsTuple = [
  '#f3f7fb',
  '#e5eaf1',
  '#cad3de',
  '#adbaca',
  '#94a3b8',
  '#8190a8',
  '#76869f',
  '#64748b',
  '#58687f',
  '#4a5a70',
];

export const cameraMantineTheme: MantineThemeOverride = extendGdsTheme({
  primaryColor: 'cameraTeal',
  colors: {
    cameraTeal,
    cameraSlate,
  },
  white: '#ffffff',
  black: '#08111f',
  fontFamily: 'var(--font-geist-sans), Arial, Helvetica, sans-serif',
  fontFamilyMonospace: 'var(--font-geist-mono), monospace',
  defaultRadius: 'md',
  radius: {
    xs: rem(6),
    sm: rem(10),
    md: rem(14),
    lg: rem(18),
    xl: rem(24),
  },
  spacing: {
    xs: rem(8),
    sm: rem(12),
    md: rem(16),
    lg: rem(24),
    xl: rem(32),
  },
  headings: {
    fontFamily: 'var(--font-geist-sans), Arial, Helvetica, sans-serif',
    sizes: {
      h1: { fontSize: rem(34), lineHeight: '1.1', fontWeight: '700' },
      h2: { fontSize: rem(26), lineHeight: '1.15', fontWeight: '700' },
      h3: { fontSize: rem(22), lineHeight: '1.2', fontWeight: '650' },
      h4: { fontSize: rem(18), lineHeight: '1.2', fontWeight: '650' },
    },
  },
  primaryShade: { light: 6, dark: 7 },
  other: {
    appShellBorder: '#d8e1ec',
    panelSurface: '#ffffff',
    panelMutedSurface: '#f5f8fc',
    heroSurface: 'linear-gradient(135deg, #f8fbff 0%, #eef4ff 100%)',
    workspaceBorder: '#d8e1ec',
    workspaceMuted: '#5f6f85',
    workspaceTitle: '#122033',
  },
  components: {
    AppShell: {
      defaultProps: {
        padding: 'lg',
      },
    },
    Paper: {
      defaultProps: {
        radius: 'lg',
        shadow: 'xs',
        withBorder: true,
      },
    },
    Card: {
      defaultProps: {
        radius: 'lg',
        shadow: 'xs',
        withBorder: true,
        padding: 'lg',
      },
    },
    Button: {
      defaultProps: {
        radius: 'md',
      },
    },
    Badge: {
      defaultProps: {
        radius: 'sm',
        variant: 'light',
      },
    },
    NavLink: {
      styles: {
        label: {
          fontSize: rem(14),
        },
      },
    },
  },
});
