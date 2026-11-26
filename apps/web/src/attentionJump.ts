import { scopeThreadRef, scopedThreadKey } from "@t3tools/client-runtime/environment";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/shell";
import { effectiveSnoozed } from "@t3tools/client-runtime/state/thread-settled";
import { isListedThreadLineage, type ScopedThreadRef } from "@t3tools/contracts";
import { msg } from "gt-react";

import { resolveThreadLastVisitedAt, resolveThreadStatusPill } from "./components/Sidebar.logic";
import { toastManager } from "./components/ui/toast";
import { m } from "./i18n/messages";
import { appAtomRegistry } from "./rpc/atomRegistry";
import { environmentThreadShells } from "./state/threads";
import { useUiStateStore } from "./uiStateStore";

// Sidebar status labels that wait on the user, most urgent first.
const NEEDS_YOU: readonly string[] = [
  msg("Pending Approval"),
  msg("Awaiting Input"),
  msg("Guest Request"),
  msg("Failed"),
  msg("Plan Ready"),
  msg("Completed"),
];

export interface NeedsYouPosition {
  readonly key: string;
  readonly rank: number;
  readonly since: number;
}

const threadKey = (thread: Pick<EnvironmentThreadShell, "environmentId" | "id">) =>
  scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id));

const timestamp = (value: string | null | undefined) => {
  const parsed = Date.parse(value ?? "");
  return Number.isNaN(parsed) ? 0 : parsed;
};

const comparePositions = (left: NeedsYouPosition, right: NeedsYouPosition) =>
  left.rank - right.rank || left.since - right.since || left.key.localeCompare(right.key);

/**
 * The waiting thread after the open one: most urgent state first, longest waiting first within
 * it. Opening a finished thread marks it seen, so `lastJump` holds the place it had in line.
 */
export function nextThreadNeedingYou<T extends EnvironmentThreadShell>(input: {
  readonly threads: readonly T[];
  readonly currentThreadKey: string | null;
  readonly lastVisitedAt: (thread: T) => string | undefined;
  readonly now: string;
  readonly lastJump: NeedsYouPosition | null;
}): { readonly thread: T; readonly position: NeedsYouPosition } | null {
  const queue: Array<{ readonly thread: T; readonly position: NeedsYouPosition }> = [];
  for (const thread of input.threads) {
    if (thread.archivedAt !== null || !isListedThreadLineage(thread.lineage)) continue;
    if (thread.settledOverride === "settled" || effectiveSnoozed(thread, { now: input.now })) {
      continue;
    }
    const pill = resolveThreadStatusPill({
      thread: { ...thread, lastVisitedAt: input.lastVisitedAt(thread) },
    });
    const rank = pill === null ? -1 : NEEDS_YOU.indexOf(pill.label);
    if (rank === -1) continue;
    const run = thread.latestRun;
    const since = Math.max(
      timestamp(thread.createdAt),
      timestamp(thread.unsettledAt),
      timestamp(run?.requestedAt),
      timestamp(run?.completedAt),
      timestamp(thread.pendingUserInputAt),
    );
    queue.push({ thread, position: { key: threadKey(thread), rank, since } });
  }
  queue.sort((left, right) => comparePositions(left.position, right.position));
  const from =
    queue.find((entry) => entry.position.key === input.currentThreadKey)?.position ??
    (input.lastJump?.key === input.currentThreadKey ? input.lastJump : null);
  if (from === null) return queue[0] ?? null;
  const others = queue.filter((entry) => entry.position.key !== from.key);
  return others.find((entry) => comparePositions(entry.position, from) > 0) ?? others[0] ?? null;
}

let lastJump: NeedsYouPosition | null = null;

export function jumpToThreadNeedingYou(input: {
  readonly currentThreadKey: string | null;
  readonly navigateToThread: (threadRef: ScopedThreadRef) => unknown;
}): void {
  const localVisits = useUiStateStore.getState().threadLastVisitedAtById;
  const next = nextThreadNeedingYou({
    threads: appAtomRegistry.get(environmentThreadShells.quietThreadShellsAtom),
    currentThreadKey: input.currentThreadKey,
    lastVisitedAt: (thread) =>
      resolveThreadLastVisitedAt(thread.lastVisitedAt, localVisits[threadKey(thread)]),
    now: new Date().toISOString(),
    lastJump,
  });
  if (next === null) {
    toastManager.add({ type: "info", title: m(msg("Nothing else needs you right now")) });
    return;
  }
  lastJump = next.position;
  void input.navigateToThread(scopeThreadRef(next.thread.environmentId, next.thread.id));
}
