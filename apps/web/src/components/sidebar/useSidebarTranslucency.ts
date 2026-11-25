import { useEffect } from "react";

import { isElectron } from "../../env";
import { useClientSettings } from "../../hooks/useSettings";
import { isMacPlatform, isWindowsPlatform } from "../../lib/utils";

/** Only the desktop app on macOS and Windows can draw a translucent window background. */
export function canUseTranslucentSidebar() {
  return isElectron && (isMacPlatform(navigator.platform) || isWindowsPlatform(navigator.platform));
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
    const bridge = window.desktopBridge;
    if (!canUseTranslucentSidebar() || typeof bridge?.setSidebarTranslucent !== "function") return;
    let cancelled = false;
    bridge.setSidebarTranslucent(translucent).then(
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
