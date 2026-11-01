'use client';

import { Children, cloneElement, createElement, forwardRef, isValidElement, useId, type ReactNode } from 'react';
import {
  Button as MantineButton,
  Checkbox as MantineCheckbox,
  ColorInput as MantineColorInput,
  FileInput as MantineFileInput,
  NumberInput as MantineNumberInput,
  Select as MantineSelect,
  Stack,
  Text,
  Textarea as MantineTextarea,
  TextInput as MantineTextInput,
} from '@mantine/core';
import type {
  ButtonProps,
  CheckboxProps,
  ColorInputProps,
  FileInputProps,
  NumberInputProps,
  SelectProps,
  TextareaProps,
  TextInputProps,
  PolymorphicComponentProps,
} from '@mantine/core';
import { useUiLanguage } from '@/components/i18n/UiLanguageProvider';
import { adminOperationText } from '@/lib/i18n/admin-operations';
import { uiLanguageDirection } from '@/lib/i18n/locale-negotiation';

export {
  // Button is wrapped below while retaining Mantine's polymorphic props.
  Stack,
  Text,
  Badge,
  Radio,
  Image,
  Paper,
  UnstyledButton,
  Code,
  Divider,
  Container,
  AspectRatio,
  Center,
  Box,
  Title,
  Breadcrumbs,
  Anchor,
  Card,
  Alert,
  SimpleGrid,
  Grid,
  Group,
} from '@mantine/core';

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
  // Mantine's built-in spinner arrows are icon-only buttons without labels.
  // Keep numeric keyboard stepping (ArrowUp/ArrowDown), but hide those
  // unnamed controls unless a caller explicitly opts into them.
  return <MantineNumberInput {...localizedInputProps(props, language)} hideControls={props.hideControls ?? true} />;
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
  return (
    <MantineColorInput
      {...localizedInputProps(props, language)}
      eyeDropperButtonProps={{
        ...props.eyeDropperButtonProps,
        'aria-label': props.eyeDropperButtonProps?.['aria-label'] ?? 'Choose a color with the eyedropper',
      }}
    />
  );
}

const fieldControlTypes = new Set<unknown>([
  LocalizedTextInput,
  NumberInput,
  LocalizedTextarea,
  Select,
  FileInput,
  ColorInput,
]);

function labelFirstFieldControl(node: ReactNode, labelId: string, helperId?: string): ReactNode {
  let labelled = false;

  function visit(current: ReactNode): ReactNode {
    return Children.map(current, (child) => {
      if (!isValidElement<{ children?: ReactNode; label?: ReactNode }>(child)) return child;

      if (fieldControlTypes.has(child.type) && !labelled) {
        labelled = true;
        const props = child.props as Record<string, unknown>;
        const nextProps: Record<string, unknown> = {};
        if (!props['aria-label'] && !props['aria-labelledby'] && !props.label) {
          nextProps['aria-labelledby'] = labelId;
        }
        if (helperId && !props['aria-describedby']) {
          nextProps['aria-describedby'] = helperId;
        }
        return cloneElement(child, nextProps);
      }

      if (child.props.children !== undefined) {
        return cloneElement(child, undefined, visit(child.props.children));
      }
      return child;
    });
  }

  return visit(node);
}

// Custom lightweight helpers mapped to Mantine
export function Field({ label, children, helper }: { label: ReactNode; children: ReactNode; helper?: ReactNode }) {
  const language = useUiLanguage();
  const direction = uiLanguageDirection(language);
  const fieldId = useId();
  const labelId = `${fieldId}-label`;
  const helperId = helper ? `${fieldId}-description` : undefined;
  const localize = (value: ReactNode) => {
    if (typeof value !== 'string') return { value, translated: false };
    const translated = adminOperationText(value, language);
    return { value: translated, translated: translated !== value };
  };
  const localizedLabel = localize(label);
  const localizedHelper = localize(helper);
  const labelledChildren = labelFirstFieldControl(children, labelId, helperId);
  return (
    <Stack gap={6} dir={direction}>
      <Text id={labelId} size="sm" fw={500} lang={localizedLabel.translated ? language : undefined} dir={localizedLabel.translated ? direction : undefined}>{localizedLabel.value}</Text>
      {labelledChildren}
      {helper ? <Text id={helperId} size="xs" c="dimmed" lang={localizedHelper.translated ? language : undefined} dir={localizedHelper.translated ? direction : undefined}>{localizedHelper.value}</Text> : null}
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
