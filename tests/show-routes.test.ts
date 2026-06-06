import { describe, expect, it } from "vitest";

import { getShowDetailHref } from "../features/shows";

describe("show routes", () => {
  it("builds the protected show detail route from a TMDB id", () => {
    expect(getShowDetailHref(1396)).toBe("/shows/1396");
  });
});
