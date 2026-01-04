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
  console.log('[Replicate] Output constructor:', output?.constructor?.name);

  // Le SDK Replicate devrait retourner directement une string URL
  // Mais gérer différents formats au cas où
  let resultUrl: string;
  
  if (typeof output === 'string') {
    // Format attendu : string URL
    resultUrl = output;
  } else if (Array.isArray(output) && output.length > 0) {
    // Format array : prendre la première URL
    resultUrl = typeof output[0] === 'string' ? output[0] : String(output[0]);
  } else if (output && typeof output === 'object') {
    const outputAny = output as any;
    
    // Si c'est un ReadableStream (ne devrait pas arriver), lancer une erreur explicite
    if (outputAny instanceof ReadableStream || (outputAny.constructor && outputAny.constructor.name === 'ReadableStream')) {
      throw new Error('Replicate returned a ReadableStream instead of URL string. This should not happen with replicate.run(). The SDK may have changed. Please check the Replicate SDK documentation.');
    }
    
    // Vérifier différentes propriétés possibles
    if (typeof outputAny.url === 'string') {
      resultUrl = outputAny.url;
    } else if (typeof outputAny.output === 'string') {
      resultUrl = outputAny.output;
    } else if (Array.isArray(outputAny.output) && outputAny.output.length > 0) {
      resultUrl = typeof outputAny.output[0] === 'string' ? outputAny.output[0] : String(outputAny.output[0]);
    } else {
      // Essayer de convertir en string et vérifier si c'est une URL
      const str = String(output);
      if (str.startsWith('http')) {
        resultUrl = str;
      } else {
        throw new Error('Unexpected output format from Replicate. Output type: ' + typeof output + ', Constructor: ' + (output?.constructor?.name || 'unknown') + ', Output: ' + JSON.stringify(output, Object.getOwnPropertyNames(output), 2));
      }
    }
  } else {
    throw new Error('Unexpected output format from Replicate. Type: ' + typeof output);
  }

  console.log('[Replicate] Final result URL:', resultUrl);

  if (!resultUrl || typeof resultUrl !== 'string' || !resultUrl.startsWith('http')) {
    throw new Error('Invalid result URL from Replicate: ' + resultUrl + ' (type: ' + typeof resultUrl + ')');
  }

  return resultUrl;
}
