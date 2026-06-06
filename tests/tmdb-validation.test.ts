import { describe, expect, it } from "vitest";

import {
  DEFAULT_TMDB_LANGUAGE,
  TMDB_ID_MAX,
  TMDB_SEARCH_PAGE_MAX,
  TMDB_SEARCH_QUERY_MAX_LENGTH,
  validateTmdbId,
  validateTmdbLanguage,
  validateTmdbSearchPage,
  validateTmdbSearchQuery,
} from "../lib/tmdb/validation";

describe("TMDB request validation", () => {
  it("trims valid search queries and enforces a maximum length", () => {
    expect(validateTmdbSearchQuery("  Arcane  ")).toEqual({ ok: true, value: "Arcane" });
    expect(validateTmdbSearchQuery("a".repeat(TMDB_SEARCH_QUERY_MAX_LENGTH))).toEqual({
      ok: true,
      value: "a".repeat(TMDB_SEARCH_QUERY_MAX_LENGTH),
    });
    expect(validateTmdbSearchQuery(" ".repeat(5))).toEqual({ error: "missing", ok: false });
    expect(validateTmdbSearchQuery("a".repeat(TMDB_SEARCH_QUERY_MAX_LENGTH + 1))).toEqual({
      error: "too_long",
      ok: false,
    });
  });

  it("accepts only decimal search pages within the supported range", () => {
    expect(validateTmdbSearchPage(null)).toEqual({ ok: true, value: 1 });
    expect(validateTmdbSearchPage(String(TMDB_SEARCH_PAGE_MAX))).toEqual({
      ok: true,
      value: TMDB_SEARCH_PAGE_MAX,
    });
    expect(validateTmdbSearchPage("")).toEqual({ error: "invalid", ok: false });
    expect(validateTmdbSearchPage("1e2")).toEqual({ error: "invalid", ok: false });
    expect(validateTmdbSearchPage(String(TMDB_SEARCH_PAGE_MAX + 1))).toEqual({
      error: "out_of_range",
      ok: false,
    });
  });

  it("accepts only positive integer TMDB ids within the database integer range", () => {
    expect(validateTmdbId(1)).toEqual({ ok: true, value: 1 });
    expect(validateTmdbId(String(TMDB_ID_MAX))).toEqual({ ok: true, value: TMDB_ID_MAX });
    expect(validateTmdbId(0)).toEqual({ error: "out_of_range", ok: false });
    expect(validateTmdbId("1.5")).toEqual({ error: "invalid", ok: false });
    expect(validateTmdbId(TMDB_ID_MAX + 1)).toEqual({ error: "out_of_range", ok: false });
  });

  it("defaults omitted languages and rejects languages outside the allowlist", () => {
    expect(validateTmdbLanguage(null)).toEqual({ ok: true, value: DEFAULT_TMDB_LANGUAGE });
    expect(validateTmdbLanguage("pt-BR")).toEqual({ ok: true, value: "pt-BR" });
    expect(validateTmdbLanguage("")).toEqual({ error: "unsupported", ok: false });
    expect(validateTmdbLanguage("not-a-language")).toEqual({ error: "unsupported", ok: false });
  });
});
