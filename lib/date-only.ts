export const DEFAULT_TIME_ZONE = "UTC";

const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isDateOnlyShape(value: unknown): value is string {
  return typeof value === "string" && DATE_ONLY_PATTERN.test(value);
}

function isLeapYear(year: number) {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function getDaysInMonth(year: number, month: number) {
  if (month === 2) {
    return isLeapYear(year) ? 29 : 28;
  }

  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

export function isDateOnly(value: unknown): value is string {
  if (!isDateOnlyShape(value)) {
    return false;
  }

  const match = DATE_ONLY_PATTERN.exec(value);

  // The shape check above guarantees these captures.
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  return year >= 1 && month >= 1 && month <= 12 && day >= 1 && day <= getDaysInMonth(year, month);
}

export function normalizeTimeZone(value: unknown) {
  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }

  // ECMA-402 also accepts fixed offsets such as "+01:00", but account
  // timezones must be named IANA zones so daylight-saving rules stay intact.
  if (value.startsWith("+") || value.startsWith("-")) {
    return null;
  }

  try {
    return new Intl.DateTimeFormat("en", { timeZone: value }).resolvedOptions().timeZone;
  } catch {
    return null;
  }
}

export function isTimeZone(value: unknown): value is string {
  return normalizeTimeZone(value) !== null;
}

export function resolveTimeZone(value: string | null | undefined) {
  return normalizeTimeZone(value) ?? DEFAULT_TIME_ZONE;
}

function dateOnlyToUtcDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);
  return date;
}

export function formatDateOnly(value: string | null, locale = "en") {
  if (!isDateOnly(value)) {
    return null;
  }

  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    timeZone: DEFAULT_TIME_ZONE,
    year: "numeric",
  }).format(dateOnlyToUtcDate(value));
}

export function getDateOnlyForTimeZone(
  instant: Date = new Date(),
  timeZone: string | null | undefined = DEFAULT_TIME_ZONE,
) {
  const validInstant = Number.isNaN(instant.getTime()) ? new Date() : instant;
  const parts = new Intl.DateTimeFormat("en-US-u-ca-iso8601", {
    day: "2-digit",
    month: "2-digit",
    timeZone: resolveTimeZone(timeZone),
    year: "numeric",
  }).formatToParts(validInstant);
  const values = new Map(parts.map((part) => [part.type, part.value]));
  const year = values.get("year")?.padStart(4, "0");

  return `${year}-${values.get("month")}-${values.get("day")}`;
}

export function getReferenceDateOnly(
  referenceDate: Date | string = new Date(),
  timeZone: string | null | undefined = DEFAULT_TIME_ZONE,
) {
  if (isDateOnly(referenceDate)) {
    return referenceDate;
  }

  if (isDateOnlyShape(referenceDate)) {
    return getDateOnlyForTimeZone(new Date(), timeZone);
  }

  const instant = typeof referenceDate === "string" ? new Date(referenceDate) : referenceDate;
  return getDateOnlyForTimeZone(instant, timeZone);
}

export function compareDateOnly(left: string, right: string) {
  if (!isDateOnly(left) || !isDateOnly(right)) {
    throw new RangeError("Date-only values must use a valid YYYY-MM-DD calendar date.");
  }

  if (left === right) {
    return 0;
  }

  return left < right ? -1 : 1;
}
