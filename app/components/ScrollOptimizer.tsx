import { useEffect } from "react";
import { initAllScrollOptimizations } from "../utils/scrollOptimizer";

/**
 * Composant client pour initialiser les optimisations de scroll
 * S'exécute uniquement côté client pour éviter les erreurs SSR
 */
export function ScrollOptimizer() {
  useEffect(() => {
    // Initialiser les optimisations de scroll uniquement côté client
    if (typeof window !== "undefined") {
      initAllScrollOptimizations();
    }
  }, []);

  return null;
}

