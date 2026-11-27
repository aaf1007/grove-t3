import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { fetchLatestRelease } from "./releases";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchLatestRelease", () => {
  it("rejects a GitHub API error response instead of returning it as a release", async () => {
    vi.stubGlobal("sessionStorage", { getItem: () => null });
    vi.stubGlobal("fetch", async () =>
      Response.json({ message: "API rate limit exceeded" }, { status: 403 }),
    );

    await expect(fetchLatestRelease("stable")).rejects.toThrow("403");
  });

  it("ignores a release cached before the download source moved to Loopy", async () => {
    const upstream = { tag_name: "v0.0.1", html_url: "", published_at: "", assets: [] };
    const stored = new Map([["t3code-stable-release", JSON.stringify(upstream)]]);
    vi.stubGlobal("sessionStorage", {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => stored.set(key, value),
    });
    vi.stubGlobal("fetch", async (url: string) =>
      Response.json({ ...upstream, tag_name: "v0.1.11", html_url: url, assets: [] }),
    );

    const release = await fetchLatestRelease("stable");

    expect(release.tag_name).toBe("v0.1.11");
    expect(release.html_url).toContain("aaf1007/loopy");
  });
});
