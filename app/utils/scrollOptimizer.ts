/**
 * Utilitaire pour optimiser les performances du scroll dans l'interface admin
 * Utilise requestAnimationFrame et des techniques de performance pour réduire la latence
 */

let scrollOptimizerInitialized = false;
let rafId: number | null = null;
let lastScrollTime = 0;

/**
 * Initialise l'optimiseur de scroll global
 * Applique des optimisations CSS et JavaScript pour améliorer la fluidité
 */
export function initScrollOptimizer() {
  if (scrollOptimizerInitialized) return;
  scrollOptimizerInitialized = true;

  // Optimiser le scroll avec requestAnimationFrame
  if (typeof window !== 'undefined') {
    // Optimiser le scroll de la fenêtre
    let ticking = false;
    const handleWindowScroll = () => {
      if (!ticking) {
        rafId = requestAnimationFrame(() => {
          // Les mises à jour visuelles sont gérées par le navigateur
          // On peut ajouter des callbacks personnalisés ici si nécessaire
          ticking = false;
          rafId = null;
        });
        ticking = true;
      }
    };

    // Utiliser l'option passive pour de meilleures performances
    window.addEventListener('scroll', handleWindowScroll, { passive: true });

    // Optimiser tous les éléments scrollables
    const optimizeScrollableElements = () => {
      const scrollableElements = document.querySelectorAll(
        '[class*="scroll"], [class*="overflow"], .Polaris-DataTable__ScrollContainer, .history-table-wrapper, .products-list, .activity-list'
      );

      scrollableElements.forEach((element) => {
        if (element instanceof HTMLElement) {
          // Appliquer les optimisations CSS si elles ne sont pas déjà présentes
          const style = window.getComputedStyle(element);
          if (!style.transform || style.transform === 'none') {
            element.style.transform = 'translateZ(0)';
          }
          if (!style.willChange || style.willChange === 'auto') {
            element.style.willChange = 'scroll-position';
          }

          // Optimiser le scroll de l'élément
          let elementTicking = false;
          const handleElementScroll = () => {
            if (!elementTicking) {
              requestAnimationFrame(() => {
                elementTicking = false;
              });
              elementTicking = true;
            }
          };

          element.addEventListener('scroll', handleElementScroll, { passive: true });
        }
      });
    };

    // Optimiser les éléments existants
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', optimizeScrollableElements);
    } else {
      optimizeScrollableElements();
    }

    // Observer les nouveaux éléments ajoutés dynamiquement
    const observer = new MutationObserver((mutations) => {
      let shouldOptimize = false;
      mutations.forEach((mutation) => {
        if (mutation.addedNodes.length > 0) {
          shouldOptimize = true;
        }
      });

      if (shouldOptimize) {
        // Délai pour laisser le DOM se stabiliser
        setTimeout(optimizeScrollableElements, 100);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    // Nettoyer lors du démontage
    return () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      window.removeEventListener('scroll', handleWindowScroll);
      observer.disconnect();
    };
  }
}

/**
 * Debounce function pour optimiser les callbacks de scroll
 */
export function debounceScroll<T extends (...args: any[]) => void>(
  func: T,
  wait: number = 16
): T {
  let timeout: NodeJS.Timeout | null = null;
  let rafId: number | null = null;

  return ((...args: Parameters<T>) => {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
    }

    rafId = requestAnimationFrame(() => {
      if (timeout !== null) {
        clearTimeout(timeout);
      }

      timeout = setTimeout(() => {
        func(...args);
        timeout = null;
      }, wait);

      rafId = null;
    });
  }) as T;
}

/**
 * Throttle function pour optimiser les callbacks de scroll
 */
export function throttleScroll<T extends (...args: any[]) => void>(
  func: T,
  limit: number = 16
): T {
  let inThrottle: boolean = false;
  let rafId: number | null = null;

  return ((...args: Parameters<T>) => {
    if (!inThrottle) {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }

      rafId = requestAnimationFrame(() => {
        func(...args);
        inThrottle = true;

        setTimeout(() => {
          inThrottle = false;
        }, limit);

        rafId = null;
      });
    }
  }) as T;
}

/**
 * Optimise un élément spécifique pour le scroll
 */
export function optimizeElementScroll(element: HTMLElement) {
  if (!element) return;

  // Appliquer les optimisations CSS
  element.style.transform = 'translateZ(0)';
  element.style.willChange = 'scroll-position';
  element.style.webkitOverflowScrolling = 'touch';

  // Optimiser le scroll avec requestAnimationFrame
  let ticking = false;
  const handleScroll = () => {
    if (!ticking) {
      requestAnimationFrame(() => {
        ticking = false;
      });
      ticking = true;
    }
  };

  element.addEventListener('scroll', handleScroll, { passive: true });

  return () => {
    element.removeEventListener('scroll', handleScroll);
  };
}

/**
 * Applique les optimisations de scroll à tous les DataTables Polaris
 */
export function optimizeDataTables() {
  if (typeof document === 'undefined') return;

  const dataTables = document.querySelectorAll('.Polaris-DataTable, .Polaris-DataTable__ScrollContainer');

  dataTables.forEach((table) => {
    if (table instanceof HTMLElement) {
      optimizeElementScroll(table);
    }
  });
}

/**
 * Initialise toutes les optimisations de scroll
 */
export function initAllScrollOptimizations() {
  initScrollOptimizer();
  
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        optimizeDataTables();
      });
    } else {
      optimizeDataTables();
    }
  }
}

