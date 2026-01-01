/**
 * ==========================================
 * REPLICATE SERVICE
 * ==========================================
 * 
 * Service for interacting with Replicate API (try-on generation).
 */

import Replicate from "replicate";

// ==========================================
// CONFIGURATION
// ==========================================

const MODEL_ID =
  "cuuupid/idm-vton:0513734a452173b8173e907e3a59d19a36266e55b48528559432bd21c7d7e985";

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

// ==========================================
// SERVICE
// ==========================================

/**
 * Generates a virtual try-on.
 * 
 * @param personImage - Person image (Buffer or URL)
 * @param garmentImage - Garment image (Buffer or URL)
 * @param category - Category (upper_body, lower_body, dresses)
 * @returns URL of the result image
 * @throws Error if generation fails
 */
export async function generateTryOn(
  personImage: Buffer | string,
  garmentImage: Buffer | string,
  category: string = "upper_body"
): Promise<string> {
  try {
    const output = await replicate.run(MODEL_ID, {
      input: {
        human_img: personImage,
        garm_img: garmentImage,
        garment_des: category,
        category: "upper_body",
      },
    });

    // Replicate can return a list or a string
    const resultUrl = Array.isArray(output) ? output[0] : output;
    return String(resultUrl);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Replicate generation failed: ${errorMessage}`);
  }
}

/**
 * Validates image size.
 * 
 * @param imageBytes - Image bytes
 * @param maxSizeMB - Maximum size in MB (default: 10)
 * @returns True if valid, False otherwise
 */
export function validateImageSize(imageBytes: Buffer, maxSizeMB: number = 10): boolean {
  const sizeMB = imageBytes.length / (1024 * 1024);
  return sizeMB <= maxSizeMB;
}

