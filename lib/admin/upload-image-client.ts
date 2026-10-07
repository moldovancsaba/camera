/**
 * Uploads one image file from an admin form through POST /api/upload-logo (JSON body with the file as a data URL, up to 4 MB, PNG, JPEG or
 * WebP) and returns its public address. Throws an Error whose message can be shown as it is.
 */
export async function uploadImageFile(file: File, name: string): Promise<string> {
  const imageData = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('The file could not be read.'));
    reader.readAsDataURL(file);
  });
  const res = await fetch('/api/upload-logo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ imageData, name: `${name}-${Date.now()}` }) });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(payload.error || payload.message || 'The upload failed.');
  const url = String(payload?.data?.imageUrl ?? '');
  if (!url) throw new Error('The upload finished without an image address.');
  return url;
}
