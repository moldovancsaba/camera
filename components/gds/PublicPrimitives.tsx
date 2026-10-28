'use client';

import { Children, cloneElement, createElement, forwardRef, isValidElement, type ReactNode } from 'react';
import {
  Anchor as MantineAnchor,
  Badge as MantineBadge,
  Button as MantineButton,
  Checkbox as MantineCheckbox,
  ColorInput as MantineColorInput,
  FileInput as MantineFileInput,
  NumberInput as MantineNumberInput,
  Radio as MantineRadio,
  Select as MantineSelect,
  Stack,
  Text,
  Textarea as MantineTextarea,
  Title as MantineTitle,
  TextInput as MantineTextInput,
  Text as MantineText,
} from '@mantine/core';
import type {
  ButtonProps,
  AnchorProps,
  BadgeProps,
  CheckboxProps,
  ColorInputProps,
  FileInputProps,
  NumberInputProps,
  RadioProps,
  SelectProps,
  TextareaProps,
  TextInputProps,
  TextProps,
  TitleProps,
  PolymorphicComponentProps,
} from '@mantine/core';
import { useUiLanguage } from '@/components/i18n/UiLanguageProvider';
import { adminOperationText } from '@/lib/i18n/admin-operations';
import { uiLanguageDirection } from '@/lib/i18n/locale-negotiation';

export {
  // Button is wrapped below while retaining Mantine's polymorphic props.
  Stack,
  Image,
  Paper,
  UnstyledButton,
  Code,
  Divider,
  Container,
  AspectRatio,
  Center,
  Box,
  Breadcrumbs,
  Card,
  Alert,
  SimpleGrid,
  Grid,
  Group,
} from '@mantine/core';

/** Translate exact, app-owned text used in common Mantine display components. User/event text stays as authored. */
function LocalizedDisplayText({ component, props }: { component: React.ComponentType<Record<string, unknown>>; props: Record<string, unknown> & { children?: ReactNode } }) {
  const language = useUiLanguage();
  const translated = nodeHasTranslation(props.children, language);
  return createElement(component, {
    ...props,
    dir: translated ? uiLanguageDirection(language) : props.dir,
    lang: translated ? language : props.lang,
  }, localizedNode(props.children, language));
}

const LocalizedText = (<C = 'p'>(props: PolymorphicComponentProps<C, TextProps>) => <LocalizedDisplayText component={MantineText as unknown as React.ComponentType<Record<string, unknown>>} props={props as Record<string, unknown> & { children?: ReactNode }} />) as typeof MantineText;
const LocalizedTitle = (<C = 'h1'>(props: PolymorphicComponentProps<C, TitleProps>) => <LocalizedDisplayText component={MantineTitle as unknown as React.ComponentType<Record<string, unknown>>} props={props as Record<string, unknown> & { children?: ReactNode }} />) as typeof MantineTitle;
const LocalizedAnchor = (<C = 'a'>(props: PolymorphicComponentProps<C, AnchorProps>) => <LocalizedDisplayText component={MantineAnchor as unknown as React.ComponentType<Record<string, unknown>>} props={props as Record<string, unknown> & { children?: ReactNode }} />) as typeof MantineAnchor;
const LocalizedBadge = (<C = 'div'>(props: PolymorphicComponentProps<C, BadgeProps>) => <LocalizedDisplayText component={MantineBadge as unknown as React.ComponentType<Record<string, unknown>>} props={props as Record<string, unknown> & { children?: ReactNode }} />) as typeof MantineBadge;
const LocalizedRadio = Object.assign((props: RadioProps) => {
  const language = useUiLanguage();
  const translated = nodeHasTranslation(props.label, language);
  return <MantineRadio {...props} label={localizedNode(props.label, language)} lang={translated ? language : props.lang} dir={translated ? uiLanguageDirection(language) : props.dir} />;
}, { Group: MantineRadio.Group }) as typeof MantineRadio;

export { LocalizedText as Text, LocalizedTitle as Title, LocalizedAnchor as Anchor, LocalizedBadge as Badge, LocalizedRadio as Radio };

function localizedNode(value: ReactNode, language: ReturnType<typeof useUiLanguage>): ReactNode {
  return Children.map(value, (child) => {
    if (typeof child === 'string') return adminOperationText(child, language);
    if (!isValidElement<{ children?: ReactNode }>(child) || child.props.children === undefined) return child;
    return cloneElement(child, undefined, localizedNode(child.props.children, language));
  });
}

function localizedOptions(data: unknown, language: ReturnType<typeof useUiLanguage>): unknown {
  if (!Array.isArray(data)) return data;
  return data.map((item) => {
    if (typeof item === 'string') return adminOperationText(item, language);
    if (!item || typeof item !== 'object') return item;
    const option = item as Record<string, unknown>;
    if (Array.isArray(option.items)) return { ...option, items: localizedOptions(option.items, language) };
    return typeof option.label === 'string' ? { ...option, label: adminOperationText(option.label, language) } : item;
  });
}

function optionsHaveTranslation(data: unknown, language: ReturnType<typeof useUiLanguage>): boolean {
  if (!Array.isArray(data)) return false;
  return data.some((item) => {
    if (typeof item === 'string') return adminOperationText(item, language) !== item;
    if (!item || typeof item !== 'object') return false;
    const option = item as Record<string, unknown>;
    if (Array.isArray(option.items)) return optionsHaveTranslation(option.items, language);
    return typeof option.label === 'string' && adminOperationText(option.label, language) !== option.label;
  });
}

function localizedInputProps<T extends object>(props: T, language: ReturnType<typeof useUiLanguage>): T {
  const result: Record<string, unknown> = { ...(props as Record<string, unknown>) };
  let translated = false;
  for (const key of ['label', 'description', 'placeholder', 'nothingFoundMessage', 'aria-label', 'aria-description', 'title']) {
    if (typeof result[key] === 'string') {
      const localized = adminOperationText(result[key] as string, language);
      translated ||= localized !== result[key];
      result[key] = localized;
    }
  }
  result.dir = uiLanguageDirection(language);
  if (translated) result.lang = language;
  return result as T;
}

function nodeHasTranslation(value: ReactNode, language: ReturnType<typeof useUiLanguage>): boolean {
  return Children.toArray(value).some((child) => {
    if (typeof child === 'string') return adminOperationText(child, language) !== child;
    return isValidElement<{ children?: ReactNode }>(child) && child.props.children !== undefined && nodeHasTranslation(child.props.children, language);
  });
}

/** Shared admin buttons and fields translate known app-owned labels at render time. */
const LocalizedButton = (<C = 'button'>(props: PolymorphicComponentProps<C, ButtonProps>) => {
  const language = useUiLanguage();
  const PolymorphicMantineButton = MantineButton as unknown as React.ComponentType<Record<string, unknown>>;
  const translated = nodeHasTranslation(props.children, language);
  const buttonProps = {
    ...(localizedInputProps(props, language) as Record<string, unknown>),
    children: localizedNode(props.children, language),
    dir: uiLanguageDirection(language),
    lang: translated ? language : undefined,
  };
  return createElement(PolymorphicMantineButton, buttonProps);
}) as typeof MantineButton;

export { LocalizedButton as Button };

const LocalizedTextInput = forwardRef<HTMLInputElement, TextInputProps>((props, ref) => {
  const language = useUiLanguage();
  return <MantineTextInput ref={ref} {...localizedInputProps(props, language)} />;
});
LocalizedTextInput.displayName = 'LocalizedTextInput';
export { LocalizedTextInput as TextInput };

export function NumberInput(props: NumberInputProps) {
  const language = useUiLanguage();
  return <MantineNumberInput {...localizedInputProps(props, language)} />;
}

const LocalizedTextarea = forwardRef<HTMLTextAreaElement, TextareaProps>((props, ref) => {
  const language = useUiLanguage();
  return <MantineTextarea ref={ref} {...localizedInputProps(props, language)} />;
});
LocalizedTextarea.displayName = 'LocalizedTextarea';
export { LocalizedTextarea as Textarea };

export function Select(props: SelectProps & { localizeOptionLabels?: boolean }) {
  const language = useUiLanguage();
  const { localizeOptionLabels = false, ...selectProps } = props;
  const translatedOptions = localizeOptionLabels && optionsHaveTranslation(selectProps.data, language);
  const data = (localizeOptionLabels ? localizedOptions(selectProps.data, language) : selectProps.data) as SelectProps['data'];
  return <MantineSelect {...localizedInputProps({ ...selectProps, data, ...(translatedOptions ? { lang: language } : {}) }, language)} />;
}

export function Checkbox(props: CheckboxProps) {
  const language = useUiLanguage();
  return <MantineCheckbox {...localizedInputProps(props, language)} label={localizedNode(props.label, language)} />;
}

export function FileInput<Multiple extends boolean = false>(props: FileInputProps<Multiple>) {
  const language = useUiLanguage();
  return <MantineFileInput {...localizedInputProps(props, language)} />;
}

export function ColorInput(props: ColorInputProps) {
  const language = useUiLanguage();
  return <MantineColorInput {...localizedInputProps(props, language)} />;
}

// Custom lightweight helpers mapped to Mantine
export function Field({ label, children, helper }: { label: ReactNode; children: ReactNode; helper?: ReactNode }) {
  const language = useUiLanguage();
  const direction = uiLanguageDirection(language);
  const localize = (value: ReactNode) => {
    if (typeof value !== 'string') return { value, translated: false };
    const translated = adminOperationText(value, language);
    return { value: translated, translated: translated !== value };
  };
  const localizedLabel = localize(label);
  const localizedHelper = localize(helper);
  return (
    <Stack gap={6} dir={direction}>
      <Text size="sm" fw={500} lang={localizedLabel.translated ? language : undefined} dir={localizedLabel.translated ? direction : undefined}>{localizedLabel.value}</Text>
      {children}
      {helper ? <Text size="xs" c="dimmed" lang={localizedHelper.translated ? language : undefined} dir={localizedHelper.translated ? direction : undefined}>{localizedHelper.value}</Text> : null}
    </Stack>
  );
}

export function ColorField({ id, label, value, onChange, helper }: { id?: string; label: ReactNode; value?: string; onChange?: (val: string) => void; helper?: ReactNode }) {
  return (
    <Field label={label} helper={helper}>
      <ColorInput id={id} value={value} onChange={onChange} />
    </Field>
  );
}
