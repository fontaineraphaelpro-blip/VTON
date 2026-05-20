const MAX_EDGE = 1400;
const JPEG_QUALITY = 0.82;
/** Skip compression for small files (faster path). */
const SKIP_BELOW_BYTES = 350_000;

/**
 * Resize large garment photos before upload — faster admin upload, less Shopify processing.
 */
export async function compressGarmentImageForUpload(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.size <= SKIP_BELOW_BYTES) {
    return file;
  }

  if (typeof createImageBitmap !== "function") {
    return file;
  }

  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    if (scale >= 1 && file.type === "image/jpeg" && file.size <= 1_500_000) {
      return file;
    }

    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;

    ctx.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY);
    });
    if (!blob) return file;

    const baseName =
      file.name.replace(/\.[^.]+$/, "") || "vton-garment";
    return new File([blob], `${baseName}.jpg`, {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
  } catch {
    return file;
  } finally {
    bitmap?.close();
  }
}
