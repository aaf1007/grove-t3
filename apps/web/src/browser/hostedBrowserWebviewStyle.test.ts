import { describe, expect, it } from "vite-plus/test";

import { resolveHostedBrowserWebviewWrapperStyle } from "./hostedBrowserWebviewStyle";

describe("resolveHostedBrowserWebviewWrapperStyle", () => {
  it("keeps a parked capture guest in the viewport but transparent, so a translucent sidebar cannot show it", () => {
    const style = resolveHostedBrowserWebviewWrapperStyle({
      active: false,
      renderingActive: true,
      rect: null,
      hiddenSize: { width: 800, height: 600 },
    });

    expect(style).toMatchObject({ left: 0, top: 0, zIndex: -1, visibility: "visible", opacity: 0 });
  });

  it("shows an active guest at its panel rect", () => {
    const style = resolveHostedBrowserWebviewWrapperStyle({
      active: true,
      renderingActive: true,
      rect: { x: 10, y: 20, width: 300, height: 200 },
      hiddenSize: { width: 800, height: 600 },
    });

    expect(style.opacity).toBeUndefined();
    expect(style).toMatchObject({ left: 10, top: 20, width: 300, height: 200 });
  });
});
