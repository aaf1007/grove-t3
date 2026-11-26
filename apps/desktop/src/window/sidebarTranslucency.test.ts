import { assert, describe, it } from "@effect/vitest";

import { supportsSidebarTranslucency } from "./sidebarTranslucency.ts";

describe("supportsSidebarTranslucency", () => {
  it("needs Windows 11 22H2 for acrylic", () => {
    assert.isTrue(supportsSidebarTranslucency("win32", "10.0.22621"));
    assert.isTrue(supportsSidebarTranslucency("win32", "10.0.26100"));
    assert.isFalse(supportsSidebarTranslucency("win32", "10.0.22000"));
    assert.isFalse(supportsSidebarTranslucency("win32", "10.0.19045"));
  });

  it("allows macOS and nothing else", () => {
    assert.isTrue(supportsSidebarTranslucency("darwin", "15.1.0"));
    assert.isFalse(supportsSidebarTranslucency("linux", "6.8.0"));
  });
});
