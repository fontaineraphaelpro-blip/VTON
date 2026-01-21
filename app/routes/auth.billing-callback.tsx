// Fichier: app/routes/auth.billing-callback.tsx
// Route publique intermédiaire pour gérer le retour de paiement Shopify
// Cette route ne nécessite PAS d'authentification - c'est une "Exit Hatch"
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

  // C'est ici la clé : On redirige vers /auth pour forcer la création de session
  // et on dit à /auth de nous renvoyer vers /app/credits APRES l'authentification
  const finalDestination = `/app/credits?charge_id=${encodeURIComponent(chargeId)}&shop=${encodeURIComponent(shop)}`;
  
  return redirect(`/auth?shop=${encodeURIComponent(shop)}&return_to=${encodeURIComponent(finalDestination)}`);
};

