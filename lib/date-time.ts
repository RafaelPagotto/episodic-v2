import { isDateOnlyShape, resolveTimeZone } from "./date-only";

type TimestampFormatOptions = {
  timeZone?: string | null;
};

export function formatTimestamp(
  value: string | null,
  locale = "en",
  options: TimestampFormatOptions = {},
) {
  if (!value || isDateOnlyShape(value)) {
    return null;
  }

  const timestamp = new Date(value);

  if (Number.isNaN(timestamp.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    timeZone: resolveTimeZone(options.timeZone),
    year: "numeric",
  }).format(timestamp);
}
