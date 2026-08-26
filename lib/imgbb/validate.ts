/**
 * Client-safe image validation -- no server-only imports (sharp, @vercel/blob),
 * so components can import this without pulling native/server code into the
 * browser bundle. Keep it that way; put anything else in lib/imgbb/upload.ts.
 */

export function validateImage(
  file: File | Blob,
  maxSizeMB: number = 32
): { valid: boolean; error?: string } {
  const maxSizeBytes = maxSizeMB * 1024 * 1024;
  if (file.size > maxSizeBytes) {
    return {
      valid: false,
      error: `File size (${(file.size / 1024 / 1024).toFixed(2)} MB) exceeds maximum allowed size (${maxSizeMB} MB)`,
    };
  }

  if (file instanceof File) {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      return {
        valid: false,
        error: `File type ${file.type} is not supported. Allowed types: JPEG, PNG, GIF, WebP`,
      };
    }
  }

  return { valid: true };
}
