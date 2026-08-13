import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  initializeUserTimeZoneAction,
  updateUserTimeZoneAction,
} from "../features/profile/timezone-actions";
import { INITIAL_TIME_ZONE_ACTION_STATE } from "../features/profile/timezone-state";

const revalidatePathMock = vi.hoisted(() => vi.fn());
const createSupabaseServerClientMock = vi.hoisted(() => vi.fn());

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

vi.mock("../lib/supabase/server", () => ({
  createSupabaseServerClient: createSupabaseServerClientMock,
}));

type Profile = {
  display_name: string | null;
  id: string;
  timezone: string | null;
};

type QueryFilter = {
  column: string;
  kind: "eq" | "is";
  value: unknown;
};

function createClient(
  profiles: Profile[],
  user: { id: string } | null = { id: "user-1" },
  updateError: { message: string } | null = null,
  readError: { message: string } | null = null,
  beforeUpdate: (() => void) | null = null,
) {
  const updates: Array<{ id: string; values: { timezone?: string | null } }> = [];

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }),
    },
    from: vi.fn(() => {
      let mode: "read" | "update" = "read";
      const filters: QueryFilter[] = [];
      let updateValues: { timezone?: string | null } = {};

      const query = {
        eq: (column: string, value: string) => {
          filters.push({ column, kind: "eq", value });
          return query;
        },
        is: (column: string, value: unknown) => {
          filters.push({ column, kind: "is", value });
          return query;
        },
        limit: () => query,
        select: () => query,
        then: <TResult>(onfulfilled: (value: {
          data: Array<{ timezone: string | null }> | null;
          error: { message: string } | null;
        }) => TResult) => {
          if (mode === "update") {
            const userIdFilter = filters.find((filter) => filter.column === "id");
            updates.push({ id: String(userIdFilter?.value ?? ""), values: updateValues });

            if (updateError) {
              return Promise.resolve(onfulfilled({ data: null, error: updateError }));
            }

            beforeUpdate?.();
            const profile = profiles.find((candidate) => matchesFilters(candidate, filters));

            if (profile) {
              Object.assign(profile, updateValues);
            }

            return Promise.resolve(onfulfilled({
              data: profile ? [{ timezone: profile.timezone }] : [],
              error: null,
            }));
          }

          const matchingProfiles = profiles.filter((profile) => matchesFilters(profile, filters));

          return Promise.resolve(onfulfilled({
            data: readError
              ? null
              : matchingProfiles.map((profile) => ({ timezone: profile.timezone })),
            error: readError,
          }));
        },
        update: (values: { timezone?: string | null }) => {
          mode = "update";
          updateValues = values;
          return query;
        },
      };

      return query;
    }),
    updates,
  };
}

function matchesFilters(profile: Profile, filters: QueryFilter[]) {
  return filters.every((filter) => {
    const value = profile[filter.column as keyof Profile];

    if (filter.kind === "is") {
      return Object.is(value, filter.value);
    }

    return value === filter.value;
  });
}

function timeZoneFormData(timeZone: string, attemptedUserId = "user-2") {
  const formData = new FormData();
  formData.set("timeZone", timeZone);
  formData.set("userId", attemptedUserId);
  return formData;
}

describe("profile timezone actions", () => {
  beforeEach(() => {
    revalidatePathMock.mockReset();
    createSupabaseServerClientMock.mockReset();
  });

  it("saves a valid timezone only on the authenticated user's profile", async () => {
    const profiles = [
      { display_name: "Viewer", id: "user-1", timezone: null },
      { display_name: "Other", id: "user-2", timezone: "Europe/London" },
    ];
    const client = createClient(profiles);
    createSupabaseServerClientMock.mockResolvedValue(client);

    const result = await updateUserTimeZoneAction(
      INITIAL_TIME_ZONE_ACTION_STATE,
      timeZoneFormData("America/Sao_Paulo"),
    );

    expect(result).toEqual({
      message: "Timezone saved.",
      status: "success",
      timeZone: "America/Sao_Paulo",
    });
    expect(profiles).toEqual([
      { display_name: "Viewer", id: "user-1", timezone: "America/Sao_Paulo" },
      { display_name: "Other", id: "user-2", timezone: "Europe/London" },
    ]);
    expect(client.updates).toEqual([
      { id: "user-1", values: { timezone: "America/Sao_Paulo" } },
    ]);
    expect(revalidatePathMock).toHaveBeenCalledWith("/dashboard");
    expect(revalidatePathMock).toHaveBeenCalledWith("/shows/[tmdbId]", "page");
  });

  it("rejects invalid timezones without changing profile data", async () => {
    const profiles = [{ display_name: "Viewer", id: "user-1", timezone: null }];
    const client = createClient(profiles);
    createSupabaseServerClientMock.mockResolvedValue(client);

    const result = await updateUserTimeZoneAction(
      INITIAL_TIME_ZONE_ACTION_STATE,
      timeZoneFormData("Not/A_Timezone"),
    );

    expect(result).toEqual({ message: "Select a valid IANA timezone.", status: "error" });
    expect(profiles[0]).toEqual({ display_name: "Viewer", id: "user-1", timezone: null });
    expect(client.updates).toEqual([]);
    expect(revalidatePathMock).not.toHaveBeenCalled();

    await expect(
      updateUserTimeZoneAction(
        INITIAL_TIME_ZONE_ACTION_STATE,
        timeZoneFormData("+01:00"),
      ),
    ).resolves.toEqual({ message: "Select a valid IANA timezone.", status: "error" });
    expect(client.updates).toEqual([]);
  });

  it("requires authentication and does not expose provider errors", async () => {
    const signedOutClient = createClient([], null);
    createSupabaseServerClientMock.mockResolvedValue(signedOutClient);

    await expect(
      updateUserTimeZoneAction(
        INITIAL_TIME_ZONE_ACTION_STATE,
        timeZoneFormData("America/Sao_Paulo"),
      ),
    ).resolves.toEqual({ message: "Sign in to update your timezone.", status: "error" });

    const failingClient = createClient(
      [{ display_name: "Viewer", id: "user-1", timezone: null }],
      { id: "user-1" },
      { message: "private provider detail" },
    );
    createSupabaseServerClientMock.mockResolvedValue(failingClient);

    const failedResult = await updateUserTimeZoneAction(
      INITIAL_TIME_ZONE_ACTION_STATE,
      timeZoneFormData("America/Sao_Paulo"),
    );

    expect(failedResult).toEqual({
      message: "Unable to save your timezone right now.",
      status: "error",
    });
    expect(failedResult.message).not.toContain("provider");
  });

  it("initializes missing or invalid values but never overwrites a valid saved timezone", async () => {
    const missingProfiles = [{ display_name: "Viewer", id: "user-1", timezone: null }];
    const missingClient = createClient(missingProfiles);
    createSupabaseServerClientMock.mockResolvedValue(missingClient);

    await expect(initializeUserTimeZoneAction("America/Sao_Paulo")).resolves.toEqual({
      message: "Timezone saved.",
      status: "success",
      timeZone: "America/Sao_Paulo",
    });
    expect(missingClient.updates).toHaveLength(1);

    const validProfiles = [
      { display_name: "Viewer", id: "user-1", timezone: "Europe/London" },
    ];
    const validClient = createClient(validProfiles);
    createSupabaseServerClientMock.mockResolvedValue(validClient);

    await expect(initializeUserTimeZoneAction("America/Sao_Paulo")).resolves.toEqual({
      message: "Timezone saved.",
      status: "success",
      timeZone: "Europe/London",
    });
    expect(validClient.updates).toEqual([]);
    expect(validProfiles[0]?.timezone).toBe("Europe/London");

    const invalidProfiles = [
      { display_name: "Viewer", id: "user-1", timezone: "Invalid/Legacy" },
    ];
    const invalidClient = createClient(invalidProfiles);
    createSupabaseServerClientMock.mockResolvedValue(invalidClient);

    await initializeUserTimeZoneAction("America/Sao_Paulo");
    expect(invalidProfiles[0]?.timezone).toBe("America/Sao_Paulo");
  });

  it("does not overwrite a saved timezone when the initialization read fails", async () => {
    const profiles = [
      { display_name: "Viewer", id: "user-1", timezone: "Europe/London" },
    ];
    const client = createClient(
      profiles,
      { id: "user-1" },
      null,
      { message: "temporary read failure" },
    );
    createSupabaseServerClientMock.mockResolvedValue(client);

    const result = await initializeUserTimeZoneAction("America/Sao_Paulo");

    expect(result).toEqual({
      message: "Unable to load your timezone right now.",
      status: "error",
    });
    expect(profiles[0]?.timezone).toBe("Europe/London");
    expect(client.updates).toEqual([]);
  });

  it("does not overwrite a timezone saved concurrently after initialization reads null", async () => {
    const profiles: Profile[] = [{ display_name: "Viewer", id: "user-1", timezone: null }];
    const client = createClient(
      profiles,
      { id: "user-1" },
      null,
      null,
      () => {
        profiles[0].timezone = "Europe/London";
      },
    );
    createSupabaseServerClientMock.mockResolvedValue(client);

    const result = await initializeUserTimeZoneAction("America/Sao_Paulo");

    expect(result).toEqual({
      message: "Timezone saved.",
      status: "success",
      timeZone: "Europe/London",
    });
    expect(profiles[0].timezone).toBe("Europe/London");
  });
});
