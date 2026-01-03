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

const MODEL_ID = "google/nano-banana-pro";

// Prompt for garment transfer task
const GARMENT_TRANSFER_PROMPT = 
  "This is NOT a redesign task. It is a garment transfer task. Use the clothing from the second image exactly as-is with zero creative interpretation. The output must look like the REAL clothing item was physically worn by the person. No invented graphics, no color changes, no simplification.";

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
    // IMPORTANT: For google/nano-banana-pro, we MUST send prompt + both images (person and product)
    // Replicate SDK accepts Buffer directly, data URLs, or HTTP URLs
    // Let's try keeping Buffers as Buffers - SDK should handle them natively
    let personInput: string | Buffer = personImage;
    let garmentInput: string | Buffer = garmentImage;

    // Keep Buffers as Buffers - Replicate SDK handles Buffers natively
    // If string, keep as-is (could be URL or data URL)
    if (Buffer.isBuffer(personImage)) {
      personInput = personImage; // Keep as Buffer
      console.log("[Replicate] Person image is Buffer, keeping as Buffer, size:", personInput.length, "bytes");
    } else if (typeof personImage === 'string') {
      personInput = personImage;
      console.log("[Replicate] Person image is string, length:", personInput.length, "chars");
    }
    
    if (Buffer.isBuffer(garmentImage)) {
      garmentInput = garmentImage; // Keep as Buffer
      console.log("[Replicate] Garment image is Buffer, keeping as Buffer, size:", garmentInput.length, "bytes");
    } else if (typeof garmentImage === 'string') {
      garmentInput = garmentImage;
      console.log("[Replicate] Garment image is string, length:", garmentInput.length, "chars");
    }
    
    // Validate that we have valid image inputs
    if (!personInput || !garmentInput) {
      throw new Error("Invalid image inputs: personInput or garmentInput is empty");
    }

    console.log("[Replicate] Calling Replicate API with model:", MODEL_ID);
    console.log("[Replicate] Input types - person:", Buffer.isBuffer(personInput) ? 'Buffer' : typeof personInput, "garment:", Buffer.isBuffer(garmentInput) ? 'Buffer' : typeof garmentInput);
    console.log("[Replicate] Person image size:", Buffer.isBuffer(personInput) ? personInput.length + " bytes" : (typeof personInput === 'string' ? personInput.length + " chars" : 'unknown'));
    console.log("[Replicate] Garment image size:", Buffer.isBuffer(garmentInput) ? garmentInput.length + " bytes" : (typeof garmentInput === 'string' ? garmentInput.length + " chars" : 'unknown'));
    console.log("[Replicate] Using prompt:", GARMENT_TRANSFER_PROMPT);
    
    // For google/nano-banana-pro, we MUST send:
    // - image_input: array of image URLs/Buffers [person_image, garment_image]
    // - prompt: the prompt text
    // The SDK Replicate will automatically handle Buffers by uploading them
    // Use predictions.create() + polling instead of replicate.run() because
    // replicate.run() sometimes returns {} for this model even when successful
    let output;
    try {
      // Build image_input array: [person_image, garment_image]
      const imageInputArray = [personInput, garmentInput];
      
      const inputParams = {
        image_input: imageInputArray, // Array of images: [person, garment]
        prompt: GARMENT_TRANSFER_PROMPT,
        aspect_ratio: "4:3",
        output_format: "png",
        resolution: "2K",
        safety_filter_level: "block_only_high"
      };
      
      console.log("[Replicate] Input params keys:", Object.keys(inputParams));
      console.log("[Replicate] image_input length:", imageInputArray.length);
      console.log("[Replicate] image_input[0] type:", Buffer.isBuffer(imageInputArray[0]) ? 'Buffer' : typeof imageInputArray[0]);
      console.log("[Replicate] image_input[1] type:", Buffer.isBuffer(imageInputArray[1]) ? 'Buffer' : typeof imageInputArray[1]);
      console.log("[Replicate] prompt:", inputParams.prompt?.substring(0, 50) + "...");
      
      // Create prediction
      const prediction = await replicate.predictions.create({
        model: MODEL_ID,
        input: inputParams,
      });
      
      console.log("[Replicate] Created prediction:", prediction.id, "Status:", prediction.status);
      
      // Poll for completion (max 180 seconds / 3 minutes to allow for longer generations)
      // Replicate predictions expire after 30 minutes, but we set a reasonable timeout
      let pollCount = 0;
      const maxPolls = 180; // 3 minutes max (generations typically take 30-45 seconds)
      let currentPrediction = prediction;
      
      while ((currentPrediction.status === "starting" || currentPrediction.status === "processing") && pollCount < maxPolls) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        const updated = await replicate.predictions.get(currentPrediction.id);
        currentPrediction = updated;
        pollCount++;
        
        console.log(`[Replicate] Poll ${pollCount}/${maxPolls} - Status: ${currentPrediction.status}, ID: ${currentPrediction.id}`);
        
        if (currentPrediction.status === "succeeded") {
          if (currentPrediction.output) {
            output = currentPrediction.output;
            console.log("[Replicate] Prediction succeeded, output type:", typeof output);
            console.log("[Replicate] Output value:", output);
            break;
          } else {
            // Sometimes output can be null even when succeeded - check one more time
            console.warn("[Replicate] Prediction succeeded but output is null/undefined, waiting 2 seconds and checking again...");
            await new Promise(resolve => setTimeout(resolve, 2000));
            const finalCheck = await replicate.predictions.get(currentPrediction.id);
            if (finalCheck.output) {
              output = finalCheck.output;
              console.log("[Replicate] Got output on retry, output type:", typeof output);
              break;
            } else {
              throw new Error(`Prediction succeeded but output is empty. Prediction ID: ${currentPrediction.id}`);
            }
          }
        } else if (currentPrediction.status === "failed" || currentPrediction.status === "canceled") {
          const errorMsg = currentPrediction.error || "Unknown error";
          console.error(`[Replicate] Prediction ${currentPrediction.status}:`, errorMsg);
          throw new Error(`Prediction ${currentPrediction.status}: ${errorMsg}`);
        }
      }
      
      // Final check - if we exited the loop, verify we got the output
      if (currentPrediction.status !== "succeeded") {
        throw new Error(`Prediction did not complete in time. Final status: ${currentPrediction.status}, ID: ${currentPrediction.id}`);
      }
      
      if (!output) {
        throw new Error(`Prediction succeeded but output is missing. Prediction ID: ${currentPrediction.id}`);
      }
    } catch (error: any) {
      console.error("[Replicate] Error:", error.message);
      throw error;
    }

    console.log("[Replicate] Final output type:", typeof output);
    console.log("[Replicate] Final output:", JSON.stringify(output, null, 2));

    // Replicate can return different formats:
    // 1. A string (URL)
    // 2. An array of strings (URLs)
    // 3. An object with a URL property
    // 4. null or undefined
    // 5. An empty object {} (which means we need to check the prediction status)
    
    let resultUrl: string | null = null;

    if (typeof output === "string") {
      resultUrl = output;
    } else if (Array.isArray(output)) {
      // If array, get first element
      resultUrl = output.length > 0 ? String(output[0]) : null;
    } else if (output && typeof output === "object") {
      // If object, try to find URL property
      if ("url" in output && typeof output.url === "string") {
        resultUrl = output.url;
      } else if ("output" in output) {
        // Sometimes nested in "output" property
        const nested = output.output;
        if (typeof nested === "string") {
          resultUrl = nested;
        } else if (Array.isArray(nested) && nested.length > 0) {
          resultUrl = String(nested[0]);
        }
      } else if ("output_url" in output && typeof output.output_url === "string") {
        resultUrl = output.output_url;
      } else if ("image" in output && typeof output.image === "string") {
        resultUrl = output.image;
      } else {
        // Try to stringify the first value
        const values = Object.values(output);
        if (values.length > 0) {
          const firstValue = values[0];
          if (typeof firstValue === "string") {
            resultUrl = firstValue;
          } else if (Array.isArray(firstValue) && firstValue.length > 0) {
            resultUrl = String(firstValue[0]);
          }
        }
      }
    }

    // If output is an empty object {}, it might mean the prediction is still processing
    // or the result is available via the prediction ID
    if (!resultUrl && output && typeof output === "object" && Object.keys(output).length === 0) {
      console.warn("Replicate returned empty object - prediction might still be processing or result available via API");
      // Try to get the prediction ID from the replicate instance if available
      // For now, we'll throw a more helpful error
      throw new Error("Replicate returned empty result. The prediction may still be processing. Please try again in a few seconds.");
    }

    if (!resultUrl) {
      console.error("Replicate output format not recognized:", output);
      console.error("Output keys:", output && typeof output === "object" ? Object.keys(output) : "N/A");
      throw new Error(`Replicate returned unexpected format: ${JSON.stringify(output)}`);
    }

    // Validate that resultUrl is a valid URL
    try {
      new URL(resultUrl);
    } catch {
      // If not a valid URL, it might be a base64 data URL or file path
      // Check if it starts with http:// or https://
      if (!resultUrl.startsWith("http://") && !resultUrl.startsWith("https://") && !resultUrl.startsWith("data:")) {
        console.warn("Result URL doesn't look like a valid URL:", resultUrl);
        // Try to construct a full URL if it's a relative path
        if (resultUrl.startsWith("/")) {
          resultUrl = `https://replicate.delivery${resultUrl}`;
        } else {
          throw new Error(`Invalid result URL format: ${resultUrl}`);
        }
      }
    }

    console.log("Replicate generation successful, result URL:", resultUrl);
    return resultUrl;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Replicate generation error:", errorMessage);
    
    // Handle specific Replicate error: "No images were returned"
    if (errorMessage.includes("No images were returned") || errorMessage.includes("No images")) {
      throw new Error("La génération n'a pas retourné d'image. Veuillez réessayer avec une autre photo.");
    }
    
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



