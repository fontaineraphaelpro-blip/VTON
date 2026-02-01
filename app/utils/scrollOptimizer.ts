/**
 * Utilitaire SIMPLE pour optimiser les performances du scroll
 * Version minimale et sûre
 */

let scrollOptimizerInitialized = false;

/**
 * Initialise l'optimiseur de scroll - Version simple et sûre
 */
export function initScrollOptimizer() {
  if (scrollOptimizerInitialized || typeof window === 'undefined') return;
  scrollOptimizerInitialized = true;

  // Optimiser uniquement les DataTables avec scroll
  const optimizeDataTables = () => {
    const dataTables = document.querySelectorAll('.Polaris-DataTable__ScrollContainer, .history-table-wrapper');
    dataTables.forEach((table) => {
      if (table instanceof HTMLElement) {
        table.style.webkitOverflowScrolling = 'touch';
      }
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', optimizeDataTables, { once: true });
  } else {
    optimizeDataTables();
  }
}

/**
 * Optimise un élément spécifique pour le scroll
 */
export function optimizeElementScroll(element: HTMLElement) {
  if (!element) return;
  element.style.webkitOverflowScrolling = 'touch';
}

/**
 * Applique les optimisations de scroll à tous les DataTables Polaris
 */
export function optimizeDataTables() {
  if (typeof document === 'undefined') return;
  const dataTables = document.querySelectorAll('.Polaris-DataTable__ScrollContainer, .history-table-wrapper');
  dataTables.forEach((table) => {
    if (table instanceof HTMLElement) {
      optimizeElementScroll(table);
    }
  });
}

/**
 * Initialise toutes les optimisations de scroll - Version simple
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

// Désactiver les optimisations MAX FPS trop agressives
// Ne pas importer maxFpsOptimizer pour éviter les problèmes
