/**
 * Client-side utilities for detecting and handling iframe vs top-level
 */

import { useEffect } from "react";

/**
 * Hook to detect if page is in iframe and force exit
 * Use this in routes that must be top-level
 */
export function useTopLevelRedirect() {
  useEffect(() => {
    // Check if we're in an iframe
    if (window.top && window.top !== window.self) {
      try {
        // Try to redirect parent window to current URL (without embedded param)
        const currentUrl = new URL(window.location.href);
        currentUrl.searchParams.delete("embedded");
        
        // Redirect parent window
        window.top.location.href = currentUrl.toString();
      } catch (error) {
        // If blocked (Firefox), try to open in new window
        try {
          const currentUrl = new URL(window.location.href);
          currentUrl.searchParams.delete("embedded");
          window.open(currentUrl.toString(), "_top");
        } catch (e) {
          console.error("Failed to exit iframe:", e);
        }
      }
    }
  }, []);
}

/**
 * Component to force top-level redirect
 * Place this in routes that must be top-level
 */
export function TopLevelRedirect() {
  useTopLevelRedirect();
  return null;
}

