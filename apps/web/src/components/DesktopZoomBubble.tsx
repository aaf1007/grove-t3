import { useLocale } from "gt-react";
import { useSyncExternalStore } from "react";

import { cn } from "~/lib/utils";
import { createZoomBubbleStore } from "./DesktopZoomBubble.logic";

const zoomBubbleStore = createZoomBubbleStore({
  readZoomFactor: () => window.desktopBridge?.getWindowZoomFactor() ?? 1,
  subscribeToResize: (onResize) => {
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  },
});

export function DesktopZoomBubble() {
  const locale = useLocale();
  const { zoomFactor, visible } = useSyncExternalStore(
    zoomBubbleStore.subscribe,
    zoomBubbleStore.getSnapshot,
  );
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "dropdown-glass pointer-events-none fixed top-[calc(var(--workspace-topbar-height)+0.5rem)] left-1/2 z-50 -translate-x-1/2 rounded-full px-3.5 py-1.5 text-sm font-medium tabular-nums text-popover-foreground shadow-lg shadow-black/20 transition-[opacity,visibility] duration-200",
        visible ? "visible opacity-100" : "invisible opacity-0",
      )}
    >
      {new Intl.NumberFormat(locale, { style: "percent" }).format(zoomFactor)}
    </div>
  );
}
