import { afterEach, describe, expect, it, vi } from "vitest";
import { forgetSearchResults, getSearchHref, readSearchResults, rememberSearchResults } from "../features/search/search-session";

describe("Search return navigation", () => {
  afterEach(() => vi.restoreAllMocks());
  it("preserves unrelated parameters and hash while replacing the submitted query", () => {
    expect(getSearchHref("/search", "source=nav&q=old&tag=a&tag=b", "Star Trek", "#results"))
      .toBe("/search?source=nav&q=Star+Trek&tag=a&tag=b#results");
    expect(getSearchHref("/search", "q=old&source=nav", "")).toBe("/search?source=nav");
  });
  it("restores empty searches as cached results and supports explicit refresh", () => {
    rememberSearchResults("empty", []);
    expect(readSearchResults("empty")).toEqual([]);
    forgetSearchResults("empty");
    expect(readSearchResults("empty")).toBeUndefined();
  });
  it("expires results after five minutes", () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(1000);
    rememberSearchResults("expiry", []);
    now.mockReturnValue(300999);
    expect(readSearchResults("expiry")).toEqual([]);
    now.mockReturnValue(301000);
    expect(readSearchResults("expiry")).toBeUndefined();
  });
  it("bounds cached queries without saving user membership or preferences", () => {
    for (let i = 0; i < 9; i++) rememberSearchResults(`bounded-${i}`, []);
    expect(readSearchResults("bounded-0")).toBeUndefined();
    expect(readSearchResults("bounded-8")).toEqual([]);
  });
});
