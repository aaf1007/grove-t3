import type { VcsStatusLocalResult } from "@t3tools/contracts";
import { msg } from "gt-react";

import { m } from "./i18n/messages";

const LISTED_FILES = 5;

type WorktreeStatus = Pick<VcsStatusLocalResult, "hasWorkingTreeChanges" | "workingTree">;

/**
 * What the delete confirm says about work that removing the worktree would lose, or null when
 * there is none. Removal keeps the branch, so only uncommitted files are at risk. A failed check
 * (`null` status) warns too, since the worktree may hold work.
 */
export function worktreeDeleteWarning(status: WorktreeStatus | null): string | null {
  if (status === null) {
    return m(
      msg(
        "T3 Code couldn't check this worktree for uncommitted changes. Deleting it may lose work.",
      ),
    );
  }
  if (!status.hasWorkingTreeChanges) return null;
  const files = status.workingTree.files;
  if (files.length === 0) {
    return m(msg("It has uncommitted changes. Deleting the worktree loses them."));
  }
  const hidden = files.length - LISTED_FILES;
  return [
    m(
      msg(
        "{count, plural, one {It has uncommitted changes in {count} file. Deleting the worktree loses them:} other {It has uncommitted changes in {count} files. Deleting the worktree loses them:}}",
        { count: files.length },
      ),
    ),
    ...files.slice(0, LISTED_FILES).map((file) => `  ${file.path}`),
    ...(hidden > 0 ? [`  ${m(msg("and {count} more", { count: hidden }))}`] : []),
  ].join("\n");
}
