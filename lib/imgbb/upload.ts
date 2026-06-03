/**
 * imgbb.com Image Upload Integration
 * 
 * Handles image uploads to imgbb.com CDN with retry logic and error handling.
 * 
 * Why imgbb.com:
 * - Free tier with 32 MB per image limit
 * - No S3 configuration complexity
 * - Simple API with direct URLs
 * - Reliable CDN hosting
 * 
 * API Documentation: https://api.imgbb.com
 */

import axios, { AxiosError } from 'axios';
import { isRenderableImgbbImageUrl, normalizeImgbbDirectUrl } from '@/lib/imgbb/url';

const IMGBB_UPLOAD_URL = 'https://api.imgbb.com/1/upload';
const IMGBB_API_KEY_CANDIDATES = [
  'IMGBB_API_KEY',
  'NEXT_PUBLIC_IMG_BB_API_KEY',
  'IMG_BB_API_KEY',
] as const;

/**
 * Get imgbb API key with validation
 * Lazy loaded to avoid build-time errors
 */
function getImgbbApiKey(): string {
  const found = IMGBB_API_KEY_CANDIDATES.map((key) => process.env[key]).find(
    (value) => Boolean(value?.trim())
  );
  if (!found) {
    throw new Error('IMGBB_API_KEY environment variable is not defined');
  }
  return found;
}

/**
 * Upload response from imgbb.com API
 */
export interface ImgbbUploadResponse {
  success: boolean;
  data: {
    id: string;
    url_viewer: string;
    url: string;           // Direct image URL
    display_url: string;    // Display URL
    title: string;
    time: string;
    image: {
      filename: string;
      name: string;
      mime: string;
      extension: string;
      url: string;          // Full size image URL
      size: number;
    };
    thumb: {
      filename: string;
      name: string;
      mime: string;
      extension: string;
      url: string;
      size: number;
    };
    medium?: {
      filename: string;
      name: string;
      mime: string;
      extension: string;
      url: string;
      size: number;
    };
    delete_url: string;
  };
  status: number;
}

/**
 * Upload options
 */
export interface UploadOptions {
  name?: string;           // Optional custom name for the image
  expiration?: number;     // Expiration time in seconds (60-15552000)
  maxRetries?: number;     // Maximum number of retry attempts (default: 3)
  retryDelay?: number;     // Delay between retries in ms (default: 1000)
  validatePublicUrl?: boolean; // Validate final URL before returning (default: true)
}

/**
 * Upload result returned to caller
 */
export interface UploadResult {
  success: boolean;
  imageUrl: string;        // Direct full-size image URL
  thumbnailUrl: string;    // Thumbnail URL
  deleteUrl: string;       // URL to delete the image
  imageId: string;         // imgbb image ID
  fileSize: number;        // File size in bytes
  mimeType: string;        // MIME type (e.g., "image/jpeg")
  fileName: string;        // Original filename
}

function collectUrlCandidates(payload: ImgbbUploadResponse['data']): string[] {
  return [
    payload.url,
    payload.image?.url,
    payload.display_url,
    payload.medium?.url,
    payload.thumb?.url,
  ]
    .map((value) => normalizeImgbbDirectUrl(value ?? null))
    .filter((value): value is string => Boolean(value));
}

async function canFetchImage(url: string): Promise<boolean> {
  try {
    const response = await axios.get(url, {
      timeout: 10000,
      responseType: 'stream',
      headers: {
        Range: 'bytes=0-0',
        Accept: 'image/*',
      },
      validateStatus: (status) => status >= 200 && status < 400,
    });
    response.data?.destroy?.();
    return true;
  } catch {
    return false;
  }
}

/**
 * Convert File or Blob to base64 string
 * Required format for imgbb.com API
 */
async function fileToBase64(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const payload = (reader.result as string).split(',');
      const base64 = payload.length > 1 ? payload[1] : payload[0];
      if (!base64) {
        reject(new Error('Invalid base64 image payload'));
        return;
      }
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function normalizeBase64Input(image: string): string {
  const trimmed = image.trim();
  if (!trimmed) {
    throw new Error('Invalid base64 image payload');
  }

  const isDataUrl = trimmed.startsWith('data:') && trimmed.includes('base64,');
  if (!isDataUrl) {
    return trimmed;
  }

  const separatorIndex = trimmed.indexOf('base64,');
  const payload = trimmed.slice(separatorIndex + 'base64,'.length);
  if (!payload) {
    throw new Error('Invalid base64 image payload');
  }
  return payload;
}

function isTransientAxiosError(error: AxiosError): boolean {
  if (!error.response) {
    return true;
  }

  const status = error.response.status;
  return status >= 500 || status === 429;
}

/**
 * Upload image to imgbb.com with retry logic
 * 
 * @param image - File, Blob, or base64 string
 * @param options - Upload options (name, expiration, retries)
 * @returns Upload result with image URLs
 * 
 * @throws Error if upload fails after all retries
 */
export async function uploadImage(
  image: File | Blob | string,
  options: UploadOptions = {}
): Promise<UploadResult> {
  const {
    name,
    expiration,
    maxRetries = 3,
    retryDelay = 1000,
    validatePublicUrl = true,
  } = options;

  // Convert image to base64 if it's a File or Blob
  let base64Image: string;
  if (typeof image === 'string') {
    // Already base64
    base64Image = normalizeBase64Input(image);
  } else {
    base64Image = await fileToBase64(image);
  }

  // Get API key (lazy validation)
  const apiKey = getImgbbApiKey();

  let lastError: Error | null = null;
  
  // Retry loop
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`imgbb upload attempt ${attempt}/${maxRetries}...`);
      
      // Create a fresh form body each attempt; multipart streams are single-use.
      const formData = new FormData();
      formData.append('key', apiKey);
      formData.append('image', base64Image);
      if (name) {
        formData.append('name', name);
      }
      if (expiration) {
        formData.append('expiration', expiration.toString());
      }

      const response = await axios.post<ImgbbUploadResponse>(
        IMGBB_UPLOAD_URL,
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
          timeout: 30000, // 30 second timeout
        }
      );

      // Successful upload
      if (response.data.success) {
        const candidates = collectUrlCandidates(response.data.data);
        const imageUrl =
          candidates.find((value) => isRenderableImgbbImageUrl(value)) ?? null;
        const thumbnailUrl =
          normalizeImgbbDirectUrl(response.data.data.thumb?.url ?? null) ??
          normalizeImgbbDirectUrl(response.data.data.medium?.url ?? null) ??
          imageUrl;

        if (!imageUrl || !thumbnailUrl) {
          throw new Error('imgbb response did not contain a valid direct image URL');
        }

        if (validatePublicUrl) {
          const preferred = [
            imageUrl,
            thumbnailUrl,
            ...candidates.filter((value) => value !== imageUrl && value !== thumbnailUrl),
          ];
          let validated = false;
          for (const candidate of preferred) {
            if (await canFetchImage(candidate)) {
              validated = true;
              break;
            }
          }
          if (!validated) {
            console.warn('imgbb upload validation did not confirm fetchability; returning unverified URL');
          }
        }

        console.log('✓ imgbb upload successful:', response.data.data.id);
        return {
          success: true,
          imageUrl,
          thumbnailUrl,
          deleteUrl: response.data.data.delete_url,
          imageId: response.data.data.id,
          fileSize: response.data.data.image.size,
          mimeType: response.data.data.image.mime,
          fileName: response.data.data.image.filename,
        };
      } else {
        throw new Error('imgbb API returned success: false');
      }
      
    } catch (error) {
      lastError = error as Error;
      
      // Log error details
      if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError;
        console.error(`✗ imgbb upload attempt ${attempt} failed:`, {
          status: axiosError.response?.status,
          message: axiosError.message,
          data: axiosError.response?.data,
        });

        if (!isTransientAxiosError(axiosError)) {
          throw lastError;
        }
      } else {
        console.error(`✗ imgbb upload attempt ${attempt} failed:`, error);
      }

      // Wait before retrying (except on last attempt)
      if (attempt < maxRetries) {
        const delay = retryDelay * attempt; // Exponential backoff
        console.log(`Waiting ${delay}ms before retry...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  // All retries failed
  throw new Error(
    `Failed to upload image to imgbb after ${maxRetries} attempts: ${lastError?.message || 'Unknown error'}`
  );
}

/**
 * Delete image from imgbb.com
 * Note: Requires the delete URL returned from upload
 * 
 * @param deleteUrl - Delete URL from upload response
 * @returns True if deletion successful
 */
export async function deleteImage(deleteUrl: string): Promise<boolean> {
  try {
    await axios.get(deleteUrl, { timeout: 10000 });
    console.log('✓ imgbb image deleted successfully');
    return true;
  } catch (error) {
    console.error('✗ imgbb image deletion failed:', error);
    return false;
  }
}

/**
 * Validate image before upload
 * Checks file size and MIME type
 * 
 * @param file - File to validate
 * @param maxSizeMB - Maximum file size in MB (default: 32)
 * @returns Validation result
 */
export function validateImage(
  file: File | Blob,
  maxSizeMB: number = 32
): { valid: boolean; error?: string } {
  // Check file size (imgbb free tier limit is 32 MB)
  const maxSizeBytes = maxSizeMB * 1024 * 1024;
  if (file.size > maxSizeBytes) {
    return {
      valid: false,
      error: `File size (${(file.size / 1024 / 1024).toFixed(2)} MB) exceeds maximum allowed size (${maxSizeMB} MB)`,
    };
  }

  // Check MIME type if File
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
