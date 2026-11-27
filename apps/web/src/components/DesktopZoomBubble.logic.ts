export const ZOOM_BUBBLE_VISIBLE_MS = 1500;

export interface ZoomBubbleState {
  readonly zoomFactor: number;
  readonly visible: boolean;
}

export function createZoomBubbleStore(input: {
  readonly readZoomFactor: () => number;
  readonly subscribeToResize: (onResize: () => void) => () => void;
}) {
  let state: ZoomBubbleState = { zoomFactor: 1, visible: false };
  let hideTimer: ReturnType<typeof setTimeout> | undefined;
  let unsubscribeResize: (() => void) | undefined;
  const listeners = new Set<() => void>();

  const set = (next: ZoomBubbleState) => {
    state = next;
    for (const listener of listeners) listener();
  };

  const onResize = () => {
    const zoomFactor = input.readZoomFactor();
    // App zoom fires resize, but so does resizing the window; only a zoom change shows the bubble.
    if (Math.abs(zoomFactor - state.zoomFactor) < 0.001) return;
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => set({ ...state, visible: false }), ZOOM_BUBBLE_VISIBLE_MS);
    set({ zoomFactor, visible: true });
  };

  return {
    getSnapshot: () => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      if (listeners.size === 1) {
        // A zoom restored at launch is the baseline, not a change to announce.
        state = { zoomFactor: input.readZoomFactor(), visible: false };
        unsubscribeResize = input.subscribeToResize(onResize);
      }
      return () => {
        listeners.delete(listener);
        if (listeners.size > 0) return;
        unsubscribeResize?.();
        clearTimeout(hideTimer);
      };
    },
  };
}
