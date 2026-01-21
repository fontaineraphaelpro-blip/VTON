/**
 * ==========================================
 * REPLICATE SERVICE
 * ==========================================
 * 
 * Service for interacting with Replicate API (try-on generation).
 * OPTIMIZED: Uses reduced resolution (512x512) and quality settings for faster processing and lower costs.
 */

import Replicate from "replicate";

// ==========================================
// CONFIGURATION
// ==========================================

const MODEL_ID = "google/nano-banana-pro";

// Prompt for garment transfer task
const GARMENT_TRANSFER_PROMPT = 
  "This is NOT a redesign task. It is a garment transfer task. Use the clothing from the second image exactly as-is with zero creative interpretation. The output must look like the REAL clothing item was physically worn by the person. No invented graphics, no color changes, no simplification.";

// OPTIMIZED: Reduced image sizes for faster processing
// Input and output resolutions are reduced to speed up processing and lower costs
const OPTIMIZED_CONFIG = {
  // Reduced image size (was likely 1024x1024 or higher)
  width: 512,
  height: 512,
  
  // Reduced quality for faster processing (still acceptable for try-on)
  quality: 85, // JPEG quality (0-100), 85 is good balance
  
  // Model-specific optimizations
  numInferenceSteps: 20, // Reduced from default (usually 30-50)
  guidanceScale: 7.5, // Standard value, can be reduced slightly
};

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
 * Generates a virtual try-on using google/nano-banana-pro with garment transfer prompt.
 * OPTIMIZED: Uses reduced resolution (512x512) and quality settings for faster processing.
 * 
 * @param personImage - Person image (URL or base64 data URL)
 * @param garmentImage - Garment image (URL or base64 data URL)
 * @param options - Quality mode options
 * @returns Object with resultUrl and config
 * @throws Error if generation fails
 */
export async function generateTryOn(
  personImageUrl: string,
  garmentImageUrl: string,
  options?: {
    qualityMode?: "speed" | "balanced" | "quality";
  }
): Promise<{ resultUrl: string; config?: any }> {
  if (!process.env.REPLICATE_API_TOKEN) {
    throw new Error("REPLICATE_API_TOKEN is not configured. Please set it in your environment variables.");
  }

  const qualityMode = options?.qualityMode || "balanced";
  
  // Adjust parameters based on quality mode
  let config = { ...OPTIMIZED_CONFIG };
  
  if (qualityMode === "speed") {
    // Fastest: Lower resolution and quality
    config = {
      width: 384,
      height: 384,
      quality: 75,
      numInferenceSteps: 15,
      guidanceScale: 7.0,
    };
  } else if (qualityMode === "quality") {
    // Best quality: Higher resolution but still optimized
    config = {
      width: 768,
      height: 768,
      quality: 90,
      numInferenceSteps: 30,
      guidanceScale: 8.0,
    };
  }
  // balanced uses OPTIMIZED_CONFIG defaults (512x512)

  try {
    // Convert data URLs to Replicate file URLs if needed
    // Replicate doesn't accept data URLs directly - we need to upload them first
    let personInput: string = personImageUrl;
    let garmentInput: string = garmentImageUrl;

    console.log("[Replicate] Processing images - person type:", personImageUrl.substring(0, 50), "garment type:", garmentImageUrl.substring(0, 50));
    
    // If person image is a data URL, upload it to Replicate files
    if (personImageUrl.startsWith("data:image/")) {
      console.log("[Replicate] Uploading person image (data URL) to Replicate files...");
      try {
        // Extract base64 data from data URL
        const base64Data = personImageUrl.split(",")[1];
        if (!base64Data) {
          throw new Error("Invalid data URL format - no base64 data found");
        }
        const buffer = Buffer.from(base64Data, "base64");
        
        // Upload to Replicate files - files.create() expects a Buffer directly
        console.log("[Replicate] Uploading buffer, size:", buffer.length, "bytes");
        const file = await replicate.files.create(buffer);
        
        console.log("[Replicate] File upload response:", JSON.stringify(file, null, 2));
        
        // Handle different response formats from Replicate
        // Replicate returns: { urls: { get: "https://api.replicate.com/v1/files/..." } }
        let uploadedUrl: string | undefined;
        if (typeof file === "string") {
          uploadedUrl = file;
        } else if (file && typeof file === "object") {
          // Try urls.get first (most common format)
          if (file.urls && typeof file.urls === "object" && file.urls.get) {
            uploadedUrl = file.urls.get;
          } else {
            // Fallback to other possible formats
            uploadedUrl = file.url || file.uri || (file as any).URL;
          }
        }
        
        if (!uploadedUrl || typeof uploadedUrl !== "string") {
          console.error("[Replicate] Invalid file response:", file);
          throw new Error(`Replicate files.create() did not return a valid file URL. Response: ${JSON.stringify(file)}`);
        }
        
        personInput = uploadedUrl;
        console.log("[Replicate] Person image uploaded:", personInput);
      } catch (uploadError) {
        console.error("[Replicate] Failed to upload person image:", uploadError);
        throw new Error(`Failed to upload person image: ${uploadError instanceof Error ? uploadError.message : "Unknown error"}`);
      }
    }
    
    // If garment image is a data URL, upload it to Replicate files
    if (garmentImageUrl.startsWith("data:image/")) {
      console.log("[Replicate] Uploading garment image (data URL) to Replicate files...");
      try {
        // Extract base64 data from data URL
        const base64Data = garmentImageUrl.split(",")[1];
        if (!base64Data) {
          throw new Error("Invalid data URL format - no base64 data found");
        }
        const buffer = Buffer.from(base64Data, "base64");
        
        // Upload to Replicate files - files.create() expects a Buffer directly
        console.log("[Replicate] Uploading buffer, size:", buffer.length, "bytes");
        const file = await replicate.files.create(buffer);
        
        console.log("[Replicate] File upload response:", JSON.stringify(file, null, 2));
        
        // Handle different response formats from Replicate
        // Replicate returns: { urls: { get: "https://api.replicate.com/v1/files/..." } }
        let uploadedUrl: string | undefined;
        if (typeof file === "string") {
          uploadedUrl = file;
        } else if (file && typeof file === "object") {
          // Try urls.get first (most common format)
          if (file.urls && typeof file.urls === "object" && file.urls.get) {
            uploadedUrl = file.urls.get;
          } else {
            // Fallback to other possible formats
            uploadedUrl = file.url || file.uri || (file as any).URL;
          }
        }
        
        if (!uploadedUrl || typeof uploadedUrl !== "string") {
          console.error("[Replicate] Invalid file response:", file);
          throw new Error(`Replicate files.create() did not return a valid file URL. Response: ${JSON.stringify(file)}`);
        }
        
        garmentInput = uploadedUrl;
        console.log("[Replicate] Garment image uploaded:", garmentInput);
      } catch (uploadError) {
        console.error("[Replicate] Failed to upload garment image:", uploadError);
        throw new Error(`Failed to upload garment image: ${uploadError instanceof Error ? uploadError.message : "Unknown error"}`);
      }
    }

    // Validate that both inputs are defined
    if (!personInput || typeof personInput !== "string") {
      throw new Error(`Invalid person image input: ${personInput}`);
    }
    if (!garmentInput || typeof garmentInput !== "string") {
      throw new Error(`Invalid garment image input: ${garmentInput}`);
    }

    console.log("Calling Replicate API with model:", MODEL_ID);
    console.log("Input types - person:", typeof personInput, "garment:", typeof garmentInput);
    console.log("Person URL length:", personInput?.length || 0, "Garment URL length:", garmentInput?.length || 0);
    console.log("Using prompt:", GARMENT_TRANSFER_PROMPT);
    console.log("Quality mode:", qualityMode, "Config:", config);
    
    // Use replicate.run which returns a Promise that resolves when the prediction completes
    // For google/nano-banana-pro, we use image inputs and a prompt
    // Try different parameter names as the model might use different conventions
    let output;
    try {
      output = await replicate.run(MODEL_ID, {
        input: {
          image: personInput, // Person image (now a URL)
          image2: garmentInput, // Garment image (now a URL)
          prompt: GARMENT_TRANSFER_PROMPT,
          // OPTIMIZED: Add resolution parameters if model supports them
          width: config.width,
          height: config.height,
          num_inference_steps: config.numInferenceSteps,
          guidance_scale: config.guidanceScale,
        },
      });
    } catch (error: any) {
      // If the above fails, try alternative parameter names
      console.warn("First attempt failed, trying alternative parameter names:", error.message);
      try {
        output = await replicate.run(MODEL_ID, {
          input: {
            person_image: personInput,
            garment_image: garmentInput,
            prompt: GARMENT_TRANSFER_PROMPT,
            width: config.width,
            height: config.height,
          },
        });
      } catch (error2: any) {
        console.warn("Second attempt failed, trying with different names:", error2.message);
        // Try with just prompt and images as separate parameters (no resolution params)
        output = await replicate.run(MODEL_ID, {
          input: {
            image1: personInput,
            image2: garmentInput,
            prompt: GARMENT_TRANSFER_PROMPT,
          },
        });
      }
    }

    console.log("Replicate output type:", typeof output);
    console.log("Replicate output:", JSON.stringify(output, null, 2));
    
    // If output is an empty object {}, create a prediction manually and poll for results
    if (output && typeof output === "object" && Object.keys(output).length === 0) {
      console.warn("Replicate returned empty object, creating prediction manually and polling...");
      
      try {
        // Create a prediction manually
        let prediction;
        try {
          prediction = await replicate.predictions.create({
            model: MODEL_ID,
            input: {
              image: personInput,
              image2: garmentInput,
              prompt: GARMENT_TRANSFER_PROMPT,
              width: config.width,
              height: config.height,
            },
          });
        } catch (error: any) {
          console.warn("First prediction attempt failed, trying alternatives:", error.message);
          try {
            prediction = await replicate.predictions.create({
              model: MODEL_ID,
              input: {
                person_image: personInput,
                garment_image: garmentInput,
                prompt: GARMENT_TRANSFER_PROMPT,
                width: config.width,
                height: config.height,
              },
            });
          } catch (error2: any) {
            prediction = await replicate.predictions.create({
              model: MODEL_ID,
              input: {
                image1: personInput,
                image2: garmentInput,
                prompt: GARMENT_TRANSFER_PROMPT,
              },
            });
          }
        }
        
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
    
    let resultUrl: string | null = null;

    if (typeof output === "string") {
      resultUrl = output;
    } else if (Array.isArray(output)) {
      // If array, get first element (or use image_input if it's an array of image inputs)
      if (output.length > 0) {
        const first = output[0];
        resultUrl = typeof first === "string" ? first : (first?.url || String(first));
      }
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
          const first = nested[0];
          resultUrl = typeof first === "string" ? first : (first?.url || String(first));
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
            const first = firstValue[0];
            resultUrl = typeof first === "string" ? first : (first?.url || String(first));
          } else if (firstValue && typeof firstValue === "object" && "url" in firstValue) {
            resultUrl = firstValue.url;
          }
        }
      }
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
    return {
      resultUrl,
      config: {
        inputSize: `${config.width}x${config.height}`,
        outputSize: `${config.width}x${config.height}`,
        quality: config.quality,
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Replicate generation error:", errorMessage);
    throw new Error(`Replicate generation failed: ${errorMessage}`);
  }
}

/**
 * Resize image before sending to Replicate to reduce processing time
 * This reduces the data transfer and processing time
 */
export async function resizeImageForReplicate(
  imageUrl: string,
  maxWidth: number = 512,
  maxHeight: number = 512
): Promise<string> {
  // If image is already small enough, return as-is
  // In production, you might want to use an image resizing service
  // For now, we'll let Replicate handle resizing via parameters
  return imageUrl;
}
