import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { promptLinkFor } from "./copyPromptLink";

describe("promptLinkFor", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("offers no prompt link when the build names no hosted app", () => {
    vi.stubEnv("VITE_HOSTED_APP_URL", "");
    expect(promptLinkFor("Fix the login flow")).toBeNull();
  });

  it("links through the build's hosted app", () => {
    vi.stubEnv("VITE_HOSTED_APP_URL", "https://preview.example");
    expect(promptLinkFor("Fix the login flow")).toBe(
      "https://preview.example/new?prompt=Fix+the+login+flow",
    );
  });
});
