export const EVENT_BUTTON_SIZE_VALUES = ['xs', 'sm', 'md', 'lg', 'xl'] as const;

export type EventButtonSize = (typeof EVENT_BUTTON_SIZE_VALUES)[number];

export interface EventVisualSettings {
  buttonSize: EventButtonSize;
}

export const DEFAULT_EVENT_BUTTON_SIZE: EventButtonSize = 'md';

export const EVENT_BUTTON_SIZE_OPTIONS: Array<{ value: EventButtonSize; label: string }> = [
  { value: 'xs', label: 'XS' },
  { value: 'sm', label: 'S' },
  { value: 'md', label: 'M' },
  { value: 'lg', label: 'L' },
  { value: 'xl', label: 'XL' },
];

export function normalizeEventButtonSize(value: unknown): EventButtonSize {
  return EVENT_BUTTON_SIZE_VALUES.includes(value as EventButtonSize)
    ? (value as EventButtonSize)
    : DEFAULT_EVENT_BUTTON_SIZE;
}

export function normalizeEventVisualSettings(value: unknown): EventVisualSettings {
  const source = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  return {
    buttonSize: normalizeEventButtonSize(source.buttonSize),
  };
}
