import { describe, expect, it } from "vite-plus/test";

import {
  isDefaultThreadDetailsVisibility,
  resolveThreadDetailsVisibility,
  setThreadDetailsItem,
  THREAD_DETAILS_ITEMS,
} from "./threadDetailsItems";

const usage = THREAD_DETAILS_ITEMS.find((item) => item.id === "usage")!;
const servers = THREAD_DETAILS_ITEMS.find((item) => item.id === "servers")!;

describe("thread details items", () => {
  it("shows every item by default", () => {
    const visibility = resolveThreadDetailsVisibility({ threadDetailsItems: {} });
    expect(THREAD_DETAILS_ITEMS.every((item) => visibility[item.id])).toBe(true);
    expect(isDefaultThreadDetailsVisibility(visibility)).toBe(true);
  });

  it("keeps saved choices and ignores unknown ids", () => {
    const visibility = resolveThreadDetailsVisibility({
      threadDetailsItems: { usage: false, servers: false, retired: false },
    });
    expect(visibility.usage).toBe(false);
    expect(visibility.servers).toBe(false);
    expect(visibility.context).toBe(true);
    expect(isDefaultThreadDetailsVisibility(visibility)).toBe(false);
  });

  it("stores only choices that differ from the default", () => {
    expect(setThreadDetailsItem({ threadDetailsItems: {} }, usage, false)).toEqual({
      usage: false,
    });
    expect(setThreadDetailsItem({ threadDetailsItems: { usage: false } }, usage, true)).toEqual({});
    expect(setThreadDetailsItem({ threadDetailsItems: { servers: false } }, servers, true)).toEqual(
      {},
    );
  });
});
