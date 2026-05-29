import { useEffect, useRef } from "react";

/**
 * On Android (Capacitor), hardware back button fires browser popstate.
 * When a dialog/sheet is open, intercept that popstate to close the dialog
 * instead of navigating away or exiting the app.
 */
export function useAndroidBack(isOpen: boolean, onClose: () => void) {
  const pushed = useRef(false);

  useEffect(() => {
    if (isOpen) {
      history.pushState({ androidBack: true }, "");
      pushed.current = true;
    } else {
      if (pushed.current) {
        pushed.current = false;
      }
    }
  }, [isOpen]);

  useEffect(() => {
    function handlePop() {
      if (pushed.current) {
        pushed.current = false;
        onClose();
      }
    }
    window.addEventListener("popstate", handlePop);
    return () => window.removeEventListener("popstate", handlePop);
  }, [onClose]);
}
