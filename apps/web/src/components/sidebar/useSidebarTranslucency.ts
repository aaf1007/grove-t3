import { useEffect } from "react";

import { useClientSettings } from "../../hooks/useSettings";

/** The desktop app offers the bridge call only where the OS can draw the material. */
export function canUseTranslucentSidebar() {
  return typeof window !== "undefined" && window.desktopBridge?.setSidebarTranslucent !== undefined;
}

/**
 * Turns the desktop window's OS material on or off, then clears the page behind the sidebar
 * (`data-sidebar-translucent` in index.css) once the material is there to show through.
 */
export function useSidebarTranslucency() {
  const enabled = useClientSettings((settings) => settings.sidebarTranslucent);
  const translucent = enabled && canUseTranslucentSidebar();

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- the window material lives in the desktop main process
  useEffect(() => {
    const root = document.documentElement;
    if (!translucent) delete root.dataset.sidebarTranslucent;
    const setSidebarTranslucent = window.desktopBridge?.setSidebarTranslucent;
    if (setSidebarTranslucent === undefined) return;
    let cancelled = false;
    setSidebarTranslucent(translucent).then(
      () => {
        if (translucent && !cancelled) root.dataset.sidebarTranslucent = "true";
      },
      (cause: unknown) => console.error("Could not change the sidebar's translucency.", cause),
    );
    return () => {
      cancelled = true;
    };
  }, [translucent]);
}
