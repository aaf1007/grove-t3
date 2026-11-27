import { createMemoryHistory } from "@tanstack/react-router";
import { ProviderInstanceId } from "@t3tools/contracts";
import { DEFAULT_CLIENT_SETTINGS } from "@t3tools/contracts/settings";
import type * as Context from "effect/Context";
import { expect, it, vi } from "vite-plus/test";
import { page } from "vite-plus/test/browser";

import { AppRoot } from "~/AppRoot";
// The thread route loads ChatView lazily; its first transform would eat the test's timeout.
import "~/components/ChatView";
import { __setClientSettingsForTests } from "~/hooks/useSettings";
import { getRouter } from "~/router";
import {
  ENVIRONMENT_ID,
  installFakeEnvironment,
  threadWithHistory,
  type FakeDriver,
} from "../../../test/fakeEnvironment";
import { render } from "../../../test/render";

// The socket is the only fake layer; see test/appScenarios.renders.tsx.
vi.mock(
  "../../../../../packages/client-runtime/src/connection/driver.ts",
  async (importOriginal) => {
    const [actual, { fakeDriver }, Layer] = await Promise.all([
      importOriginal<{ readonly ConnectionDriver: Context.Key<unknown, FakeDriver> }>(),
      import("../../../test/fakeEnvironment"),
      import("effect/Layer"),
    ]);
    return { ...actual, layer: Layer.succeed(actual.ConnectionDriver, fakeDriver) };
  },
);

vi.mock(import("~/rpc/requestLatencyState"), async (original) => ({
  ...(await original()),
  trackRpcRequestSent: () => {},
}));

it("shows each folder row's provider icon, keeping the slot for an unknown provider", async () => {
  const known = threadWithHistory("on-codex", 1);
  const unknown = threadWithHistory("on-removed-provider", 1, {
    instanceId: ProviderInstanceId.make("removed"),
    model: "gone",
  });
  using _environment = installFakeEnvironment([known, unknown]);
  __setClientSettingsForTests({
    ...DEFAULT_CLIENT_SETTINGS,
    boringSidebarEnabled: true,
    onboardingCompletedAt: "2026-01-01T00:00:00.000Z",
  });
  const router = getRouter(
    createMemoryHistory({ initialEntries: [`/${ENVIRONMENT_ID}/${known.id}`] }),
  );
  await router.load();
  await using _app = await render(<AppRoot router={router} />, { router: false });
  const providerSlot = (title: string) =>
    page
      .getByTestId("sidebar-row-folder")
      .filter({ hasText: title })
      .getByTestId("sidebar-row-provider");
  await expect.element(providerSlot(known.title)).toBeInTheDocument();
  await vi.waitFor(() => {
    expect(providerSlot(known.title).element().querySelector("svg")).not.toBeNull();
  });
  await expect.element(providerSlot(unknown.title)).toBeEmptyDOMElement();
});
