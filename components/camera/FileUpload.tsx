'use client';

import NextImage from 'next/image';
import { useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { Alert, Badge, Box, Button, Card, Center, Stack, Text } from '@mantine/core';
import { validateImage } from '@/lib/imgbb/upload';

export interface FileUploadProps {
  onUpload: (file: File, preview: string) => void;
  onError?: (error: Error) => void;
  maxSizeMB?: number;
  className?: string;
}

export default function FileUpload({
  onUpload,
  onError,
  maxSizeMB = 32,
  className = '',
}: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File) => {
    setError(null);

    const validation = validateImage(file, maxSizeMB);
    if (!validation.valid) {
      const errorMessage = validation.error || 'Invalid file';
      setError(errorMessage);
      onError?.(new Error(errorMessage));
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const previewUrl = event.target?.result as string;
      setPreview(previewUrl);
      setSelectedFile(file);
      onUpload(file, previewUrl);
    };
    reader.onerror = () => {
      setError('Failed to read file');
      onError?.(new Error('Failed to read file'));
    };
    reader.readAsDataURL(file);
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);

    const file = event.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) handleFile(file);
  };

  const clearFile = () => {
    setPreview(null);
    setSelectedFile(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <Box className={className} w="100%">
      {!preview ? (
        <Card
          withBorder
          p="xl"
          maw={768}
          mx="auto"
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          style={{ cursor: 'pointer' }}
          data-dragging={isDragging || undefined}
        >
          <Center mih={260}>
            <Stack align="center" gap="md" ta="center">
              {error ? (
                <Alert title="Upload Error">
                  <Stack align="center" gap="sm">
                    <Text size="sm">{error}</Text>
                    <Button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        setError(null);
                      }}
                    >
                      Try Again
                    </Button>
                  </Stack>
                </Alert>
              ) : (
                <>
                  <Text fw={700} size="lg">
                    {isDragging ? 'Drop your image here' : 'Upload an image'}
                  </Text>
                  <Text size="sm" c="dimmed">
                    Drag and drop or click to select
                  </Text>
                  <Button type="button">Choose File</Button>
                  <Text size="xs" c="dimmed">
                    Supported: JPEG, PNG, WebP (max {maxSizeMB} MB)
                  </Text>
                </>
              )}
            </Stack>
          </Center>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/jpg,image/png,image/webp"
            onChange={handleInputChange}
            hidden
          />
        </Card>
      ) : (
        <Card withBorder maw={768} mx="auto" p={0} style={{ overflow: 'hidden' }}>
          <Box style={{ position: 'relative', aspectRatio: '16 / 9' }}>
            <NextImage
              src={preview}
              alt="Selected image"
              fill
              unoptimized
              style={{ objectFit: 'cover' }}
            />
            <Box style={{ position: 'absolute', insetInline: 0, bottom: 16, display: 'flex', justifyContent: 'center' }}>
              <Button type="button" variant="default" onClick={clearFile}>
                Change Image
              </Button>
            </Box>
            {selectedFile ? (
              <Box style={{ position: 'absolute', top: 16, right: 16 }}>
                <Badge variant="light">
                  {selectedFile.name} · {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                </Badge>
              </Box>
            ) : null}
          </Box>
        </Card>
      )}
    </Box>
  );
}
