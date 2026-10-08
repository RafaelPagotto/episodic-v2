import { describe, expect, it } from "vitest";
import { getShowInformation } from "../features/shows/information";

describe("show information", () => {
  it("prefers the US rating and retains its country", () => {
    expect(getShowInformation({
      creators: [{ name: " Larry David " }, { name: "Larry David" }],
      stars: [{ name: "Larry David" }, { name: "Cheryl Hines" }],
      contentRatings: [{ countryCode: "BR", rating: "16" }, { countryCode: "US", rating: "TV-MA" }],
      originCountries: ["BR"],
    }, [{ name: "Comedy" }])).toEqual({
      creators: ["Larry David"], stars: ["Larry David", "Cheryl Hines"],
      genres: ["Comedy"], ageRating: "TV-MA (US)",
    });
  });

  it("falls back to an origin country and then another available rating without relabeling it", () => {
    const contentRatings = [{ countryCode: "GB", rating: "15" }, { countryCode: "JP", rating: "12" }];
    expect(getShowInformation({ contentRatings, originCountries: ["JP"] }, []).ageRating).toBe("12 (JP)");
    expect(getShowInformation({ contentRatings }, []).ageRating).toBe("15 (GB)");
  });

  it("handles legacy and malformed cached metadata", () => {
    expect(getShowInformation(null, [])).toEqual({ creators: [], stars: [], genres: [], ageRating: null });
    expect(getShowInformation({
      creators: [null, {}, { name: 42 }], stars: "invalid",
      contentRatings: [null, { countryCode: "US", rating: " " }, { countryCode: "invalid", rating: "18" }],
    }, [null, {}, { name: " Drama " }])).toEqual({ creators: [], stars: [], genres: ["Drama"], ageRating: null });
  });
});
