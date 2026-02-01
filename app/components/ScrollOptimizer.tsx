import { useEffect } from "react";
import { initAllScrollOptimizations } from "../utils/scrollOptimizer";

/**
 * Composant client pour initialiser les optimisations MAX FPS
 * S'exécute uniquement côté client pour éviter les erreurs SSR
 */
export function ScrollOptimizer() {
  useEffect(() => {
    // Initialiser les optimisations MAX FPS uniquement côté client
    if (typeof window !== "undefined") {
      // Initialiser immédiatement
      initAllScrollOptimizations();
      
      // Ré-optimiser après un court délai pour capturer les éléments chargés dynamiquement
      const timeoutId = setTimeout(() => {
        initAllScrollOptimizations();
      }, 100);
      
      return () => {
        clearTimeout(timeoutId);
      };
    }
  }, []);

  return null;
}

