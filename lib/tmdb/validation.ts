import { POSTGRES_INTEGER_MAX } from "../validations/numbers";

export const DEFAULT_TMDB_LANGUAGE = "en-US";
export const TMDB_ID_MAX = POSTGRES_INTEGER_MAX;
export const TMDB_SEARCH_PAGE_MAX = 500;
export const TMDB_SEARCH_QUERY_MAX_LENGTH = 100;

export const TMDB_LANGUAGE_ALLOWLIST = [
  "de-DE",
  "en-GB",
  "en-US",
  "es-ES",
  "es-MX",
  "fr-FR",
  "it-IT",
  "ja-JP",
  "ko-KR",
  "pt-BR",
] as const;

type ValidationResult<T> =
  | {
      ok: true;
      value: T;
    }
  | {
      error: "invalid" | "missing" | "out_of_range" | "too_long" | "unsupported";
      ok: false;
    };

const tmdbLanguageAllowlist = new Set<string>(TMDB_LANGUAGE_ALLOWLIST);

export function validateTmdbSearchQuery(value: string | null): ValidationResult<string> {
  const query = value?.trim() ?? "";

  if (!query) {
    return { error: "missing", ok: false };
  }

  if (query.length > TMDB_SEARCH_QUERY_MAX_LENGTH) {
    return { error: "too_long", ok: false };
  }

  return { ok: true, value: query };
}

export function validateTmdbSearchPage(value: string | null): ValidationResult<number> {
  if (value === null) {
    return { ok: true, value: 1 };
  }

  if (!/^[1-9]\d*$/.test(value)) {
    return { error: "invalid", ok: false };
  }

  const page = Number(value);

  if (!Number.isSafeInteger(page) || page > TMDB_SEARCH_PAGE_MAX) {
    return { error: "out_of_range", ok: false };
  }

  return { ok: true, value: page };
}

export function validateTmdbId(value: unknown): ValidationResult<number> {
  if (
    typeof value !== "number" &&
    (typeof value !== "string" || !/^[1-9]\d*$/.test(value))
  ) {
    return { error: "invalid", ok: false };
  }

  const tmdbId = typeof value === "number" ? value : Number(value);

  if (!Number.isSafeInteger(tmdbId) || tmdbId < 1 || tmdbId > TMDB_ID_MAX) {
    return { error: "out_of_range", ok: false };
  }

  return { ok: true, value: tmdbId };
}

export function validateTmdbLanguage(value: string | null): ValidationResult<string> {
  const language = value === null ? DEFAULT_TMDB_LANGUAGE : value.trim();

  if (!tmdbLanguageAllowlist.has(language)) {
    return { error: "unsupported", ok: false };
  }

  return { ok: true, value: language };
}
