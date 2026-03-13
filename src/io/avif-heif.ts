/**
 * AVIF / HEIF format support.
 *
 * Uses the browser's built-in encoding via OffscreenCanvas.convertToBlob()
 * and decoding via createImageBitmap().
 *
 * AVIF is widely supported in modern browsers (Chrome 85+, Firefox 93+, Safari 16+).
 * HEIF browser support is very limited; we provide feature detection.
 */

// ── Feature detection ────────────────────────────────────────────────────────

let _avifSupported: boolean | null = null
let _heifSupported: boolean | null = null

/**
 * Detect whether the current environment supports AVIF encoding.
 * Caches the result after the first call.
 */
export async function isAVIFSupported(): Promise<boolean> {
  if (_avifSupported !== null) return _avifSupported

  try {
    if (typeof OffscreenCanvas === 'undefined') {
      _avifSupported = false
      return false
    }
    const canvas = new OffscreenCanvas(1, 1)
    const blob = await canvas.convertToBlob({ type: 'image/avif' })
    _avifSupported = blob.type === 'image/avif'
  } catch {
    _avifSupported = false
  }
  return _avifSupported
}

/**
 * Detect whether the current environment supports HEIF encoding.
 * Caches the result after the first call.
 */
export async function isHEIFSupported(): Promise<boolean> {
  if (_heifSupported !== null) return _heifSupported

  try {
    if (typeof OffscreenCanvas === 'undefined') {
      _heifSupported = false
      return false
    }
    const canvas = new OffscreenCanvas(1, 1)
    const blob = await canvas.convertToBlob({ type: 'image/heif' })
    _heifSupported = blob.type === 'image/heif'
  } catch {
    _heifSupported = false
  }
  return _heifSupported
}

/** Reset cached feature detection flags (useful for testing). */
export function resetSupportCache(): void {
  _avifSupported = null
  _heifSupported = null
}

// ── Export ────────────────────────────────────────────────────────────────────

/**
 * Export ImageData as an AVIF blob.
 * @param imageData The pixel data to encode.
 * @param quality Encoding quality (0 to 1, default 0.8).
 * @returns A Blob containing the AVIF image.
 * @throws If AVIF encoding is not supported.
 */
export async function exportAVIF(imageData: ImageData, quality: number = 0.8): Promise<Blob> {
  if (typeof OffscreenCanvas === 'undefined') {
    throw new Error('AVIF export requires OffscreenCanvas (not available in this environment)')
  }

  const canvas = new OffscreenCanvas(imageData.width, imageData.height)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Failed to get 2D context for AVIF export')

  ctx.putImageData(imageData, 0, 0)

  const blob = await canvas.convertToBlob({
    type: 'image/avif',
    quality,
  })

  if (blob.type !== 'image/avif') {
    throw new Error('AVIF encoding not supported by this browser — blob type: ' + blob.type)
  }

  return blob
}

/**
 * Export ImageData as a HEIF blob.
 * @param imageData The pixel data to encode.
 * @param quality Encoding quality (0 to 1, default 0.8).
 * @returns A Blob containing the HEIF image.
 * @throws If HEIF encoding is not supported.
 */
export async function exportHEIF(imageData: ImageData, quality: number = 0.8): Promise<Blob> {
  if (typeof OffscreenCanvas === 'undefined') {
    throw new Error('HEIF export requires OffscreenCanvas (not available in this environment)')
  }

  const canvas = new OffscreenCanvas(imageData.width, imageData.height)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Failed to get 2D context for HEIF export')

  ctx.putImageData(imageData, 0, 0)

  const blob = await canvas.convertToBlob({
    type: 'image/heif',
    quality,
  })

  if (blob.type !== 'image/heif') {
    throw new Error('HEIF encoding not supported by this browser — blob type: ' + blob.type)
  }

  return blob
}

// ── Import ───────────────────────────────────────────────────────────────────

/**
 * Import an AVIF image blob and decode it to ImageData.
 * Uses the browser's built-in AVIF decoder via createImageBitmap.
 */
export async function importAVIF(blob: Blob): Promise<ImageData> {
  return decodeImageBlob(blob)
}

/**
 * Import a HEIF image blob and decode it to ImageData.
 * Uses the browser's built-in decoder via createImageBitmap.
 */
export async function importHEIF(blob: Blob): Promise<ImageData> {
  return decodeImageBlob(blob)
}

/** Shared decode logic: Blob -> ImageBitmap -> ImageData via OffscreenCanvas. */
async function decodeImageBlob(blob: Blob): Promise<ImageData> {
  if (typeof createImageBitmap === 'undefined') {
    throw new Error('Image decoding requires createImageBitmap (not available in this environment)')
  }

  const bitmap = await createImageBitmap(blob)
  const { width, height } = bitmap

  if (typeof OffscreenCanvas === 'undefined') {
    throw new Error('Image decoding requires OffscreenCanvas (not available in this environment)')
  }

  const canvas = new OffscreenCanvas(width, height)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Failed to get 2D context for image decoding')

  ctx.drawImage(bitmap, 0, 0)
  bitmap.close()

  return ctx.getImageData(0, 0, width, height)
}
