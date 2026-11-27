import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { createZoomBubbleStore, ZOOM_BUBBLE_VISIBLE_MS } from "./DesktopZoomBubble.logic";

describe("createZoomBubbleStore", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function setup(initialZoom: number) {
    let zoomFactor = initialZoom;
    let fireResize = () => {};
    const unsubscribeResize = vi.fn();
    const store = createZoomBubbleStore({
      readZoomFactor: () => zoomFactor,
      subscribeToResize: (onResize) => {
        fireResize = onResize;
        return unsubscribeResize;
      },
    });
    const unsubscribe = store.subscribe(() => {});
    const zoomTo = (next: number) => {
      zoomFactor = next;
      fireResize();
    };
    return { store, zoomTo, unsubscribe, unsubscribeResize };
  }

  it("shows each zoom change, keeps it up while zooming, then hides", () => {
    const { store, zoomTo } = setup(1.1);
    expect(store.getSnapshot()).toEqual({ zoomFactor: 1.1, visible: false });

    zoomTo(1.2);
    expect(store.getSnapshot()).toEqual({ zoomFactor: 1.2, visible: true });

    vi.advanceTimersByTime(ZOOM_BUBBLE_VISIBLE_MS - 1);
    zoomTo(1.3);
    vi.advanceTimersByTime(ZOOM_BUBBLE_VISIBLE_MS - 1);
    expect(store.getSnapshot()).toEqual({ zoomFactor: 1.3, visible: true });

    vi.advanceTimersByTime(1);
    expect(store.getSnapshot()).toEqual({ zoomFactor: 1.3, visible: false });
  });

  it("ignores window resizes that keep the zoom", () => {
    const { store, zoomTo } = setup(1);
    zoomTo(1);
    expect(store.getSnapshot().visible).toBe(false);
  });

  it("stops listening when the last subscriber leaves", () => {
    const { unsubscribe, unsubscribeResize } = setup(1);
    unsubscribe();
    expect(unsubscribeResize).toHaveBeenCalledOnce();
  });
});
