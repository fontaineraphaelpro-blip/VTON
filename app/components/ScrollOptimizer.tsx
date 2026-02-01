import { useEffect } from "react";
import { initAllScrollOptimizations } from "../utils/scrollOptimizer";

/**
 * Composant client pour initialiser les optimisations de scroll simples
 */
export function ScrollOptimizer() {
  useEffect(() => {
    if (typeof window !== "undefined") {
      initAllScrollOptimizations();
    }
  }, []);

  return null;
}
