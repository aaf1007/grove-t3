import { scopeThreadRef, scopedThreadKey } from "@t3tools/client-runtime/environment";
import { EnvironmentId, ProviderInstanceId, RunId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { nextThreadNeedingYou, type NeedsYouPosition } from "./attentionJump";
import { makeThreadFixture, type ThreadFixtureOverrides } from "./test-fixtures";

const START = Date.parse("2026-03-09T10:00:00.000Z");
const at = (minute: number) => new Date(START + minute * 60_000).toISOString();

function run(status: "completed" | "failed", minute: number) {
  return {
    runId: RunId.make(`run-${minute}`),
    status,
    assistantMessageId: null,
    requestedAt: at(minute),
    startedAt: at(minute),
    completedAt: at(minute),
  };
}

const approval = { hasPendingApprovals: true };
const input = { hasPendingUserInput: true };
const guest = { pendingGuestMessageCount: 1 };
const failed = (minute: number) => ({ latestRun: run("failed", minute) });
const planReady = (minute: number) => ({
  interactionMode: "plan" as const,
  hasActionableProposedPlan: true,
  latestRun: run("completed", minute),
});
const completed = (minute: number) => ({
  latestRun: run("completed", minute),
  lastVisitedAt: at(minute - 1),
});
const working = {
  runtime: {
    status: "running" as const,
    providerName: "Codex",
    providerInstanceId: ProviderInstanceId.make("codex"),
    activeRunId: RunId.make("live"),
    lastError: null,
    updatedAt: at(0),
  },
};

function thread(name: string, minute: number, overrides: ThreadFixtureOverrides = {}) {
  return makeThreadFixture({
    environmentId: EnvironmentId.make("local"),
    id: ThreadId.make(name),
    createdAt: at(minute),
    ...overrides,
  });
}

type Fixture = ReturnType<typeof thread>;
const keyOf = (name: string) =>
  scopedThreadKey(scopeThreadRef(EnvironmentId.make("local"), ThreadId.make(name)));

function jump(
  threads: readonly Fixture[],
  current: string | null,
  lastJump: NeedsYouPosition | null = null,
) {
  return nextThreadNeedingYou({
    threads,
    currentThreadKey: current === null ? null : keyOf(current),
    lastVisitedAt: (candidate) => candidate.lastVisitedAt ?? undefined,
    now: at(60),
    lastJump,
  });
}

function next(threads: readonly Fixture[], current: string | null = null): string | null {
  return jump(threads, current)?.thread.id ?? null;
}

describe("nextThreadNeedingYou", () => {
  const queue = [
    thread("completed", 1, completed(1)),
    thread("plan", 2, planReady(2)),
    thread("failed", 3, failed(3)),
    thread("guest", 4, guest),
    thread("input-asked-later", 4, { ...input, pendingUserInputAt: at(9) }),
    thread("input-asked-earlier", 5, { ...input, pendingUserInputAt: at(6) }),
    thread("approval-newer", 7, approval),
    thread("approval-older", 6, approval),
  ];

  it("visits the most urgent state first, and the longest waiting thread first within it", () => {
    const visited: Array<string | null> = [];
    let current: string | null = null;
    for (const _ of queue) {
      current = next(queue, current);
      visited.push(current);
    }
    expect(visited).toEqual([
      "approval-older",
      "approval-newer",
      "input-asked-earlier",
      "input-asked-later",
      "guest",
      "failed",
      "plan",
      "completed",
    ]);
  });

  it("keeps its place when the thread it opened stops waiting", () => {
    const threads = [
      thread("question", 0, input),
      thread("first", 1, completed(1)),
      thread("second", 2, completed(2)),
    ];
    const toFirst = jump(threads, "question");
    expect(toFirst?.thread.id).toBe("first");
    const firstSeen = threads.map((candidate) =>
      candidate.id === "first" ? { ...candidate, lastVisitedAt: at(30) } : candidate,
    );
    expect(jump(firstSeen, "first", toFirst?.position ?? null)?.thread.id).toBe("second");
  });

  it("wraps from the last waiting thread back to the first", () => {
    expect(next(queue, "completed")).toBe("approval-older");
  });

  it("starts from the top when the open thread is not waiting", () => {
    expect(next([...queue, thread("busy", 0, working)], "busy")).toBe("approval-older");
  });

  it("skips archived, settled, snoozed, subagent, working and already seen threads", () => {
    const threads = [
      thread("archived", 0, { ...approval, archivedAt: at(0) }),
      thread("settled", 0, { ...approval, settledOverride: "settled" }),
      thread("snoozed", 0, { ...completed(1), snoozedAt: at(2), snoozedUntil: at(120) }),
      thread("subagent", 0, {
        ...approval,
        lineage: {
          rootThreadId: ThreadId.make("root"),
          parentThreadId: ThreadId.make("root"),
          relationshipToParent: "subagent",
        },
      }),
      thread("busy", 0, working),
      thread("seen", 0, { latestRun: run("completed", 1), lastVisitedAt: at(2) }),
    ];
    expect(next(threads)).toBeNull();
  });

  it("still counts a snoozed thread that asks for approval", () => {
    const threads = [
      thread("snoozed", 0, { ...approval, snoozedAt: at(0), snoozedUntil: at(120) }),
    ];
    expect(next(threads)).toBe("snoozed");
  });

  it("finds nothing when only the open thread is waiting, or nothing is", () => {
    expect(next([thread("approval", 0, approval)], "approval")).toBeNull();
    expect(next([])).toBeNull();
  });
});
