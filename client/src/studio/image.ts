// Prepare a photo for her album in the browser, before it ever leaves the
// family member's device:
//   • scaled to fit 2048px (crisp on an iPad, small to store and load)
//   • re-encoded as JPEG, which drops ALL metadata — including the GPS
//     location phones embed in photos
//   • rotated upright from its EXIF orientation

const MAX_EDGE = 2048;

export interface PreparedImage {
  blob: Blob;
  width: number;
  height: number;
  previewUrl: string;
}

export async function prepareImage(file: File): Promise<PreparedImage> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  // Transparent art (PNG) gets a warm paper background instead of black.
  ctx.fillStyle = '#faf5ea';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not read that image.'))), 'image/jpeg', 0.86),
  );
  return { blob, width, height, previewUrl: URL.createObjectURL(blob) };
}
