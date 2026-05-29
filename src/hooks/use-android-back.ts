import { useEffect, useRef } from "react";

/**
 * Intercepts Android hardware back button when a sheet/dialog is open.
 * Strategy:
 *   1. When open: push a #sheet hash to browser history so WebView canGoBack() = true
 *   2. Listen for popstate (fires when WebView.goBack() is called by Capacitor)
 *   3. Also listen for Capacitor's document 'backButton' event (fired before webView.goBack)
 */
export function useAndroidBack(isOpen: boolean, onClose: () => void) {
  const pushed = useRef(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (isOpen && !pushed.current) {
      const base = window.location.pathname + window.location.search;
      history.pushState({ androidSheet: true }, "", base + "#sheet");
      pushed.current = true;
    }

    if (!isOpen && pushed.current) {
      pushed.current = false;
      // Sheet was closed by UI (not back btn) — remove the orphan hash entry
      if (window.location.hash === "#sheet") {
        history.back();
      }
    }
  }, [isOpen]);

  useEffect(() => {
    function close() {
      if (!pushed.current) return;
      pushed.current = false;
      // Remove hash from URL cleanly
      const base = window.location.pathname + window.location.search;
      history.replaceState(null, "", base);
      onCloseRef.current();
    }

    // Standard browser / Capacitor popstate (fires when webView.goBack() is called)
    function onPopState() {
      if (pushed.current) close();
    }

    // Capacitor fires this document event BEFORE calling webView.goBack()
    // Prevents the app from exiting when we want to close the sheet instead
    function onCapacitorBack(e: Event) {
      if (!pushed.current) return;
      e.stopImmediatePropagation();
      close();
    }

    window.addEventListener("popstate", onPopState);
    document.addEventListener("backButton", onCapacitorBack, true);
    return () => {
      window.removeEventListener("popstate", onPopState);
      document.removeEventListener("backButton", onCapacitorBack, true);
    };
  }, []); // stable — uses ref for onClose
}
