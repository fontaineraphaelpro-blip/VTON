/**
 * Replicate API Service
 * Optimized for faster processing with reduced image resolution and quality
 */

import Replicate from "replicate";

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN || "",
});

// OPTIMIZED: Reduced image sizes for faster processing
// Input and output resolutions are reduced to speed up processing
const OPTIMIZED_CONFIG = {
  // Reduced input image size (was likely 1024x1024 or higher)
  inputWidth: 512,
  inputHeight: 512,
  
  // Reduced output image size (was likely 1024x1024 or higher)
  outputWidth: 512,
  outputHeight: 512,
  
  // Reduced quality for faster processing (still acceptable for try-on)
  quality: 85, // JPEG quality (0-100), 85 is good balance
  
  // Model-specific optimizations
  numInferenceSteps: 20, // Reduced from default (usually 30-50)
  guidanceScale: 7.5, // Standard value, can be reduced slightly
};

/**
 * Generate virtual try-on image using Replicate
 * OPTIMIZED: Uses reduced resolution and quality for faster processing
 */
export async function generateTryOn(
  personImageUrl: string,
  garmentImageUrl: string,
  options?: {
    qualityMode?: "speed" | "balanced" | "quality";
  }
) {
  const qualityMode = options?.qualityMode || "balanced";
  
  // Adjust parameters based on quality mode
  let config = { ...OPTIMIZED_CONFIG };
  
  if (qualityMode === "speed") {
    // Fastest: Lower resolution and quality
    config = {
      inputWidth: 384,
      inputHeight: 384,
      outputWidth: 384,
      outputHeight: 384,
      quality: 75,
      numInferenceSteps: 15,
      guidanceScale: 7.0,
    };
  } else if (qualityMode === "quality") {
    // Best quality: Higher resolution but still optimized
    config = {
      inputWidth: 768,
      inputHeight: 768,
      outputWidth: 768,
      outputHeight: 768,
      quality: 90,
      numInferenceSteps: 30,
      guidanceScale: 8.0,
    };
  }
  // balanced uses OPTIMIZED_CONFIG defaults (512x512)
  
  try {
    // Use IDM-VTON model on Replicate
    // Model: idm-vton or similar virtual try-on model
    const model = "cuuupid/idm-vton:906425db2c0b0b0e0c0b0b0b0b0b0b0b0b0b0b0b0"; // Replace with actual model
    
    // Prepare input with optimized parameters
    const input = {
      person_image: personImageUrl,
      garment_image: garmentImageUrl,
      // OPTIMIZED: Reduced image sizes
      image_size: `${config.outputWidth}x${config.outputHeight}`, // Output size
      // Resize input images before sending to reduce processing time
      resize_person: true,
      resize_garment: true,
      person_size: `${config.inputWidth}x${config.inputHeight}`,
      garment_size: `${config.inputWidth}x${config.inputHeight}`,
      // Quality settings
      quality: config.quality,
      num_inference_steps: config.numInferenceSteps,
      guidance_scale: config.guidanceScale,
    };
    
    const output = await replicate.run(model as any, { input });
    
    // Extract result URL
    const resultUrl = Array.isArray(output) ? output[0] : output;
    
    return {
      resultUrl: typeof resultUrl === "string" ? resultUrl : resultUrl?.url || resultUrl,
      config: {
        inputSize: `${config.inputWidth}x${config.inputHeight}`,
        outputSize: `${config.outputWidth}x${config.outputHeight}`,
        quality: config.quality,
      },
    };
  } catch (error) {
    console.error("[Replicate] Error generating try-on:", error);
    throw new Error(`Failed to generate try-on: ${error instanceof Error ? error.message : "Unknown error"}`);
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
