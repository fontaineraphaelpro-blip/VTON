// Fichier: app/routes/auth.billing-callback.tsx
// Route publique intermédiaire pour gérer le retour de paiement Shopify
// Cette route ne nécessite PAS d'authentification - c'est une "Exit Hatch"
// IMPORTANT: On redirige vers /app (pas /app/credits) pour que la session soit réhydratée
import { type LoaderFunctionArgs, redirect } from "@remix-run/node";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  const chargeId = url.searchParams.get("charge_id");

  if (!shop || !chargeId) {
    // Si pas de shop ou charge_id, on ne peut rien faire
    // Mais ça n'arrivera pas si Shopify nous redirige correctement
    return new Response("Paramètres manquants", { status: 400 });
  }

  // SOLUTION PROPRE: Rediriger vers /app (pas /app/credits) pour que la session soit réhydratée
  // /app gérera l'authentification, puis on pourra traiter le charge_id dans /app/credits
  // On passe le charge_id en paramètre pour que /app puisse le transmettre à /app/credits
  return redirect(`/auth?shop=${encodeURIComponent(shop)}&return_to=${encodeURIComponent(`/app?charge_id=${encodeURIComponent(chargeId)}`)}`);
};

