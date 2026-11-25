import { describe, expect, it } from "vite-plus/test";

import { worktreeDeleteWarning } from "./worktreeDeleteWarning";

const status = (paths: ReadonlyArray<string>, hasWorkingTreeChanges = paths.length > 0) => ({
  hasWorkingTreeChanges,
  workingTree: {
    files: paths.map((path) => ({ path, insertions: 1, deletions: 0 })),
    insertions: paths.length,
    deletions: 0,
  },
});

describe("worktreeDeleteWarning", () => {
  it("says nothing about a clean worktree", () => {
    expect(worktreeDeleteWarning(status([]))).toBeNull();
  });

  it("lists the uncommitted files that deleting would lose", () => {
    expect(worktreeDeleteWarning(status(["src/app.ts"]))).toBe(
      "It has uncommitted changes in 1 file. Deleting the worktree loses them:\n  src/app.ts",
    );
    expect(worktreeDeleteWarning(status(["a.ts", "b.ts"]))).toBe(
      "It has uncommitted changes in 2 files. Deleting the worktree loses them:\n  a.ts\n  b.ts",
    );
  });

  it("lists five files and counts the rest", () => {
    const warning = worktreeDeleteWarning(status(["1", "2", "3", "4", "5", "6", "7"]));
    expect(warning?.split("\n")).toEqual([
      "It has uncommitted changes in 7 files. Deleting the worktree loses them:",
      "  1",
      "  2",
      "  3",
      "  4",
      "  5",
      "  and 2 more",
    ]);
  });

  it("warns when Git reports changes it could not list", () => {
    expect(worktreeDeleteWarning(status([], true))).toBe(
      "It has uncommitted changes. Deleting the worktree loses them.",
    );
  });

  it("treats a failed check as possibly holding work", () => {
    expect(worktreeDeleteWarning(null)).toBe(
      "T3 Code couldn't check this worktree for uncommitted changes. Deleting it may lose work.",
    );
  });
});
