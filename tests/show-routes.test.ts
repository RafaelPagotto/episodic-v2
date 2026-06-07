import { describe, expect, it } from "vitest";

import { getShowDetailHref, getShowDetailSeasonHref } from "../features/shows";

describe("show routes", () => {
  it("builds the protected show detail route from a TMDB id", () => {
    expect(getShowDetailHref(1396)).toBe("/shows/1396");
  });

  it("builds a protected show detail route for a specific season", () => {
    expect(getShowDetailSeasonHref(1396, 4)).toBe("/shows/1396?season=4");
  });
});
