import type { ShowInformation } from "./types";

function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function names(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((entry) => text(object(entry).name)).filter(Boolean))];
}

export function getShowInformation(metadataValue: unknown, genresValue: unknown): ShowInformation {
  const metadata = object(metadataValue);
  const ratings = Array.isArray(metadata.contentRatings)
    ? metadata.contentRatings.flatMap((entry) => {
      const value = object(entry);
      const countryCode = text(value.countryCode).toUpperCase();
      const rating = text(value.rating);
      return /^[A-Z]{2}$/.test(countryCode) && rating ? [{ countryCode, rating }] : [];
    })
    : [];
  const originCountries = Array.isArray(metadata.originCountries)
    ? metadata.originCountries.map(text)
    : [];
  const selectedRating = ratings.find(({ countryCode }) => countryCode === "US")
    ?? ratings.find(({ countryCode }) => originCountries.includes(countryCode))
    ?? ratings[0];

  return {
    creators: names(metadata.creators),
    stars: names(metadata.stars).slice(0, 6),
    genres: names(genresValue),
    ageRating: selectedRating ? `${selectedRating.rating} (${selectedRating.countryCode})` : null,
  };
}
