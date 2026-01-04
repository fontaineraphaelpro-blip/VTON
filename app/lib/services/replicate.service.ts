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

  // Convertir la photo utilisateur (base64) en URL Replicate
  // Si c'est déjà une data URL, on doit l'uploader à Replicate
  let userPhotoUrl: string;
  
  if (userPhoto.startsWith('data:image')) {
    // Uploader l'image base64 à Replicate
    const base64Data = userPhoto.split(',')[1];
    const buffer = Buffer.from(base64Data, 'base64');
    
    // Uploader le fichier à Replicate
    const file = await replicate.files.upload(buffer, {
      contentType: 'image/png',
    });
    
    userPhotoUrl = file;
  } else {
    userPhotoUrl = userPhoto;
  }

  console.log('[Replicate] Starting generation with nano-banana-pro model');
  console.log('[Replicate] User photo URL:', userPhotoUrl);
  console.log('[Replicate] Product image URL:', productImageUrl);

  // Appeler le modèle google/nano-banana-pro
  const output = await replicate.run(
    "google/nano-banana-pro:latest",
    {
      input: {
        image_input: [
          userPhotoUrl, // Photo de la personne
          productImageUrl, // Image du vêtement
        ],
        prompt: "This is NOT a redesign task. It is a garment transfer task. Use the clothing from the second image exactly as-is with zero creative interpretation. The output must look like the REAL clothing item was physically worn by the person. No invented graphics, no color changes, no simplification.",
        aspect_ratio: "4:3",
        resolution: "2K",
        output_format: "png",
        safety_filter_level: "block_only_high",
      },
    }
  ) as string;

  console.log('[Replicate] Generation completed, output:', output);

  return output;
}
