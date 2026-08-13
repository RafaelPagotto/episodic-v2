import { afterEach, describe, expect, it } from "vitest";

import {
  compareDateOnly,
  formatDateOnly,
  getDateOnlyForTimeZone,
  isDateOnly,
  isDateOnlyShape,
  normalizeTimeZone,
  resolveTimeZone,
} from "../lib/date-only";
import { formatTimestamp } from "../lib/date-time";

const originalTimeZone = process.env.TZ;

afterEach(() => {
  process.env.TZ = originalTimeZone;
});

describe("date-only helpers", () => {
  it.each(["UTC", "America/Sao_Paulo", "Pacific/Kiritimati"])(
    "preserves the literal calendar date when the runtime timezone is %s",
    (timeZone) => {
      process.env.TZ = timeZone;

      expect(formatDateOnly("2026-07-19", "en")).toBe("Jul 19, 2026");
    },
  );

  it("strictly validates calendar dates and leap years", () => {
    expect(isDateOnly("2024-02-29")).toBe(true);
    expect(isDateOnly("2000-02-29")).toBe(true);
    expect(isDateOnly("1900-02-29")).toBe(false);
    expect(isDateOnly("2026-02-29")).toBe(false);
    expect(isDateOnly("2026-04-31")).toBe(false);
    expect(isDateOnly("2026-13-01")).toBe(false);
    expect(isDateOnly("2026-00-10")).toBe(false);
    expect(isDateOnly("0000-01-01")).toBe(false);
    expect(isDateOnly("2026-7-19")).toBe(false);
    expect(isDateOnly("not-a-date")).toBe(false);
    expect(isDateOnly(null)).toBe(false);
    expect(isDateOnlyShape("2026-02-29")).toBe(true);
    expect(isDateOnlyShape("2026-2-29")).toBe(false);
    expect(formatDateOnly("2026-02-29")).toBeNull();
    expect(formatDateOnly(null)).toBeNull();
  });

  it("derives the calendar date in a validated timezone", () => {
    const instant = new Date("2026-07-19T02:30:00.000Z");

    expect(getDateOnlyForTimeZone(instant, "UTC")).toBe("2026-07-19");
    expect(getDateOnlyForTimeZone(instant, "America/Sao_Paulo")).toBe("2026-07-18");
    expect(getDateOnlyForTimeZone(instant, "Pacific/Kiritimati")).toBe("2026-07-19");
    expect(resolveTimeZone("Invalid/Timezone")).toBe("UTC");
    expect(normalizeTimeZone("America/Sao_Paulo")).toBe("America/Sao_Paulo");
    expect(normalizeTimeZone("Invalid/Timezone")).toBeNull();
    expect(normalizeTimeZone("+01:00")).toBeNull();
    expect(normalizeTimeZone(null)).toBeNull();
    expect(getDateOnlyForTimeZone(instant, "Invalid/Timezone")).toBe("2026-07-19");
  });

  it("compares validated ISO calendar dates lexicographically", () => {
    expect(compareDateOnly("2026-07-18", "2026-07-19")).toBe(-1);
    expect(compareDateOnly("2026-07-19", "2026-07-19")).toBe(0);
    expect(compareDateOnly("2026-07-20", "2026-07-19")).toBe(1);
    expect(() => compareDateOnly("2026-02-29", "2026-03-01")).toThrow(RangeError);
  });
});

describe("timestamp formatting", () => {
  it("continues to treat timestamp values as timezone-aware instants", () => {
    const timestamp = "2026-07-19T02:30:00.000Z";

    expect(formatTimestamp(timestamp, "en", { timeZone: "UTC" })).toBe("Jul 19, 2026");
    expect(formatTimestamp(timestamp, "en", { timeZone: "America/Sao_Paulo" })).toBe("Jul 18, 2026");
    expect(formatTimestamp("2026-07-19", "en", { timeZone: "America/Sao_Paulo" })).toBeNull();
    expect(formatTimestamp("2026-02-29", "en", { timeZone: "UTC" })).toBeNull();
    expect(formatTimestamp("not-a-timestamp", "en", { timeZone: "UTC" })).toBeNull();
  });
});
