import { describe, expect, it } from "vitest";

import { getProgressStatusLabel } from "../features/progress/view-model";

describe("progress view model", () => {
  it("uses human-readable derived status labels", () => {
    expect(getProgressStatusLabel("watchlist")).toBe("Watchlist");
    expect(getProgressStatusLabel("watching")).toBe("Watching");
    expect(getProgressStatusLabel("caught_up")).toBe("Caught up");
    expect(getProgressStatusLabel("completed")).toBe("Completed");
    expect(getProgressStatusLabel("dropped")).toBe("Dropped");
  });
});
