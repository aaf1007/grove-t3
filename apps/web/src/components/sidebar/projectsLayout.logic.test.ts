import { scopedThreadKey, scopeThreadRef } from "@t3tools/client-runtime/environment";
import { EnvironmentId, ProviderInstanceId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { makeThreadFixture, type ThreadFixtureOverrides } from "../../test-fixtures";
import {
  countThreadsNeedingYou,
  moveProjectKey,
  orderProjectsLayoutGroups,
  projectDropTarget,
  projectsLayoutDot,
  remoteOnlyMachineLabel,
  resolveProjectsLayoutDrop,
  summarizeSubagentsByParent,
  type ProjectsLayoutItem,
} from "./projectsLayout.logic";

const environmentId = EnvironmentId.make("environment-local");
const parentId = ThreadId.make("parent");

function runtime(status: "running" | "failed") {
  return {
    status,
    activeRunId: null,
    providerInstanceId: ProviderInstanceId.make("codex"),
    providerName: "Codex",
    lastError: null,
    updatedAt: "2026-03-09T10:00:00.000Z",
  } as const;
}

function thread(id: string, overrides: ThreadFixtureOverrides = {}) {
  return makeThreadFixture({ id: ThreadId.make(id), environmentId, runtime: null, ...overrides });
}

function subagent(id: string, overrides: ThreadFixtureOverrides = {}) {
  return thread(id, {
    lineage: { rootThreadId: parentId, parentThreadId: parentId, relationshipToParent: "subagent" },
    ...overrides,
  });
}

describe("projectsLayoutDot", () => {
  it.each([
    ["approval", false, false, "attention"],
    ["input", false, false, "attention"],
    ["limited", false, false, "attention"],
    ["failed", false, false, "failed"],
    ["working", false, false, "working"],
    ["waiting", false, false, "working"],
    ["ready", false, true, "attention"],
    ["ready", true, false, "unread"],
    ["ready", false, false, null],
  ] as const)("shows %s (unread %s, woke %s) as %s", (status, isUnread, isWoke, dot) => {
    expect(projectsLayoutDot({ status, isUnread, isWoke })).toBe(dot);
  });
});

describe("countThreadsNeedingYou", () => {
  it("counts questions, approvals and failures, not work or finished threads", () => {
    expect(
      countThreadsNeedingYou([
        thread("approval", { hasPendingApprovals: true }),
        thread("failed", { runtime: runtime("failed") }),
        thread("working", { runtime: runtime("running") }),
        thread("done"),
      ]),
    ).toBe(2);
  });
});

describe("summarizeSubagentsByParent", () => {
  const key = scopedThreadKey(scopeThreadRef(environmentId, parentId));

  it("counts a parent's subagents and opens the one that needs you first", () => {
    const summaries = summarizeSubagentsByParent([
      subagent("working", { runtime: runtime("running") }),
      subagent("approval", { hasPendingApprovals: true }),
      subagent("failed", { runtime: runtime("failed") }),
      subagent("done"),
      thread("unrelated", { runtime: runtime("running") }),
    ]);
    expect([...summaries.keys()]).toEqual([key]);
    expect(summaries.get(key)).toEqual({
      needsYou: 1,
      working: 1,
      failed: 1,
      done: 1,
      openThreadId: ThreadId.make("approval"),
    });
  });

  it("drops a parent once no subagent is running or waiting on you", () => {
    expect(
      summarizeSubagentsByParent([
        subagent("done"),
        subagent("failed", { runtime: runtime("failed") }),
        subagent("archived", {
          runtime: runtime("running"),
          archivedAt: "2026-03-09T10:00:00.000Z",
        }),
      ]).size,
    ).toBe(0);
  });
});

describe("remoteOnlyMachineLabel", () => {
  it("names the machines only when no copy of the project is local", () => {
    const labels = ["Studio", "Studio", "VPS"];
    expect(
      remoteOnlyMachineLabel({
        environmentPresence: "remote-only",
        remoteEnvironmentLabels: labels,
      }),
    ).toBe("Studio, VPS");
    expect(
      remoteOnlyMachineLabel({ environmentPresence: "mixed", remoteEnvironmentLabels: labels }),
    ).toBeNull();
  });
});

describe("orderProjectsLayoutGroups", () => {
  it("puts open projects first, then archived ones, then threads with no project", () => {
    const group = (name: string, archived: boolean, isScratch = false) => ({
      name,
      archived,
      isScratch,
    });
    const ordered = orderProjectsLayoutGroups(
      [group("scratch", false, true), group("web", false), group("api", false)],
      [group("old", true)],
    );
    expect(ordered.map((entry) => entry.name)).toEqual(["web", "api", "old", "scratch"]);
  });
});

describe("project reordering", () => {
  const order = ["a", "b", "c", "d"];

  it("moves a project to an index of the result", () => {
    expect(moveProjectKey(order, "a", 2)).toEqual(["b", "c", "a", "d"]);
    expect(moveProjectKey(order, "d", 0)).toEqual(["d", "a", "b", "c"]);
    expect(moveProjectKey(order, "b", 1)).toBe(order);
  });

  it("targets the neighbor before a project moved down and after one moved up", () => {
    expect(projectDropTarget(order, ["b", "c", "a", "d"], "a")).toBe("c");
    expect(projectDropTarget(order, ["d", "a", "b", "c"], "d")).toBe("a");
    expect(projectDropTarget(order, order, "b")).toBeNull();
  });
});

describe("resolveProjectsLayoutDrop", () => {
  const items: ProjectsLayoutItem[] = [
    { kind: "thread", id: "pinned", section: "pinned", projectKey: "web" },
    { kind: "marker", id: "heading", marker: "projects" },
    { kind: "marker", id: "web", marker: "project", projectKey: "web", closedKeys: null },
    { kind: "thread", id: "w1", section: "active", projectKey: "web" },
    { kind: "thread", id: "w2", section: "active", projectKey: "web" },
    { kind: "marker", id: "api", marker: "project", projectKey: "api", closedKeys: ["a1", "a2"] },
    { kind: "marker", id: "settled", marker: "settled" },
    { kind: "thread", id: "s1", section: "settled", projectKey: "web" },
  ];

  it("reorders a thread within its own project", () => {
    expect(resolveProjectsLayoutDrop(items, "w2", "w1")).toEqual({
      section: "active",
      projectKey: "web",
      order: ["w2", "w1"],
    });
  });

  it("unpins a thread dropped back into its project", () => {
    expect(resolveProjectsLayoutDrop(items, "pinned", "w2")).toEqual({
      section: "active",
      projectKey: "web",
      order: ["w1", "w2", "pinned"],
    });
  });

  it("pins a thread dropped above the Projects heading", () => {
    expect(resolveProjectsLayoutDrop(items, "w1", "pinned")).toEqual({
      section: "pinned",
      order: ["w1", "pinned"],
    });
  });

  it("refuses another project, open or closed", () => {
    expect(resolveProjectsLayoutDrop(items, "w1", "api")).toBeNull();
    expect(resolveProjectsLayoutDrop(items, "pinned", "api")).toBeNull();
  });

  it("lands at the top of its own closed project", () => {
    const closed: ProjectsLayoutItem[] = [
      { kind: "marker", id: "heading", marker: "projects" },
      { kind: "marker", id: "api", marker: "project", projectKey: "api", closedKeys: ["a1", "a2"] },
      { kind: "marker", id: "settled", marker: "settled" },
      { kind: "thread", id: "a2", section: "settled", projectKey: "api" },
    ];
    expect(resolveProjectsLayoutDrop(closed, "a2", "settled")).toEqual({
      section: "active",
      projectKey: "api",
      order: ["a2", "a1"],
    });
  });

  it("settles a thread dropped under the Settled heading", () => {
    expect(resolveProjectsLayoutDrop(items, "w1", "s1")).toEqual({ section: "settled" });
  });
});
