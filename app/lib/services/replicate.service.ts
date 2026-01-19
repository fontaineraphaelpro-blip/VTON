import Replicate from "replicate";

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
  useFileOutput: false, // Désactive FileOutput pour retourner des URLs directement
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
    
    // Log only in development
    if (process.env.NODE_ENV !== "production") {
      console.log('[Replicate] Uploading user photo to Replicate files...');
    }
    const uploadedFile = await replicate.files.create(buffer, {
      contentType: 'image/png',
    });
    
    // Extraire l'URL depuis l'objet retourné
    userPhotoInput = uploadedFile.urls.get;
    // Log only in development
    if (process.env.NODE_ENV !== "production") {
      console.log('[Replicate] User photo uploaded, URL:', userPhotoInput);
    }
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

  // Format correct pour google/nano-banana-pro selon la documentation Replicate
  // Le modèle accepte image_input comme tableau d'images et un prompt
  const inputPayload = {
    prompt: "This is NOT a redesign task. It is a garment transfer task. Use the clothing from the second image exactly as-is with zero creative interpretation. The output must look like the REAL clothing item was physically worn by the person. No invented graphics, no color changes, no simplification.",
    image_input: [
      userPhotoInput, // Photo de la personne (première image)
      productImageUrl, // Image du vêtement (deuxième image)
    ],
    aspect_ratio: "4:3",
    resolution: "2K",
    output_format: "png",
    safety_filter_level: "block_only_high",
  };

  // Log only in development
  if (process.env.NODE_ENV !== "production") {
    console.log('[Replicate] Starting generation with google/nano-banana-pro model');
    console.log('[Replicate] Input payload:', JSON.stringify({
      ...inputPayload,
      image_input: [
        userPhotoInput,
        productImageUrl
      ]
    }, null, 2));
  }

  // Créer une promesse avec timeout pour éviter les blocages infinis
  const TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes timeout
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new Error(`Replicate generation timeout after ${TIMEOUT_MS / 1000} seconds. The model may be overloaded or stuck.`));
    }, TIMEOUT_MS);
  });

  // Appeler le modèle google/nano-banana-pro avec timeout
  let output: any;
  try {
    output = await Promise.race([
      replicate.run(
        "google/nano-banana-pro",
        {
          input: inputPayload,
        }
      ),
      timeoutPromise
    ]);
  } catch (error) {
    // Log l'erreur pour debugging
    console.error('[Replicate] Error during generation:', error);
    
    // Si c'est une erreur de timeout, donner plus de détails
    if (error instanceof Error && error.message.includes('timeout')) {
      throw new Error(`Generation timeout: The model took longer than ${TIMEOUT_MS / 1000} seconds to respond. This may indicate the model is overloaded or there's an issue with the input parameters. Please try again later or check your Replicate account status.`);
    }
    
    // Si c'est une erreur de l'API Replicate, la propager avec plus de contexte
    if (error instanceof Error) {
      throw new Error(`Replicate API error: ${error.message}. Please check your API token, account status, and model availability.`);
    }
    
    throw error;
  }

  // Log (always log for debugging)
  console.log('[Replicate] Generation completed, output type:', typeof output);
  console.log('[Replicate] Generation completed, output:', JSON.stringify(output, null, 2));
  console.log('[Replicate] Output constructor:', output?.constructor?.name);
  console.log('[Replicate] Is array:', Array.isArray(output));
  console.log('[Replicate] Output keys:', output && typeof output === 'object' ? Object.keys(output) : 'N/A');

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
    
    // Vérifier différentes propriétés possibles dans l'ordre de probabilité
    if (typeof outputAny.url === 'string') {
      resultUrl = outputAny.url;
    } else if (typeof outputAny.result === 'string') {
      resultUrl = outputAny.result;
    } else if (typeof outputAny.result_url === 'string') {
      resultUrl = outputAny.result_url;
    } else if (typeof outputAny.output === 'string') {
      resultUrl = outputAny.output;
    } else if (Array.isArray(outputAny.output) && outputAny.output.length > 0) {
      resultUrl = typeof outputAny.output[0] === 'string' ? outputAny.output[0] : String(outputAny.output[0]);
    } else if (Array.isArray(outputAny.result) && outputAny.result.length > 0) {
      resultUrl = typeof outputAny.result[0] === 'string' ? outputAny.result[0] : String(outputAny.result[0]);
    } else if (Array.isArray(outputAny) && outputAny.length > 0) {
      // Si l'objet lui-même est itérable comme un array
      resultUrl = typeof outputAny[0] === 'string' ? outputAny[0] : String(outputAny[0]);
    } else {
      // Essayer de convertir en string et vérifier si c'est une URL
      const str = String(output);
      if (str.startsWith('http')) {
        resultUrl = str;
      } else {
        // Dernière tentative : chercher toutes les valeurs string qui commencent par http
        const findUrlInObject = (obj: any, depth = 0): string | null => {
          if (depth > 3) return null; // Limiter la profondeur
          if (typeof obj === 'string' && obj.startsWith('http')) return obj;
          if (Array.isArray(obj)) {
            for (const item of obj) {
              const found = findUrlInObject(item, depth + 1);
              if (found) return found;
            }
          }
          if (obj && typeof obj === 'object') {
            for (const key in obj) {
              const found = findUrlInObject(obj[key], depth + 1);
              if (found) return found;
            }
          }
          return null;
        };
        
        const foundUrl = findUrlInObject(output);
        if (foundUrl) {
          resultUrl = foundUrl;
        } else {
          throw new Error('Unexpected output format from Replicate. Output type: ' + typeof output + ', Constructor: ' + (output?.constructor?.name || 'unknown') + ', Output: ' + JSON.stringify(output, null, 2));
        }
      }
    }
  } else {
    throw new Error('Unexpected output format from Replicate. Type: ' + typeof output);
  }

  // Log only in development
  if (process.env.NODE_ENV !== "production") {
    console.log('[Replicate] Final result URL:', resultUrl);
  }

  if (!resultUrl || typeof resultUrl !== 'string' || !resultUrl.startsWith('http')) {
    throw new Error('Invalid result URL from Replicate: ' + resultUrl + ' (type: ' + typeof resultUrl + ')');
  }

  return resultUrl;
}
