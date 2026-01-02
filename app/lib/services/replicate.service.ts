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

// Check if Replicate API token is configured
if (!process.env.REPLICATE_API_TOKEN) {
  console.warn("⚠️ REPLICATE_API_TOKEN is not set. Try-on generation will fail.");
}

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN || "",
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
  if (!process.env.REPLICATE_API_TOKEN) {
    throw new Error("REPLICATE_API_TOKEN is not configured. Please set it in your environment variables.");
  }

  try {
    // Convert Buffer to data URL if needed for Replicate
    let personInput: string | Buffer = personImage;
    let garmentInput: string | Buffer = garmentImage;

    // If Buffer, convert to data URL format that Replicate expects
    if (Buffer.isBuffer(personImage)) {
      const base64 = personImage.toString("base64");
      personInput = `data:image/jpeg;base64,${base64}`;
    }
    if (Buffer.isBuffer(garmentImage)) {
      const base64 = garmentImage.toString("base64");
      garmentInput = `data:image/jpeg;base64,${base64}`;
    }

    console.log("Calling Replicate API with model:", MODEL_ID);
    const output = await replicate.run(MODEL_ID, {
      input: {
        human_img: personInput,
        garm_img: garmentInput,
        garment_des: category,
        category: "upper_body",
      },
    });

    // Replicate can return a list or a string
    const resultUrl = Array.isArray(output) ? output[0] : output;
    
    if (!resultUrl) {
      throw new Error("Replicate returned no result");
    }

    console.log("Replicate generation successful:", resultUrl);
    return String(resultUrl);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Replicate generation error:", errorMessage);
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



