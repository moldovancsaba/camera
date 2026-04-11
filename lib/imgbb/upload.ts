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

const IMGBB_UPLOAD_URL = 'https://api.imgbb.com/1/upload';

/**
 * Get imgbb API key with validation
 * Lazy loaded to avoid build-time errors
 */
function getImgbbApiKey(): string {
  if (!process.env.IMGBB_API_KEY) {
    throw new Error('IMGBB_API_KEY environment variable is not defined');
  }
  return process.env.IMGBB_API_KEY;
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
      url: string;          // Thumbnail URL
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

/**
 * Convert File or Blob to base64 string
 * Required format for imgbb.com API
 */
async function fileToBase64(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
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
  } = options;

  // Convert image to base64 if it's a File or Blob
  let base64Image: string;
  if (typeof image === 'string') {
    // Already base64
    base64Image = image;
  } else {
    base64Image = await fileToBase64(image);
  }

  // Get API key (lazy validation)
  const apiKey = getImgbbApiKey();

  // Prepare form data
  const formData = new FormData();
  formData.append('key', apiKey);
  formData.append('image', base64Image);
  if (name) {
    formData.append('name', name);
  }
  if (expiration) {
    formData.append('expiration', expiration.toString());
  }

  let lastError: Error | null = null;
  
  // Retry loop
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`imgbb upload attempt ${attempt}/${maxRetries}...`);
      
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
        console.log('✓ imgbb upload successful:', response.data.data.id);
        console.log('imgbb ALL URLs:');
        console.log('  url:', response.data.data.url);
        console.log('  display_url:', response.data.data.display_url);
        console.log('  image.url:', response.data.data.image.url);
        console.log('  url_viewer:', response.data.data.url_viewer);
        if (response.data.data.medium) {
          console.log('  medium.url:', response.data.data.medium.url);
        }
        
        return {
          success: true,
          imageUrl: response.data.data.url, // Direct link to full-size original image
          thumbnailUrl: response.data.data.thumb.url,
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
      } else {
        console.error(`✗ imgbb upload attempt ${attempt} failed:`, error);
      }

      // Don't retry on client errors (4xx) except 429 (rate limit)
      if (axios.isAxiosError(error) && error.response) {
        const status = error.response.status;
        if (status >= 400 && status < 500 && status !== 429) {
          console.error('Client error detected, not retrying');
          throw lastError;
        }
      }

      // Wait before retrying (except on last attempt)
      if (attempt < maxRetries) {
        const delay = retryDelay * attempt; // Exponential backoff
        console.log(`Waiting ${delay}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delay));
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
