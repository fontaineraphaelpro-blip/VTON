import { useEffect, useRef } from "react";
import { DataTable, DataTableProps } from "@shopify/polaris";
import { optimizeElementScroll } from "../utils/scrollOptimizer";

/**
 * Wrapper optimisé pour DataTable avec amélioration des performances de scroll
 */
export function OptimizedDataTable(props: DataTableProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Optimiser le scroll du conteneur de la DataTable
    if (containerRef.current) {
      const cleanup = optimizeElementScroll(containerRef.current);
      return cleanup;
    }
  }, []);

  return (
    <div ref={containerRef} className="optimized-data-table-wrapper">
      <DataTable {...props} />
    </div>
  );
}

