import { describe, expect, it } from "vite-plus/test";
import { resumeWorkspaceTour, WORKSPACE_TOUR_STEPS } from "./workspaceTour.logic";

describe("workspace tour", () => {
  it("keeps workspace basics ahead of composer, panels, and discovery", () => {
    expect(WORKSPACE_TOUR_STEPS.map(({ id }) => id)).toEqual([
      "projects",
      "add-project",
      "new-thread",
      "model",
      "permissions",
      "status",
      "attention",
      "panels",
      "palette",
      "settings",
    ]);
  });

  it("resumes a saved step or advances past unavailable controls", () => {
    const empty = ["projects", "add-project", "palette", "settings"] as const;
    expect(resumeWorkspaceTour("add-project", empty)).toBe("add-project");
    expect(resumeWorkspaceTour("permissions", empty)).toBe("palette");
    expect(resumeWorkspaceTour("settings", ["palette"])).toBeUndefined();
    expect(resumeWorkspaceTour("older-step-id", empty)).toBe("projects");
  });
});
