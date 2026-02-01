/**
 * Optimiseur MAX FPS - Techniques avancées pour atteindre 60+ FPS constants
 * Utilise batching, priorités, et optimisations GPU agressives
 */

interface FrameTask {
  id: string;
  callback: () => void;
  priority: number;
  persistent: boolean;
}

class MaxFpsOptimizer {
  private frameTasks: Map<string, FrameTask> = new Map();
  private rafId: number | null = null;
  private isRunning = false;
  private lastFrameTime = 0;
  private frameCount = 0;
  private fps = 60;
  private readonly targetFps = 60;
  private readonly frameTime = 1000 / 60; // ~16.67ms

  constructor() {
    if (typeof window !== 'undefined') {
      this.start();
    }
  }

  /**
   * Ajoute une tâche à exécuter dans le prochain frame
   * Priorité plus élevée = exécution plus rapide
   */
  scheduleTask(
    id: string,
    callback: () => void,
    priority: number = 0,
    persistent: boolean = false
  ) {
    this.frameTasks.set(id, {
      id,
      callback,
      priority,
      persistent,
    });

    if (!this.isRunning) {
      this.start();
    }
  }

  /**
   * Supprime une tâche
   */
  cancelTask(id: string) {
    this.frameTasks.delete(id);
  }

  /**
   * Démarre la boucle d'animation optimisée
   */
  private start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.tick();
  }

  /**
   * Arrête la boucle d'animation
   */
  stop() {
    this.isRunning = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  /**
   * Boucle d'animation optimisée avec batching et priorités
   */
  private tick = () => {
    const now = performance.now();
    const deltaTime = now - this.lastFrameTime;

    // Calculer le FPS
    this.frameCount++;
    if (this.frameCount % 60 === 0) {
      this.fps = Math.round(1000 / deltaTime);
    }

    // Trier les tâches par priorité (plus élevée = première)
    const sortedTasks = Array.from(this.frameTasks.values()).sort(
      (a, b) => b.priority - a.priority
    );

    // Exécuter les tâches dans l'ordre de priorité
    // Limiter le temps d'exécution pour maintenir 60 FPS
    const maxExecutionTime = this.frameTime * 0.8; // 80% du temps de frame
    const startTime = performance.now();

    for (const task of sortedTasks) {
      if (performance.now() - startTime > maxExecutionTime) {
        // Pause si on dépasse le temps alloué
        break;
      }

      try {
        task.callback();
      } catch (error) {
        console.error(`Error in frame task ${task.id}:`, error);
      }

      // Supprimer les tâches non persistantes
      if (!task.persistent) {
        this.frameTasks.delete(task.id);
      }
    }

    this.lastFrameTime = now;

    // Continuer la boucle
    if (this.isRunning && this.frameTasks.size > 0) {
      this.rafId = requestAnimationFrame(this.tick);
    } else {
      this.isRunning = false;
      this.rafId = null;
    }
  };

  /**
   * Obtient le FPS actuel
   */
  getFps(): number {
    return this.fps;
  }
}

// Instance singleton
let optimizerInstance: MaxFpsOptimizer | null = null;

export function getMaxFpsOptimizer(): MaxFpsOptimizer {
  if (!optimizerInstance) {
    optimizerInstance = new MaxFpsOptimizer();
  }
  return optimizerInstance;
}

/**
 * Batch multiple mises à jour DOM pour réduire les reflows
 */
export function batchDOMUpdates(updates: (() => void)[]): void {
  const optimizer = getMaxFpsOptimizer();
  const batchId = `batch-${Date.now()}-${Math.random()}`;

  // Utiliser requestAnimationFrame pour batch les mises à jour
  requestAnimationFrame(() => {
    // Forcer un reflow avant les mises à jour
    document.body.offsetHeight;

    // Exécuter toutes les mises à jour
    updates.forEach((update) => {
      try {
        update();
      } catch (error) {
        console.error('Error in DOM update batch:', error);
      }
    });

    // Forcer un reflow après les mises à jour
    document.body.offsetHeight;
  });
}

/**
 * Optimise les propriétés CSS pour maximiser les FPS
 */
export function optimizeElementForMaxFps(element: HTMLElement): void {
  if (!element) return;

  // Appliquer toutes les optimisations GPU
  const style = element.style;
  
  // Accélération GPU maximale
  style.transform = 'translate3d(0, 0, 0)';
  style.willChange = 'transform, scroll-position';
  
  // Contain strict
  style.contain = 'strict';
  
  // Content visibility
  style.contentVisibility = 'auto';
  style.containIntrinsicSize = 'auto 500px';
  
  // Isolation
  style.isolation = 'isolate';
  style.backfaceVisibility = 'hidden';
  style.perspective = '1000px';
  style.transformStyle = 'preserve-3d';
  
  // Smooth scrolling
  style.webkitOverflowScrolling = 'touch';
  style.overflowScrolling = 'touch';
}

/**
 * Prévenir le layout thrashing en batchant les lectures/écritures
 */
export class LayoutThrashingPreventer {
  private readQueue: (() => void)[] = [];
  private writeQueue: (() => void)[] = [];
  private isProcessing = false;

  /**
   * Ajoute une opération de lecture
   */
  read(callback: () => void) {
    this.readQueue.push(callback);
    this.process();
  }

  /**
   * Ajoute une opération d'écriture
   */
  write(callback: () => void) {
    this.writeQueue.push(callback);
    this.process();
  }

  /**
   * Traite les queues de lecture/écriture
   */
  private process() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    requestAnimationFrame(() => {
      // Exécuter toutes les lectures d'abord
      this.readQueue.forEach((read) => {
        try {
          read();
        } catch (error) {
          console.error('Error in read operation:', error);
        }
      });
      this.readQueue = [];

      // Puis exécuter toutes les écritures
      this.writeQueue.forEach((write) => {
        try {
          write();
        } catch (error) {
          console.error('Error in write operation:', error);
        }
      });
      this.writeQueue = [];

      this.isProcessing = false;

      // Traiter à nouveau si des opérations ont été ajoutées
      if (this.readQueue.length > 0 || this.writeQueue.length > 0) {
        this.process();
      }
    });
  }
}

// Instance singleton pour le layout thrashing preventer
let layoutThrashingPreventerInstance: LayoutThrashingPreventer | null = null;

export function getLayoutThrashingPreventer(): LayoutThrashingPreventer {
  if (!layoutThrashingPreventerInstance) {
    layoutThrashingPreventerInstance = new LayoutThrashingPreventer();
  }
  return layoutThrashingPreventerInstance;
}

/**
 * Optimise les event listeners pour maximiser les FPS
 */
export function optimizeEventListener(
  element: HTMLElement | Window,
  event: string,
  handler: EventListener,
  options?: AddEventListenerOptions
): () => void {
  // Utiliser des options optimales par défaut
  const optimizedOptions: AddEventListenerOptions = {
    passive: true,
    capture: false,
    ...options,
  };

  // Wrapper le handler avec requestAnimationFrame
  const optimizedHandler: EventListener = (e) => {
    requestAnimationFrame(() => {
      handler(e);
    });
  };

  element.addEventListener(event, optimizedHandler, optimizedOptions);

  // Retourner une fonction de nettoyage
  return () => {
    element.removeEventListener(event, optimizedHandler, optimizedOptions);
  };
}

/**
 * Initialise toutes les optimisations MAX FPS
 */
export function initMaxFpsOptimizations() {
  if (typeof window === 'undefined') return;

  // Initialiser l'optimiseur
  getMaxFpsOptimizer();

  // Importer et initialiser le lazy loading
  import('./intersectionObserverOptimizer').then(({ initLazyLoading }) => {
    initLazyLoading();
  });

  // Optimiser tous les éléments scrollables existants
  const optimizeAllScrollables = () => {
    const scrollables = document.querySelectorAll(
      '.app-container, [class*="scroll"], [class*="overflow"], .Polaris-DataTable, .Polaris-DataTable__ScrollContainer, .history-table-wrapper, .products-list, .activity-list'
    );

    scrollables.forEach((element) => {
      if (element instanceof HTMLElement) {
        optimizeElementForMaxFps(element);
      }
    });
  };

  // Optimiser immédiatement si le DOM est prêt
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', optimizeAllScrollables, { once: true, passive: true });
  } else {
    optimizeAllScrollables();
  }

  // Observer les nouveaux éléments avec debounce
  let mutationTimeout: NodeJS.Timeout | null = null;
  const observer = new MutationObserver((mutations) => {
    let shouldOptimize = false;
    mutations.forEach((mutation) => {
      if (mutation.addedNodes.length > 0) {
        shouldOptimize = true;
      }
    });

    if (shouldOptimize) {
      // Debounce les optimisations pour éviter les surcharges
      if (mutationTimeout) {
        clearTimeout(mutationTimeout);
      }
      mutationTimeout = setTimeout(() => {
        requestAnimationFrame(() => {
          optimizeAllScrollables();
          // Ré-initialiser le lazy loading pour les nouveaux éléments
          import('./intersectionObserverOptimizer').then(({ initLazyLoading }) => {
            initLazyLoading();
          });
        });
      }, 100);
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  // Optimiser le scroll de la fenêtre avec priorité maximale
  optimizeEventListener(
    window,
    'scroll',
    () => {
      // Scroll optimisé - les mises à jour sont gérées par RAF
    },
    { passive: true }
  );

  // Optimiser le resize avec debounce
  let resizeTimeout: NodeJS.Timeout | null = null;
  optimizeEventListener(
    window,
    'resize',
    () => {
      if (resizeTimeout) {
        clearTimeout(resizeTimeout);
      }
      resizeTimeout = setTimeout(() => {
        requestAnimationFrame(() => {
          optimizeAllScrollables();
        });
      }, 150);
    },
    { passive: true }
  );
}

