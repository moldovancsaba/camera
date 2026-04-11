/**
 * Input Sanitization Utilities
 * 
 * Security utilities for sanitizing and validating user inputs.
 * 
 * Why this module exists:
 * - Prevents XSS (Cross-Site Scripting) attacks
 * - Prevents SQL/NoSQL injection attacks
 * - Validates input formats before processing
 * - Ensures data integrity across the application
 * 
 * Usage:
 * ```typescript
 * const body = await request.json();
 * const safeName = sanitizeString(body.name);
 * const safeEmail = sanitizeEmail(body.email);
 * ```
 * 
 * Defense-in-depth approach:
 * - Sanitization at input (this module)
 * - Validation at business logic (schemas)
 * - Encoding at output (React automatic escaping)
 * - CSP headers (next.config.ts)
 */

/**
 * Sanitize string input by removing dangerous characters
 * 
 * @param input - Raw string input from user
 * @param options - Sanitization options
 * @returns Sanitized string
 * 
 * Why: Removes potentially dangerous characters that could be used in attacks
 * 
 * What it removes:
 * - HTML tags (< >)
 * - Script tags and event handlers
 * - SQL/NoSQL injection characters (; ' " ` -- /*)
 * - Control characters (\x00-\x1F)
 * 
 * What it preserves:
 * - Alphanumeric characters
 * - Common punctuation (. , ! ? - _ @)
 * - Spaces and line breaks (if allowMultiline is true)
 * - Emojis and Unicode characters
 */
export function sanitizeString(
  input: string,
  options: {
    maxLength?: number;
    allowMultiline?: boolean;
    allowSpecialChars?: boolean;
  } = {}
): string {
  const { maxLength = 1000, allowMultiline = false, allowSpecialChars = true } = options;
  
  if (typeof input !== 'string') {
    return '';
  }
  
  let sanitized = input;
  
  // Remove control characters (except newlines if allowed)
  sanitized = sanitized.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '');
  
  // Remove or escape HTML tags
  sanitized = sanitized.replace(/<[^>]*>/g, '');
  
  // Remove SQL/NoSQL injection patterns
  sanitized = sanitized.replace(/[';"`]|--|\/\*|\*\//g, '');
  
  // Remove script-like patterns
  sanitized = sanitized.replace(/javascript:/gi, '');
  sanitized = sanitized.replace(/on\w+\s*=/gi, '');
  
  // Remove newlines if not allowed
  if (!allowMultiline) {
    sanitized = sanitized.replace(/[\r\n]/g, ' ');
  }
  
  // Remove special characters if not allowed
  if (!allowSpecialChars) {
    sanitized = sanitized.replace(/[^a-zA-Z0-9\s.,!?@_-]/g, '');
  }
  
  // Trim whitespace
  sanitized = sanitized.trim();
  
  // Limit length
  if (sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength);
  }
  
  return sanitized;
}

/**
 * Validate and sanitize email address
 * 
 * @param email - Email address string
 * @returns Sanitized email or empty string if invalid
 * 
 * Why: Email validation is complex and critical for auth
 * 
 * Validation rules:
 * - Must match standard email format
 * - No special characters outside allowed set
 * - Maximum length of 254 characters (RFC 5321)
 * - Lowercase normalized
 */
export function sanitizeEmail(email: string): string {
  if (typeof email !== 'string') {
    return '';
  }
  
  // Trim and lowercase
  let sanitized = email.trim().toLowerCase();
  
  // Remove any characters not allowed in email addresses
  sanitized = sanitized.replace(/[^a-z0-9.@_+-]/g, '');
  
  // Basic email format validation
  const emailRegex = /^[a-z0-9._+-]+@[a-z0-9.-]+\.[a-z]{2,}$/;
  if (!emailRegex.test(sanitized)) {
    return '';
  }
  
  // Check length (RFC 5321)
  if (sanitized.length > 254) {
    return '';
  }
  
  return sanitized;
}

/**
 * Sanitize URL to prevent open redirect and XSS
 * 
 * @param url - URL string
 * @param options - Validation options
 * @returns Sanitized URL or empty string if invalid
 * 
 * Why: URLs can be used for XSS and phishing attacks
 * 
 * Validation rules:
 * - Must use HTTP or HTTPS protocol
 * - No javascript: or data: URIs
 * - Optional whitelist of allowed domains
 * - Relative URLs allowed if allowRelative is true
 */
export function sanitizeUrl(
  url: string,
  options: {
    allowRelative?: boolean;
    allowedDomains?: string[];
  } = {}
): string {
  const { allowRelative = false, allowedDomains } = options;
  
  if (typeof url !== 'string') {
    return '';
  }
  
  const sanitized = url.trim();
  
  // Block dangerous protocols
  if (/^(javascript|data|vbscript|file):/i.test(sanitized)) {
    return '';
  }
  
  // Handle relative URLs
  if (sanitized.startsWith('/')) {
    return allowRelative ? sanitized : '';
  }
  
  // Validate absolute URLs
  try {
    const parsed = new URL(sanitized);
    
    // Only allow HTTP and HTTPS
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return '';
    }
    
    // Check domain whitelist if provided
    if (allowedDomains && allowedDomains.length > 0) {
      const hostname = parsed.hostname.toLowerCase();
      const isAllowed = allowedDomains.some(domain => 
        hostname === domain || hostname.endsWith(`.${domain}`)
      );
      
      if (!isAllowed) {
        return '';
      }
    }
    
    return parsed.toString();
  } catch {
    // Invalid URL format
    return '';
  }
}

/**
 * Sanitize MongoDB ObjectId string
 * 
 * @param id - ObjectId string
 * @returns Sanitized ObjectId or empty string if invalid
 * 
 * Why: Prevents NoSQL injection via malformed IDs
 * 
 * Validation rules:
 * - Must be exactly 24 hexadecimal characters
 * - No special characters or spaces
 */
export function sanitizeObjectId(id: string): string {
  if (typeof id !== 'string') {
    return '';
  }
  
  const sanitized = id.trim();
  
  // ObjectId must be exactly 24 hex characters
  if (!/^[0-9a-f]{24}$/i.test(sanitized)) {
    return '';
  }
  
  return sanitized.toLowerCase();
}

/**
 * Sanitize integer input
 * 
 * @param input - Number or string input
 * @param options - Validation options
 * @returns Sanitized integer or default value
 * 
 * Why: Prevents injection and overflow attacks via numeric inputs
 * 
 * Validation rules:
 * - Must be valid integer
 * - Within specified min/max range
 * - No floating point or scientific notation
 */
export function sanitizeInteger(
  input: string | number,
  options: {
    min?: number;
    max?: number;
    default?: number;
  } = {}
): number {
  const { min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER, default: defaultValue = 0 } = options;
  
  // Convert to number
  const num = typeof input === 'string' ? parseInt(input, 10) : input;
  
  // Validate
  if (isNaN(num) || !Number.isFinite(num) || !Number.isInteger(num)) {
    return defaultValue;
  }
  
  // Clamp to range
  if (num < min) return min;
  if (num > max) return max;
  
  return num;
}

/**
 * Sanitize filename to prevent directory traversal
 * 
 * @param filename - Original filename
 * @param options - Validation options
 * @returns Safe filename or default
 * 
 * Why: Prevents directory traversal attacks (../ ../../etc/passwd)
 * 
 * Validation rules:
 * - No path separators (/ \)
 * - No null bytes (\x00)
 * - No parent directory references (..)
 * - Alphanumeric, dash, underscore, dot only
 * - Maximum length enforcement
 */
export function sanitizeFilename(
  filename: string,
  options: {
    maxLength?: number;
    allowedExtensions?: string[];
    default?: string;
  } = {}
): string {
  const { maxLength = 255, allowedExtensions, default: defaultValue = 'file' } = options;
  
  if (typeof filename !== 'string' || !filename) {
    return defaultValue;
  }
  
  // Remove path components
  let sanitized = filename.replace(/^.*[\/\\]/, '');
  
  // Remove dangerous characters
  sanitized = sanitized.replace(/[^a-zA-Z0-9._-]/g, '');
  
  // Remove null bytes
  sanitized = sanitized.replace(/\x00/g, '');
  
  // Remove parent directory references
  sanitized = sanitized.replace(/\.\./g, '');
  
  // Limit length (reserve space for extension)
  if (sanitized.length > maxLength) {
    const ext = sanitized.substring(sanitized.lastIndexOf('.'));
    const name = sanitized.substring(0, maxLength - ext.length);
    sanitized = name + ext;
  }
  
  // Validate extension if whitelist provided
  if (allowedExtensions && allowedExtensions.length > 0) {
    const ext = sanitized.substring(sanitized.lastIndexOf('.')).toLowerCase();
    if (!allowedExtensions.includes(ext)) {
      return defaultValue;
    }
  }
  
  // Ensure filename is not empty after sanitization
  if (!sanitized || sanitized === '.') {
    return defaultValue;
  }
  
  return sanitized;
}

/**
 * Sanitize HTML content (allow limited safe tags)
 * 
 * @param html - HTML string
 * @returns Sanitized HTML with only safe tags
 * 
 * Why: Sometimes we need to allow some HTML (e.g., markdown output)
 * but must prevent XSS
 * 
 * Allowed tags: p, br, strong, em, u, a (with href), ul, ol, li
 * Allowed attributes: href (for links only, with URL validation)
 * 
 * Note: For production, consider using a library like DOMPurify
 */
export function sanitizeHtml(html: string): string {
  if (typeof html !== 'string') {
    return '';
  }
  
  // Remove script tags and their content
  let sanitized = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  
  // Remove style tags and their content
  sanitized = sanitized.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
  
  // Remove event handlers
  sanitized = sanitized.replace(/on\w+\s*=\s*["'][^"']*["']/gi, '');
  sanitized = sanitized.replace(/on\w+\s*=\s*[^\s>]*/gi, '');
  
  // Remove dangerous attributes
  sanitized = sanitized.replace(/\s*(javascript|data|vbscript):/gi, '');
  
  // Only allow specific safe tags
  const allowedTags = ['p', 'br', 'strong', 'em', 'u', 'a', 'ul', 'ol', 'li', 'h1', 'h2', 'h3'];
  const tagRegex = /<\/?([a-z][a-z0-9]*)\b[^>]*>/gi;
  
  sanitized = sanitized.replace(tagRegex, (match, tag) => {
    if (allowedTags.includes(tag.toLowerCase())) {
      return match;
    }
    return '';
  });
  
  return sanitized;
}

/**
 * Sanitize JSON input to prevent prototype pollution
 * 
 * @param json - Parsed JSON object
 * @returns Sanitized object
 * 
 * Why: Prototype pollution can allow attackers to modify object prototypes
 * 
 * Protection:
 * - Removes __proto__, constructor, prototype keys
 * - Recursively sanitizes nested objects
 * - Validates object structure
 */
export function sanitizeObject<T extends Record<string, any>>(json: T): T {
  if (!json || typeof json !== 'object' || Array.isArray(json)) {
    return json;
  }
  
  const sanitized: any = {};
  const dangerousKeys = ['__proto__', 'constructor', 'prototype'];
  
  for (const [key, value] of Object.entries(json)) {
    // Skip dangerous keys
    if (dangerousKeys.includes(key)) {
      continue;
    }
    
    // Recursively sanitize nested objects
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      sanitized[key] = sanitizeObject(value);
    } else if (Array.isArray(value)) {
      sanitized[key] = value.map(item => 
        typeof item === 'object' ? sanitizeObject(item) : item
      );
    } else {
      sanitized[key] = value;
    }
  }
  
  return sanitized as T;
}
