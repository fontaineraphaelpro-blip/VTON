import Replicate from "replicate";

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

export interface GenerateTryOnParams {
  userPhoto: string; // Base64 data URL
  productImageUrl: string; // URL de l'image produit
}

export async function generateTryOn({ userPhoto, productImageUrl }: GenerateTryOnParams): Promise<string> {
  if (!process.env.REPLICATE_API_TOKEN) {
    throw new Error("REPLICATE_API_TOKEN is not configured");
  }

  // Uploader l'image base64 à Replicate pour obtenir une URL
  let userPhotoInput: string;
  
  if (userPhoto.startsWith('data:image')) {
    // Convertir le data URI en Buffer et uploader à Replicate
    const base64Data = userPhoto.split(',')[1];
    const buffer = Buffer.from(base64Data, 'base64');
    
    console.log('[Replicate] Uploading user photo to Replicate files...');
    const uploadedFile = await replicate.files.create(buffer, {
      contentType: 'image/png',
    });
    
    // Extraire l'URL depuis l'objet retourné
    userPhotoInput = uploadedFile.urls.get;
    console.log('[Replicate] User photo uploaded, URL:', userPhotoInput);
  } else if (userPhoto.startsWith('http')) {
    // C'est déjà une URL
    userPhotoInput = userPhoto;
  } else {
    throw new Error('Invalid user photo format');
  }
  
  // Vérifier que productImageUrl est une URL valide
  if (!productImageUrl || !productImageUrl.startsWith('http')) {
    throw new Error('Invalid product image URL');
  }

  const inputPayload = {
    image_input: [
      userPhotoInput, // Photo de la personne (data URI ou URL)
      productImageUrl, // Image du vêtement
    ],
    prompt: "This is NOT a redesign task. It is a garment transfer task. Use the clothing from the second image exactly as-is with zero creative interpretation. The output must look like the REAL clothing item was physically worn by the person. No invented graphics, no color changes, no simplification.",
    aspect_ratio: "4:3",
    resolution: "2K",
    output_format: "png",
    safety_filter_level: "block_only_high",
  };

  console.log('[Replicate] Starting generation with google/nano-banana-pro model');
  console.log('[Replicate] Input payload:', JSON.stringify({
    ...inputPayload,
    image_input: [
      userPhotoInput,
      productImageUrl
    ]
  }, null, 2));

  // Appeler le modèle google/nano-banana-pro
  const output = await replicate.run(
    "google/nano-banana-pro",
    {
      input: inputPayload,
    }
  );

  console.log('[Replicate] Generation completed, output type:', typeof output);
  console.log('[Replicate] Generation completed, output:', output);

  // Replicate peut retourner une string (URL) ou un tableau d'URLs
  let resultUrl: string;
  if (typeof output === 'string') {
    resultUrl = output;
  } else if (Array.isArray(output) && output.length > 0) {
    resultUrl = output[0];
  } else if (output && typeof output === 'object' && 'url' in output) {
    resultUrl = (output as any).url;
  } else {
    throw new Error('Unexpected output format from Replicate: ' + JSON.stringify(output));
  }

  console.log('[Replicate] Final result URL:', resultUrl);

  return resultUrl;
}
