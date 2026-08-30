/** Longest edge after resize — device photos are shown as small thumbnails. */
const MAX_EDGE_PX = 1280;
const JPEG_QUALITY = 0.82;
/** Stay under the API JSON body limit (5mb) with room for other fields. */
const MAX_DATA_URL_CHARS = 3_500_000;
/** Source files can be large screenshots; they are compressed before upload. */
export const MAX_SOURCE_IMAGE_BYTES = 10 * 1024 * 1024;

export function compressImageToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      try {
        const scale = Math.min(1, MAX_EDGE_PX / Math.max(img.width, img.height));
        const width = Math.max(1, Math.round(img.width * scale));
        const height = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Could not process image"));
          return;
        }
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
        if (dataUrl.length > MAX_DATA_URL_CHARS) {
          reject(new Error("Image is still too large after compression"));
          return;
        }
        resolve(dataUrl);
      } catch {
        reject(new Error("Could not process image"));
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Could not read image"));
    };

    img.src = objectUrl;
  });
}
