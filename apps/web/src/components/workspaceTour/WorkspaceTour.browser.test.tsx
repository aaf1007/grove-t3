import type { ClientSettings } from "@t3tools/contracts";
import { useContext } from "react";
import { expect, it, vi } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";
import { render } from "../../../test/render";
import { WorkspaceTour } from "./WorkspaceTour";
import { WorkspaceTourPaletteContext } from "./workspaceTourState";

const state = vi.hoisted(() => ({
  progress: null as ClientSettings["workspaceTour"],
  listeners: new Set<() => void>(),
}));

vi.mock("../../hooks/useSettings", async () => {
  const { useSyncExternalStore } = await import("react");
  return {
    useClientSettings: () =>
      useSyncExternalStore(
        (update) => {
          state.listeners.add(update);
          return () => state.listeners.delete(update);
        },
        () => state.progress,
      ),
    persistClientSettingsPatch: async (patch: {
      workspaceTour: ClientSettings["workspaceTour"];
    }) => {
      state.progress = patch.workspaceTour;
      for (const listener of state.listeners) listener();
    },
  };
});

vi.mock("../../state/server", async (original) => {
  const { Atom } = await import("effect/reactivity");
  return {
    ...(await original<typeof import("../../state/server")>()),
    primaryServerKeybindingsAtom: Atom.make([]),
  };
});

function TourWorkspace() {
  const palette = useContext(WorkspaceTourPaletteContext);
  return (
    <>
      <button type="button" data-tour="projects">
        Project list
      </button>
      <button type="button" data-tour="add-project">
        Add project
      </button>
      <button type="button" data-tour="new-thread" disabled>
        New thread
      </button>
      <button type="button" data-tour="settings">
        Settings
      </button>
      {palette?.card}
    </>
  );
}

it("moves focus, skips hidden anchors and restores the saved step after remount", async () => {
  state.progress = { status: "active", step: "projects" };
  await using screen = await render(
    <WorkspaceTour enabled>
      <TourWorkspace />
    </WorkspaceTour>,
  );
  await expect.element(screen.getByRole("dialog", { name: "Projects and threads" })).toBeVisible();
  await userEvent.keyboard("{ArrowRight}");
  await expect.element(screen.getByRole("dialog", { name: "Add a project" })).toBeVisible();
  await userEvent.keyboard("{Enter}");
  await expect.element(screen.getByRole("heading", { name: "Command palette" })).toBeVisible();
  await userEvent.keyboard("{ArrowLeft}");
  await expect.element(screen.getByRole("dialog", { name: "Add a project" })).toBeVisible();

  await screen.rerender(
    <WorkspaceTour key="after-reload" enabled>
      <TourWorkspace />
    </WorkspaceTour>,
  );
  await expect.element(screen.getByRole("dialog", { name: "Add a project" })).toBeVisible();
  await userEvent.keyboard("{Escape}");
  await expect.element(screen.getByRole("dialog")).not.toBeInTheDocument();
  expect(state.progress).toEqual({ status: "skipped" });
});
