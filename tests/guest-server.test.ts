import type { SupabaseClient, User } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { addCachedDemoShow, initializeGuest, isDemoEnabled, isGuestReady, searchDemoCatalogue } from "../features/guest/server";
import { DEMO_SHOWS } from "../features/guest/catalogue";
import type { Database } from "../lib/supabase/types";

const adminFactory = vi.hoisted(() => vi.fn());
const savedZone = vi.hoisted(() => vi.fn());
vi.mock("server-only", () => ({}));
vi.mock("../lib/supabase/admin", () => ({ createOptionalSupabaseServiceRoleClient: adminFactory }));
vi.mock("../features/profile/timezone", () => ({ getPersistedUserTimeZoneForMutation: savedZone }));

const user = { id: "guest-a", is_anonymous: true } as User;
type Row = Record<string, unknown>;
class FakeClient {
  session = { expires_at: "2099-01-01T00:00:00Z", seeded_at: null as string | null };
  catalogue = DEMO_SHOWS.map((show, display_order) => ({ show_tmdb_id: show.tmdbId, display_order }));
  shows = DEMO_SHOWS.map((show) => ({ tmdb_id: show.tmdbId, title: show.title, original_title: show.title, poster_path: null }));
  episodes = DEMO_SHOWS.flatMap((show) => [1, 2, 3].map((episode_number) => ({ show_tmdb_id: show.tmdbId, season_number: 1, episode_number, air_date: "2020-01-01" })));
  calls: { table: string; method: string; values?: unknown }[] = [];
  failTable = "";
  insertError: null | { code: string } = null;
  rpc = vi.fn().mockResolvedValue({ error: null });
  from(table: string) {
    let id: unknown;
    let start: number | undefined;
    let insert: unknown;
    const result = () => {
      this.calls.push({ table, method: insert ? "insert" : "select", values: insert });
      if (table === this.failTable) return { data: null, error: { message: "private credential" } };
      if (insert) return { error: this.insertError };
      if (table === "guest_sessions") return { data: this.session, error: null };
      let data: Row[] = table === "demo_catalogue" ? this.catalogue : table === "shows" ? this.shows : this.episodes;
      if (id !== undefined) data = data.filter((row) => (row.tmdb_id ?? row.show_tmdb_id) === id);
      // Force short pages to catch premature row-cap termination.
      if (start !== undefined) data = data.slice(start, start + 2);
      return { data, error: null };
    };
    const chain = {
      select: () => chain, order: () => chain, in: () => chain,
      eq: (column: string, value: unknown) => { if (column !== "user_id") id = value; return chain; },
      range: (offset: number) => { start = offset; return chain; },
      insert: (value: unknown) => { insert = value; return chain; },
      maybeSingle: async () => { const value = result(); return { ...value, data: Array.isArray(value.data) ? value.data[0] ?? null : value.data }; },
      single: async () => { const value = result(); return { ...value, data: Array.isArray(value.data) ? value.data[0] ?? null : value.data }; },
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(result()).then(resolve),
    };
    return chain;
  }
}
function client(db: FakeClient) { return db as unknown as SupabaseClient<Database>; }
let db: FakeClient;
describe("cached guest services", () => {
  beforeEach(() => { db = new FakeClient(); adminFactory.mockReset().mockReturnValue(client(db)); savedZone.mockReset().mockResolvedValue({ timeZone: null, rawTimeZone: null }); });
  it("defaults off and requires Turnstile configuration before enabling", () => {
    vi.stubEnv("DEMO_ENABLED", "false"); vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "test"); expect(isDemoEnabled()).toBe(false);
    vi.stubEnv("DEMO_ENABLED", "true"); expect(isDemoEnabled()).toBe(true);
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", ""); expect(isDemoEnabled()).toBe(false);
    vi.unstubAllEnvs();
  });
  it("prepares complete paginated episodes with the saved timezone and service-only RPC", async () => {
    savedZone.mockResolvedValue({ timeZone: "Asia/Tokyo", rawTimeZone: "Asia/Tokyo" });
    await initializeGuest(user, "America/Sao_Paulo");
    expect(db.rpc).toHaveBeenCalledWith("seed_guest_demo", expect.objectContaining({ p_user_id: user.id, p_timezone: "Asia/Tokyo", p_reset: false }));
    const seed = db.rpc.mock.calls[0][1];
    expect(seed.p_library).toHaveLength(5); expect(seed.p_watched.filter((row: { show_tmdb_id: number }) => row.show_tmdb_id === 70523)).toHaveLength(3);
    expect(db.calls.every((call) => call.method === "select")).toBe(true);
  });
  it("resumes without writes and denies expired/invalid initialization before writes", async () => {
    db.session.seeded_at = "2026-01-01T00:00:00Z";
    await initializeGuest(user, "UTC"); expect(db.rpc).not.toHaveBeenCalled();
    db.session.expires_at = "2020-01-01T00:00:00Z";
    await expect(initializeGuest(user, "UTC")).rejects.toThrow("Demo expired");
    expect(db.rpc).not.toHaveBeenCalled(); expect(await isGuestReady(client(db), user)).toBe(false);
  });
  it("does not claim success after an RPC failure and rejects incomplete cached metadata", async () => {
    db.rpc.mockResolvedValue({ error: { message: "private credential" } });
    await expect(initializeGuest(user, "UTC")).rejects.toThrow("Unable to prepare demo");
    db.catalogue.pop(); await expect(initializeGuest(user, "UTC")).rejects.toThrow("Demo catalogue is not ready");
  });
  it("does not seed with a fallback timezone when the saved-timezone read fails", async () => {
    savedZone.mockRejectedValue(new Error("timezone query failed"));
    await expect(initializeGuest(user, "UTC")).rejects.toThrow("timezone query failed");
    expect(db.rpc).not.toHaveBeenCalled();
  });
  it("searches only stored catalogue rows with the existing response shape", async () => {
    const result = await searchDemoCatalogue(client(db), "fall", 1);
    expect(result.results.map((show) => show.tmdbId)).toEqual([106379]); expect(result.totalResults).toBe(1); expect(result.attribution).toBeDefined();
    expect((await searchDemoCatalogue(client(db), "fall", 2)).results).toEqual([]);
    expect(db.calls.every((call) => call.method === "select" && ["demo_catalogue", "shows"].includes(call.table))).toBe(true);
  });
  it("adds only guest library membership and handles duplicates without touching metadata/progress", async () => {
    db.session.seeded_at = "2026-01-01T00:00:00Z";
    expect(await addCachedDemoShow(client(db), user, 106379)).toEqual({ title: "Fallout", duplicate: false });
    expect(db.calls.filter((call) => call.method === "insert")).toEqual([{ table: "user_shows", method: "insert", values: { user_id: "guest-a", show_tmdb_id: 106379, status: "watchlist", favourite: false } }]);
    db.insertError = { code: "23505" }; expect((await addCachedDemoShow(client(db), user, 106379)).duplicate).toBe(true);
    await expect(addCachedDemoShow(client(db), user, 999)).rejects.toThrow("Show unavailable");
    expect(adminFactory).not.toHaveBeenCalled();
  });
});
