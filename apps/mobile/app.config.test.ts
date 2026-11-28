import { afterEach, expect, it, vi } from "vite-plus/test";

// Keep config parsing independent of local env files and build credentials. Unset names stay
// absent: app.config.ts copies this into process.env, which would store `undefined` as a string.
vi.mock("../../scripts/lib/public-config.ts", () => ({
  loadRepoEnv: () =>
    Object.fromEntries(
      ["APP_VARIANT", "EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY", "T3CODE_EAS_PROJECT_ID"].flatMap(
        (name) => (process.env[name] === undefined ? [] : [[name, process.env[name]]]),
      ),
    ),
}));

afterEach(() => {
  vi.unstubAllEnvs();
});

async function loadConfig(variant: string | undefined, env: Record<string, string> = {}) {
  vi.resetModules();
  vi.stubEnv("APP_VARIANT", variant);
  vi.stubEnv("EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY", undefined);
  vi.stubEnv("T3CODE_EAS_PROJECT_ID", undefined);
  for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value);
  return (await import("./app.config.ts")).default;
}

it.each(["prod", ""])("rejects APP_VARIANT=%j before selecting production IDs", async (value) => {
  await expect(loadConfig(value)).rejects.toThrow(
    "APP_VARIANT must be development, preview, or production.",
  );
});

it.each([
  [undefined, "dev.buildloopy.app", "loopy"],
  ["development", "dev.buildloopy.app.dev", "loopy-dev"],
  ["preview", "dev.buildloopy.app.preview", "loopy-preview"],
  ["production", "dev.buildloopy.app", "loopy"],
])("uses Loopy's own identifiers for APP_VARIANT=%j", async (value, identifier, scheme) => {
  const config = await loadConfig(value);
  expect(config.ios?.bundleIdentifier).toBe(identifier);
  expect(config.android?.package).toBe(identifier);
  expect(config.scheme).toBe(scheme);
});

it("leaves out T3's Expo project, Apple team and domains until Loopy configures its own", async () => {
  const config = await loadConfig("production");
  expect(config.owner).toBeUndefined();
  expect(config.extra?.eas?.projectId).toBeUndefined();
  expect(config.updates?.enabled).toBe(false);
  expect(config.updates?.url).toBeUndefined();
  expect(config.ios?.appleTeamId).toBeUndefined();
  expect(config.ios?.associatedDomains).toBeUndefined();
  expect(config.android?.intentFilters).toBeUndefined();
});

it("serves updates from the configured Expo project", async () => {
  const config = await loadConfig("production", { T3CODE_EAS_PROJECT_ID: "project-1" });
  expect(config.extra?.eas?.projectId).toBe("project-1");
  expect(config.updates).toMatchObject({ enabled: true, url: "https://u.expo.dev/project-1" });
});

it("associates the Clerk Frontend API host encoded in the publishable key", async () => {
  const key = `pk_live_${Buffer.from("clerk.loopy.example$").toString("base64")}`;
  const config = await loadConfig("production", { EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: key });
  expect(config.ios?.associatedDomains).toEqual([
    "applinks:clerk.loopy.example",
    "webcredentials:clerk.loopy.example",
  ]);
});
