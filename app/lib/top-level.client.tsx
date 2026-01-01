/**
 * Client-side utilities for detecting and handling iframe vs top-level
 */

import { useEffect } from "react";

/**
 * Hook to detect if page is in iframe and force exit
 * Use this in routes that must be top-level
 * 
 * This hook uses window.top.location.href to redirect the parent window
 * to the current URL, effectively breaking out of the iframe.
 */
export function useTopLevelRedirect() {
  useEffect(() => {
    // Check if we're in an iframe
    if (window.top && window.top !== window.self) {
      try {
        // Build URL without embedded parameter
        const currentUrl = new URL(window.location.href);
        currentUrl.searchParams.delete("embedded");
        
        // Redirect parent window to current URL (top-level)
        // This is the standard way to break out of an iframe
        window.top.location.href = currentUrl.toString();
      } catch (error) {
        // If blocked by browser security (Firefox), try alternative methods
        try {
          const currentUrl = new URL(window.location.href);
          currentUrl.searchParams.delete("embedded");
          
          // Try to open in same window (_top) or new window (_blank)
          window.open(currentUrl.toString(), "_top") || 
          window.open(currentUrl.toString(), "_blank");
        } catch (e) {
          console.error("Failed to exit iframe. Please open this page in a new window:", e);
          // Last resort: show message to user
          alert("This page must be opened in a new window. Please click the link below or copy the URL to open it directly.");
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

