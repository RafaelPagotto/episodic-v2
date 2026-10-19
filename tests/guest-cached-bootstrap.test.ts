import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import type { Database } from "../lib/supabase/types";
import { DEMO_SHOWS } from "../features/guest/catalogue";
import { registerCachedDemoCatalogue } from "../features/guest/bootstrap";

vi.mock("server-only", () => ({}));

function cache(options: { missingShow?: number; missingEpisodes?: number; failRegistration?: boolean } = {}) {
  const calls: { table: string; operation: string; values?: unknown }[] = [];
  const client = {
    from(table: string) {
      let id: number;
      const query = {
        select() { calls.push({ table, operation: "select" }); return query; },
        eq(_column: string, value: number) { id = value; return query; },
        gt: () => query,
        async maybeSingle() {
          const show = DEMO_SHOWS.find((row) => row.tmdbId === id);
          return { data: id === options.missingShow ? null : { title: show?.title }, error: null };
        },
        async limit() { return { data: id === options.missingEpisodes ? [] : [{ id: 1 }], error: null }; },
        async upsert(values: unknown) {
          calls.push({ table, operation: "upsert", values });
          return { error: options.failRegistration ? { message: "internal error" } : null };
        },
      };
      return query;
    },
  } as unknown as SupabaseClient<Database>;
  return { client, calls };
}

describe("cached demo catalogue bootstrap", () => {
  it("registers 21 existing titles with no imports, metadata writes or user writes", async () => {
    const { client, calls } = cache();
    await registerCachedDemoCatalogue(client);
    expect(calls.filter((call) => call.operation !== "select")).toEqual([{
      table: "demo_catalogue", operation: "upsert",
      values: DEMO_SHOWS.map((show, display_order) => ({ show_tmdb_id: show.tmdbId, display_order })),
    }]);
    expect(calls.filter((call) => call.operation === "select")).toHaveLength(42);
    expect(calls.every((call) => ["shows", "episodes", "demo_catalogue"].includes(call.table))).toBe(true);
    expect(calls.at(-1)?.table).toBe("demo_catalogue");
  });
  it.each(["missingShow", "missingEpisodes"] as const)("does not expose a partial catalogue after %s", async (field) => {
    const { client, calls } = cache({ [field]: DEMO_SHOWS.at(-1)!.tmdbId });
    await expect(registerCachedDemoCatalogue(client)).rejects.toThrow(/not ready/);
    expect(calls.every((call) => call.operation === "select")).toBe(true);
  });
  it("returns a controlled registration failure", async () => {
    const { client } = cache({ failRegistration: true });
    await expect(registerCachedDemoCatalogue(client)).rejects.toThrow("Catalogue registration failed.");
  });
});
