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
    console.log("Input types - person:", typeof personInput, "garment:", typeof garmentInput);
    
    // Use replicate.run which returns a Promise that resolves when the prediction completes
    const output = await replicate.run(MODEL_ID, {
      input: {
        human_img: personInput,
        garm_img: garmentInput,
        garment_des: category,
        category: "upper_body",
      },
    });

    console.log("Replicate output type:", typeof output);
    console.log("Replicate output:", JSON.stringify(output, null, 2));
    
    // If output is an empty object {}, create a prediction manually and poll for results
    if (output && typeof output === "object" && Object.keys(output).length === 0) {
      console.warn("Replicate returned empty object, creating prediction manually and polling...");
      
      try {
        // Create a prediction manually
        const prediction = await replicate.predictions.create({
          version: MODEL_ID.split(":")[1] || "0513734a452173b8173e907e3a59d19a36266e55b48528559432bd21c7d7e985",
          input: {
            human_img: personInput,
            garm_img: garmentInput,
            garment_des: category,
            category: "upper_body",
          },
        });
        
        console.log("Created prediction:", prediction.id, "Status:", prediction.status);
        
        // Poll for completion (max 60 seconds)
        let pollCount = 0;
        const maxPolls = 60;
        
        while ((prediction.status === "starting" || prediction.status === "processing") && pollCount < maxPolls) {
          await new Promise(resolve => setTimeout(resolve, 1000));
          const updated = await replicate.predictions.get(prediction.id);
          prediction.status = updated.status;
          prediction.output = updated.output;
          prediction.error = updated.error;
          pollCount++;
          
          console.log(`Poll ${pollCount}/${maxPolls} - Prediction status:`, prediction.status);
          
          if (prediction.status === "succeeded" && prediction.output) {
            output = prediction.output;
            console.log("Prediction succeeded, output:", output);
            break;
          } else if (prediction.status === "failed" || prediction.status === "canceled") {
            throw new Error(`Prediction ${prediction.status}: ${prediction.error || "Unknown error"}`);
          }
        }
        
        if (prediction.status !== "succeeded") {
          throw new Error(`Prediction did not complete in time. Final status: ${prediction.status}`);
        }
      } catch (pollError) {
        console.error("Error polling prediction:", pollError);
        throw pollError;
      }
    }

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



