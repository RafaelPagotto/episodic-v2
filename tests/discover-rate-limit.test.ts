import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { consumeTmdbRateLimit } from "../lib/tmdb/rate-limit";
describe("Discover request budget", () => {
  it("allows thirty requests per user/minute independently of search and other users", () => {
    const user = "discover-budget-fixture";
    for (let i = 0; i < 30; i++) expect(consumeTmdbRateLimit("discover", user).allowed).toBe(true);
    expect(consumeTmdbRateLimit("discover", user)).toMatchObject({ allowed: false });
    expect(consumeTmdbRateLimit("search", user).allowed).toBe(true);
    expect(consumeTmdbRateLimit("discover", "another-fixture-user").allowed).toBe(true);
  });
});
