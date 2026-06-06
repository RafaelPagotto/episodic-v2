import { describe, expect, it } from "vitest";

import { getStatusAfterClearingWatchedHistory } from "../features/profile/history";

describe("clear watched history status transitions", () => {
  it.each([
    ["watched", "watchlist"],
    ["watching", "watchlist"],
    ["watchlist", "watchlist"],
    ["dropped", "dropped"],
  ] as const)("transitions %s to %s", (currentStatus, expectedStatus) => {
    expect(getStatusAfterClearingWatchedHistory(currentStatus)).toBe(expectedStatus);
  });
});
