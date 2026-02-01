/**
 * Optimiseur IntersectionObserver pour lazy loading et virtualisation
 * Améliore les FPS en ne rendant que les éléments visibles
 */

interface IntersectionObserverOptions {
  root?: Element | null;
  rootMargin?: string;
  threshold?: number | number[];
}

class LazyLoadManager {
  private observer: IntersectionObserver | null = null;
  private observedElements: Map<Element, () => void> = new Map();

  constructor() {
    if (typeof window !== 'undefined' && 'IntersectionObserver' in window) {
      this.observer = new IntersectionObserver(
        this.handleIntersection.bind(this),
        {
          root: null,
          rootMargin: '50px', // Charger 50px avant que l'élément soit visible
          threshold: [0, 0.1, 0.5, 1.0],
        }
      );
    }
  }

  /**
   * Observe un élément pour le lazy loading
   */
  observe(element: Element, callback: () => void) {
    if (!this.observer || !element) return;

    this.observedElements.set(element, callback);
    this.observer.observe(element);
  }

  /**
   * Arrête d'observer un élément
   */
  unobserve(element: Element) {
    if (!this.observer || !element) return;

    this.observer.unobserve(element);
    this.observedElements.delete(element);
  }

  /**
   * Gère les intersections
   */
  private handleIntersection(entries: IntersectionObserverEntry[]) {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        const callback = this.observedElements.get(entry.target);
        if (callback) {
          // Utiliser requestAnimationFrame pour optimiser
          requestAnimationFrame(() => {
            callback();
          });
        }
      }
    });
  }

  /**
   * Nettoie toutes les observations
   */
  disconnect() {
    if (this.observer) {
      this.observer.disconnect();
      this.observedElements.clear();
    }
  }
}

// Instance singleton
let lazyLoadManagerInstance: LazyLoadManager | null = null;

export function getLazyLoadManager(): LazyLoadManager {
  if (!lazyLoadManagerInstance) {
    lazyLoadManagerInstance = new LazyLoadManager();
  }
  return lazyLoadManagerInstance;
}

/**
 * Applique le lazy loading à un élément
 */
export function applyLazyLoading(
  element: HTMLElement,
  onVisible?: () => void
): () => void {
  if (!element) return () => {};

  const manager = getLazyLoadManager();

  // Marquer l'élément comme lazy
  element.style.contentVisibility = 'auto';
  element.style.containIntrinsicSize = 'auto 500px';

  // Observer l'élément
  if (onVisible) {
    manager.observe(element, onVisible);
  }

  // Retourner une fonction de nettoyage
  return () => {
    manager.unobserve(element);
  };
}

/**
 * Applique le lazy loading à tous les éléments avec l'attribut data-lazy
 */
export function initLazyLoading() {
  if (typeof document === 'undefined') return;

  const lazyElements = document.querySelectorAll('[data-lazy]');

  lazyElements.forEach((element) => {
    if (element instanceof HTMLElement) {
      applyLazyLoading(element, () => {
        // Charger le contenu lazy
        const src = element.getAttribute('data-lazy-src');
        if (src && element.tagName === 'IMG') {
          (element as HTMLImageElement).src = src;
          element.removeAttribute('data-lazy-src');
        }
      });
    }
  });
}

/**
 * Virtualisation simple pour les grandes listes
 */
export class VirtualList {
  private container: HTMLElement;
  private itemHeight: number;
  private visibleCount: number;
  private items: any[];
  private renderItem: (item: any, index: number) => HTMLElement;
  private observer: IntersectionObserver | null = null;
  private visibleRange: { start: number; end: number } = { start: 0, end: 0 };

  constructor(
    container: HTMLElement,
    items: any[],
    itemHeight: number,
    renderItem: (item: any, index: number) => HTMLElement
  ) {
    this.container = container;
    this.items = items;
    this.itemHeight = itemHeight;
    this.renderItem = renderItem;
    this.visibleCount = Math.ceil(container.clientHeight / itemHeight) + 2; // +2 pour buffer

    this.init();
  }

  private init() {
    // Créer un conteneur de scroll
    this.container.style.overflow = 'auto';
    this.container.style.transform = 'translate3d(0, 0, 0)';
    this.container.style.willChange = 'scroll-position';
    this.container.style.contain = 'strict';

    // Créer un spacer pour la hauteur totale
    const spacer = document.createElement('div');
    spacer.style.height = `${this.items.length * this.itemHeight}px`;
    spacer.style.transform = 'translate3d(0, 0, 0)';
    this.container.appendChild(spacer);

    // Observer le scroll
    this.container.addEventListener('scroll', this.handleScroll.bind(this), {
      passive: true,
    });

    // Rendre initialement
    this.render();
  }

  private handleScroll() {
    requestAnimationFrame(() => {
      this.render();
    });
  }

  private render() {
    const scrollTop = this.container.scrollTop;
    const start = Math.max(0, Math.floor(scrollTop / this.itemHeight) - 1);
    const end = Math.min(
      this.items.length,
      start + this.visibleCount + 2
    );

    // Ne re-rendre que si la plage visible a changé
    if (
      start === this.visibleRange.start &&
      end === this.visibleRange.end
    ) {
      return;
    }

    this.visibleRange = { start, end };

    // Supprimer les anciens éléments
    const oldItems = this.container.querySelectorAll('.virtual-item');
    oldItems.forEach((item) => item.remove());

    // Créer les nouveaux éléments visibles
    for (let i = start; i < end; i++) {
      const item = this.renderItem(this.items[i], i);
      item.classList.add('virtual-item');
      item.style.position = 'absolute';
      item.style.top = `${i * this.itemHeight}px`;
      item.style.left = '0';
      item.style.right = '0';
      item.style.height = `${this.itemHeight}px`;
      item.style.transform = 'translate3d(0, 0, 0)';
      item.style.willChange = 'transform';
      item.style.contain = 'strict';
      this.container.appendChild(item);
    }
  }

  /**
   * Met à jour les items
   */
  updateItems(items: any[]) {
    this.items = items;
    this.render();
  }

  /**
   * Nettoie la virtualisation
   */
  destroy() {
    if (this.observer) {
      this.observer.disconnect();
    }
    this.container.innerHTML = '';
  }
}

