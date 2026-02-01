import { useEffect, useRef, useCallback } from 'react';

/**
 * Hook pour optimiser les performances du scroll
 * Utilise requestAnimationFrame et debounce pour réduire la latence perçue
 */
export function useOptimizedScroll(
  onScroll?: (event: Event) => void,
  options?: {
    debounceMs?: number;
    passive?: boolean;
    useRAF?: boolean;
  }
) {
  const rafIdRef = useRef<number | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastScrollTimeRef = useRef<number>(0);
  const elementRef = useRef<HTMLElement | null>(null);

  const {
    debounceMs = 16, // ~60fps par défaut
    passive = true,
    useRAF = true,
  } = options || {};

  const handleScroll = useCallback(
    (event: Event) => {
      if (!onScroll) return;

      const now = performance.now();

      // Utiliser requestAnimationFrame pour synchroniser avec le rafraîchissement de l'écran
      if (useRAF) {
        // Annuler le RAF précédent s'il existe
        if (rafIdRef.current !== null) {
          cancelAnimationFrame(rafIdRef.current);
        }

        rafIdRef.current = requestAnimationFrame(() => {
          rafIdRef.current = null;
          onScroll(event);
        });
      } else {
        // Utiliser debounce classique si RAF n'est pas souhaité
        if (timeoutRef.current !== null) {
          clearTimeout(timeoutRef.current);
        }

        timeoutRef.current = setTimeout(() => {
          timeoutRef.current = null;
          onScroll(event);
        }, debounceMs);
      }
    },
    [onScroll, debounceMs, useRAF]
  );

  useEffect(() => {
    const element = elementRef.current || window;
    const scrollElement = element === window ? window : element;

    // Ajouter l'écouteur avec l'option passive pour de meilleures performances
    scrollElement.addEventListener('scroll', handleScroll, { passive });

    return () => {
      // Nettoyer les timers et listeners
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }

      if (timeoutRef.current !== null) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }

      scrollElement.removeEventListener('scroll', handleScroll);
    };
  }, [handleScroll, passive]);

  const setElement = useCallback((element: HTMLElement | null) => {
    elementRef.current = element;
  }, []);

  return { setElement };
}

/**
 * Hook pour optimiser le scroll avec throttling
 * Utile pour les opérations coûteuses qui ne nécessitent pas d'être exécutées à chaque frame
 */
export function useThrottledScroll(
  onScroll?: (event: Event) => void,
  throttleMs: number = 100
) {
  const lastCallRef = useRef<number>(0);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const elementRef = useRef<HTMLElement | null>(null);

  const handleScroll = useCallback(
    (event: Event) => {
      if (!onScroll) return;

      const now = performance.now();
      const timeSinceLastCall = now - lastCallRef.current;

      if (timeSinceLastCall >= throttleMs) {
        lastCallRef.current = now;
        onScroll(event);
      } else {
        // Planifier l'appel pour le prochain intervalle disponible
        if (timeoutRef.current !== null) {
          clearTimeout(timeoutRef.current);
        }

        timeoutRef.current = setTimeout(() => {
          timeoutRef.current = null;
          lastCallRef.current = performance.now();
          onScroll(event);
        }, throttleMs - timeSinceLastCall);
      }
    },
    [onScroll, throttleMs]
  );

  useEffect(() => {
    const element = elementRef.current || window;
    const scrollElement = element === window ? window : element;

    scrollElement.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      if (timeoutRef.current !== null) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }

      scrollElement.removeEventListener('scroll', handleScroll);
    };
  }, [handleScroll]);

  const setElement = useCallback((element: HTMLElement | null) => {
    elementRef.current = element;
  }, []);

  return { setElement };
}

