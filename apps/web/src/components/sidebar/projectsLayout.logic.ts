import { scopedThreadKey, scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import type { ThreadId } from "@t3tools/contracts";

import {
  resolveSidebarRowStatus,
  resolveSidebarThreadStatus,
  type SidebarSection,
  type SidebarThreadStatus,
} from "../Sidebar.logic";

/** The one status mark a Projects layout row shows; anything else shows its age. */
export type ProjectsLayoutDot = "attention" | "failed" | "unread" | "working";

export function projectsLayoutDot(input: {
  readonly status: SidebarThreadStatus;
  readonly isUnread: boolean;
  readonly isWoke: boolean;
}): ProjectsLayoutDot | null {
  switch (input.status) {
    case "approval":
    case "input":
    case "request":
    case "limited":
      return "attention";
    case "failed":
      return "failed";
    case "working":
    case "preparing":
    case "waiting":
      return "working";
    case "ready":
      return input.isWoke ? "attention" : input.isUnread ? "unread" : null;
  }
}

/** How many threads wait on the user: a question, an approval or a failure. */
export function countThreadsNeedingYou(
  threads: ReadonlyArray<Parameters<typeof resolveSidebarRowStatus>[0]>,
): number {
  let count = 0;
  for (const thread of threads) {
    const dot = projectsLayoutDot({
      status: resolveSidebarRowStatus(thread),
      isUnread: false,
      isWoke: false,
    });
    if (dot === "attention" || dot === "failed") count += 1;
  }
  return count;
}

export interface SubagentSummary {
  readonly needsYou: number;
  readonly working: number;
  readonly failed: number;
  readonly done: number;
  /** The subagent a click opens: the first that needs you, else the first still working. */
  readonly openThreadId: ThreadId;
}

/**
 * Subagent counts per parent thread key, for parents with a subagent still running or
 * waiting on the user. A subagent's questions go to its coordinator, so only approvals
 * and guest requests count as needing you.
 */
export function summarizeSubagentsByParent(
  threads: ReadonlyArray<EnvironmentThreadShell>,
): ReadonlyMap<string, SubagentSummary> {
  const byParent = new Map<
    string,
    { needsYou: ThreadId[]; working: ThreadId[]; failed: number; done: number }
  >();
  for (const thread of threads) {
    const parentId = thread.lineage.parentThreadId;
    if (
      parentId === null ||
      thread.lineage.relationshipToParent !== "subagent" ||
      thread.archivedAt !== null
    ) {
      continue;
    }
    const key = scopedThreadKey(scopeThreadRef(thread.environmentId, parentId));
    let entry = byParent.get(key);
    if (entry === undefined) {
      entry = { needsYou: [], working: [], failed: 0, done: 0 };
      byParent.set(key, entry);
    }
    switch (resolveSidebarThreadStatus(thread)) {
      case "approval":
      case "request":
        entry.needsYou.push(thread.id);
        break;
      case "input":
      case "working":
      case "preparing":
      case "waiting":
        entry.working.push(thread.id);
        break;
      case "failed":
      case "limited":
        entry.failed += 1;
        break;
      case "ready":
        entry.done += 1;
        break;
    }
  }
  const summaries = new Map<string, SubagentSummary>();
  for (const [key, entry] of byParent) {
    const openThreadId = entry.needsYou[0] ?? entry.working[0];
    if (openThreadId === undefined) continue;
    summaries.set(key, {
      needsYou: entry.needsYou.length,
      working: entry.working.length,
      failed: entry.failed,
      done: entry.done,
      openThreadId,
    });
  }
  return summaries;
}

/** The machine a project lives on, named only when none of its copies are on this one. */
export function remoteOnlyMachineLabel(group: {
  readonly environmentPresence: "local-only" | "remote-only" | "mixed";
  readonly remoteEnvironmentLabels: ReadonlyArray<string>;
}): string | null {
  if (group.environmentPresence !== "remote-only") return null;
  const labels = [...new Set(group.remoteEnvironmentLabels)];
  return labels.length === 0 ? null : labels.join(", ");
}

/**
 * Project order in the Projects layout: open projects in their sidebar order, then archived
 * projects that still have active threads, then threads with no project.
 */
export function orderProjectsLayoutGroups<
  TGroup extends { readonly archived: boolean; readonly isScratch?: boolean | undefined },
>(open: readonly TGroup[], archived: readonly TGroup[]): TGroup[] {
  return [
    ...open.filter((group) => group.isScratch !== true),
    ...archived.filter((group) => group.isScratch !== true),
    ...open.filter((group) => group.isScratch === true),
    ...archived.filter((group) => group.isScratch === true),
  ];
}

/**
 * Whether a project with no active threads still gets a folder: one the user filtered to, a
 * pinned one, or an open one with no threads at all, so a newly added project shows right away.
 */
export function keepsEmptyProjectFolder(
  group: {
    readonly archived: boolean;
    readonly pinned: boolean;
    readonly isScratch?: boolean | undefined;
    readonly memberProjectRefs: ReadonlyArray<{
      readonly environmentId: string;
      readonly projectId: string;
    }>;
  },
  input: { readonly filtered: boolean; readonly projectRefsWithThreads: ReadonlySet<string> },
): boolean {
  if (input.filtered) return true;
  if (group.archived) return false;
  if (group.pinned) return true;
  return (
    group.isScratch !== true &&
    !group.memberProjectRefs.some((ref) =>
      input.projectRefsWithThreads.has(`${ref.environmentId}:${ref.projectId}`),
    )
  );
}

/** `order` with `dragged` moved to `index` of the result. */
export function moveProjectKey(
  order: readonly string[],
  dragged: string,
  index: number,
): readonly string[] {
  const from = order.indexOf(dragged);
  if (from === -1) return order;
  const rest = order.filter((key) => key !== dragged);
  const to = Math.max(0, Math.min(index, rest.length));
  if (to === from) return order;
  return [...rest.slice(0, to), dragged, ...rest.slice(to)];
}

/**
 * The project a dropped project lands beside, in the terms `reorderProjects` takes: moving
 * down it goes after its target, moving up before it.
 */
export function projectDropTarget(
  before: readonly string[],
  after: readonly string[],
  dragged: string,
): string | null {
  const from = before.indexOf(dragged);
  const to = after.indexOf(dragged);
  if (from === -1 || to === -1 || from === to) return null;
  return (to > from ? after[to - 1] : after[to + 1]) ?? null;
}

export type ProjectsLayoutItem =
  | {
      readonly kind: "thread";
      readonly id: string;
      readonly section: SidebarSection;
      /** The project group the thread belongs to; it can only be dropped back into that one. */
      readonly projectKey: string | null;
    }
  | {
      readonly kind: "marker";
      readonly id: string;
      readonly marker: "projects" | "snoozed" | "settled";
    }
  | {
      readonly kind: "marker";
      readonly id: string;
      readonly marker: "project";
      readonly projectKey: string;
      /** Every thread of a closed project, in order; a drop into it lands at its top. */
      readonly closedKeys: readonly string[] | null;
    };

export type ProjectsLayoutDrop =
  | { readonly section: "pinned"; readonly order: readonly string[] }
  | { readonly section: "active"; readonly projectKey: string; readonly order: readonly string[] }
  | { readonly section: "settled" };

export function projectsLayoutMarkerId(name: string) {
  return `projects-layout:${name}`;
}

/**
 * Where a thread dragged onto `overId` lands. Above the Projects heading is Pinned; inside a
 * project it reorders that project's threads only, so another project is no target. The
 * order covers the thread's section or project alone.
 */
export function resolveProjectsLayoutDrop(
  items: readonly ProjectsLayoutItem[],
  activeId: string,
  overId: string,
): ProjectsLayoutDrop | null {
  const from = items.findIndex((item) => item.id === activeId);
  const to = items.findIndex((item) => item.id === overId);
  const active = items[from];
  if (active?.kind !== "thread" || to === -1) return null;
  const moved = items.filter((_, index) => index !== from);
  moved.splice(to, 0, active);
  let start = 0;
  let owner: ProjectsLayoutItem | undefined;
  for (let index = to - 1; index >= 0; index -= 1) {
    if (moved[index]!.kind === "marker") {
      owner = moved[index];
      start = index + 1;
      break;
    }
  }
  const run = () => {
    const keys: string[] = [];
    for (const item of moved.slice(start)) {
      if (item.kind === "marker") break;
      keys.push(item.id);
    }
    return keys;
  };
  if (owner === undefined) return { section: "pinned", order: run() };
  if (owner.kind !== "marker") return null;
  switch (owner.marker) {
    case "project":
      if (owner.projectKey !== active.projectKey) return null;
      return {
        section: "active",
        projectKey: owner.projectKey,
        order:
          owner.closedKeys === null
            ? run()
            : [activeId, ...owner.closedKeys.filter((key) => key !== activeId)],
      };
    case "settled":
      return { section: "settled" };
    default:
      return null;
  }
}
