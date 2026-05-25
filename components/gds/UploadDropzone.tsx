'use client';

import { Button, Group, Stack, Text } from '@mantine/core';
import { Dropzone, type FileWithPath } from '@mantine/dropzone';
import { IconPhotoPlus, IconUpload, IconX } from '@tabler/icons-react';

interface UploadDropzoneProps {
  accept?: string[];
  icon?: React.ReactNode;
  title: string;
  description: string;
  onFile: (file: File | null) => void | Promise<void>;
  disabled?: boolean;
  buttonLabel?: string;
  multiple?: boolean;
}

export default function UploadDropzone({
  accept,
  icon,
  title,
  description,
  onFile,
  disabled = false,
  buttonLabel = 'Choose file',
  multiple = false,
}: UploadDropzoneProps) {
  const handleDrop = async (files: FileWithPath[]) => {
    await onFile(files[0] ?? null);
  };

  return (
    <Dropzone
      onDrop={(files) => void handleDrop(files)}
      accept={accept}
      disabled={disabled}
      multiple={multiple}
      radius="md"
      p="xl"
      styles={{
        root: {
          borderStyle: 'dashed',
          background: 'var(--mantine-color-gray-0)',
        },
      }}
    >
      <Stack align="center" gap="sm">
        <Dropzone.Accept>
          <IconUpload size={40} color="var(--mantine-color-cameraTeal-6)" />
        </Dropzone.Accept>
        <Dropzone.Reject>
          <IconX size={40} color="var(--mantine-color-red-6)" />
        </Dropzone.Reject>
        <Dropzone.Idle>
          {icon ?? <IconPhotoPlus size={40} color="var(--mantine-color-gray-6)" />}
        </Dropzone.Idle>
        <Text fw={700}>{title}</Text>
        <Text size="sm" c="dimmed" ta="center">
          {description}
        </Text>
        <Group pt="xs">
          <Button variant="light" color="cameraTeal" disabled={disabled}>
            {buttonLabel}
          </Button>
        </Group>
      </Stack>
    </Dropzone>
  );
}
