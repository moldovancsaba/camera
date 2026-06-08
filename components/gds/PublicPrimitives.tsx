'use client';

import { ElementType, ReactNode } from 'react';
import { Stack, Text } from '@mantine/core';

export {
  Button,
  Stack,
  Text,
  Badge,
  TextInput,
  NumberInput,
  Textarea,
  Select,
  Checkbox,
  FileInput,
  ColorInput,
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

// Custom lightweight helpers mapped to Mantine
export function Field({ label, children, helper }: { label: ReactNode; children: ReactNode; helper?: ReactNode }) {
  return (
    <Stack gap={6}>
      <Text size="sm" fw={500}>{label}</Text>
      {children}
      {helper ? <Text size="xs" c="dimmed">{helper}</Text> : null}
    </Stack>
  );
}

export function ColorField({ id, label, value, onChange, helper }: { id?: string; label: ReactNode; value?: string; onChange?: (val: string) => void; helper?: ReactNode }) {
  const { ColorInput } = require('@mantine/core');
  return (
    <Field label={label} helper={helper}>
      <ColorInput id={id} value={value} onChange={onChange} />
    </Field>
  );
}
