import { describe, expect, it } from "vitest";

import { getUserDateOptions, getUserTimeZone } from "../features/profile/timezone";

type ProfileResult = {
  data: Array<{ timezone: string | null }> | null;
  error: { message: string } | null;
};

function client(result: ProfileResult): Parameters<typeof getUserTimeZone>[0] {
  const query = {
    eq: () => query,
    limit: async () => result,
    select: () => query,
  };

  return {
    from: () => query,
  } as unknown as Parameters<typeof getUserTimeZone>[0];
}

describe("profile timezone loading", () => {
  it("uses a valid saved profile timezone", async () => {
    await expect(
      getUserTimeZone(client({ data: [{ timezone: "America/Sao_Paulo" }], error: null }), "user-1"),
    ).resolves.toBe("America/Sao_Paulo");
  });

  it("captures one canonical date for the saved timezone", async () => {
    await expect(
      getUserDateOptions(
        client({ data: [{ timezone: "America/Sao_Paulo" }], error: null }),
        "user-1",
        new Date("2026-07-19T02:30:00.000Z"),
      ),
    ).resolves.toEqual({
      referenceDate: "2026-07-18",
      timeZone: "America/Sao_Paulo",
    });
  });

  it("falls back deterministically to UTC for missing, invalid, or unavailable values", async () => {
    await expect(
      getUserTimeZone(client({ data: [{ timezone: "Invalid/Timezone" }], error: null }), "user-1"),
    ).resolves.toBe("UTC");
    await expect(getUserTimeZone(client({ data: [{ timezone: null }], error: null }), "user-1"))
      .resolves.toBe("UTC");
    await expect(getUserTimeZone(client({ data: null, error: { message: "Unavailable" } }), "user-1"))
      .resolves.toBe("UTC");
  });
});
