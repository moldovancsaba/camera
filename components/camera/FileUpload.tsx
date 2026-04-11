/**
 * File Upload Component
 * 
 * Alternative to camera capture - allows users to upload images from their device.
 * Supports drag-and-drop and click-to-select.
 * 
 * Features:
 * - Drag and drop support
 * - File type validation (JPEG, PNG, WebP)
 * - File size validation (max 32 MB for imgbb)
 * - Image preview before submission
 * - Responsive design
 */

'use client';

import { useState, useRef, DragEvent, ChangeEvent } from 'react';
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
  className = '' 
}: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  /**
   * Handle file selection (from input or drop)
   */
  const handleFile = (file: File) => {
    setError(null);

    // Validate image
    const validation = validateImage(file, maxSizeMB);
    
    if (!validation.valid) {
      const errorMessage = validation.error || 'Invalid file';
      setError(errorMessage);
      
      if (onError) {
        onError(new Error(errorMessage));
      }
      return;
    }

    // Create preview
    const reader = new FileReader();
    reader.onload = (e) => {
      const previewUrl = e.target?.result as string;
      setPreview(previewUrl);
      setSelectedFile(file);
      
      // Pass file and preview to parent
      onUpload(file, previewUrl);
    };
    reader.onerror = () => {
      setError('Failed to read file');
      if (onError) {
        onError(new Error('Failed to read file'));
      }
    };
    reader.readAsDataURL(file);
  };

  /**
   * Handle drag over event
   */
  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  /**
   * Handle drag leave event
   */
  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  /**
   * Handle drop event
   */
  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      handleFile(files[0]);
    }
  };

  /**
   * Handle file input change
   */
  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFile(files[0]);
    }
  };

  /**
   * Trigger file input click
   */
  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  /**
   * Clear selected file
   */
  const clearFile = () => {
    setPreview(null);
    setSelectedFile(null);
    setError(null);
    
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className={`flex flex-col items-center justify-center w-full ${className}`}>
      {!preview ? (
        <>
          {/* Drop Zone */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={triggerFileInput}
            className={`
              relative w-full max-w-2xl aspect-video 
              border-2 border-dashed rounded-lg 
              flex items-center justify-center
              cursor-pointer transition-all
              ${isDragging 
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' 
                : 'border-gray-300 dark:border-gray-600 hover:border-blue-400 dark:hover:border-blue-500 hover:bg-gray-50 dark:hover:bg-gray-800/50'
              }
              ${error ? 'border-red-500 bg-red-50 dark:bg-red-900/20' : ''}
            `}
          >
            <div className="text-center p-8">
              {error ? (
                // Error State
                <>
                  <svg className="w-16 h-16 mx-auto mb-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-lg font-semibold text-red-700 dark:text-red-400 mb-2">
                    Upload Error
                  </p>
                  <p className="text-sm text-red-600 dark:text-red-300 mb-4">
                    {error}
                  </p>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setError(null);
                    }}
                    className="px-6 py-2 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700 transition-colors"
                  >
                    Try Again
                  </button>
                </>
              ) : (
                // Normal State
                <>
                  <svg 
                    className={`w-20 h-20 mx-auto mb-4 ${isDragging ? 'text-blue-500' : 'text-gray-400 dark:text-gray-500'}`} 
                    fill="none" 
                    stroke="currentColor" 
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  
                  <p className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2">
                    {isDragging ? 'Drop your image here' : 'Upload an image'}
                  </p>
                  
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                    Drag and drop or click to select
                  </p>
                  
                  <div className="inline-flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                    </svg>
                    Choose File
                  </div>
                  
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-4">
                    Supported: JPEG, PNG, WebP (max {maxSizeMB} MB)
                  </p>
                </>
              )}
            </div>
          </div>

          {/* Hidden File Input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/jpg,image/png,image/webp"
            onChange={handleInputChange}
            className="hidden"
          />
        </>
      ) : (
        <>
          {/* Image Preview */}
          <div className="relative w-full max-w-2xl aspect-video bg-gray-900 rounded-lg overflow-hidden shadow-xl">
            <img
              src={preview}
              alt="Selected image"
              className="w-full h-full object-cover"
            />

            {/* Clear/Change Button */}
            <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-4">
              <button
                onClick={clearFile}
                className="px-6 py-3 bg-white text-gray-900 rounded-lg font-semibold hover:bg-gray-100 transition-colors shadow-lg"
              >
                Change Image
              </button>
            </div>

            {/* File Info Badge */}
            {selectedFile && (
              <div className="absolute top-4 right-4 bg-black/70 text-white px-3 py-2 rounded-lg text-sm">
                <p className="font-semibold">{selectedFile.name}</p>
                <p className="text-xs text-gray-300">
                  {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                </p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
