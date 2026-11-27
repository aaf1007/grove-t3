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

  it.each(["stable", "nightly"] as const)(
    "ignores a %s release cached before the download source moved to Loopy",
    async (channel) => {
      const release = (tag: string, url: string) => ({
        tag_name: tag,
        html_url: url,
        published_at: "",
        assets: [],
      });
      const stored = new Map([
        [`t3code-${channel}-release`, JSON.stringify(release("v0.0.1-nightly.1", "upstream"))],
      ]);
      vi.stubGlobal("sessionStorage", {
        getItem: (key: string) => stored.get(key) ?? null,
        setItem: (key: string, value: string) => stored.set(key, value),
      });
      vi.stubGlobal("fetch", async (url: string) => {
        const latest = release("v0.1.12-nightly.1", url);
        return Response.json(channel === "nightly" ? [latest] : latest);
      });

      const latest = await fetchLatestRelease(channel);

      expect(latest.tag_name).toBe("v0.1.12-nightly.1");
      expect(latest.html_url).toContain("aaf1007/loopy");
    },
  );
});
