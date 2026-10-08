import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildGuestSeed } from "../features/guest/seed";
import { DEMO_SHOWS } from "../features/guest/catalogue";

const A = "00000000-0000-4000-8000-000000000001";
const B = "00000000-0000-4000-8000-000000000002";
const REAL = "00000000-0000-4000-8000-000000000003";
let db: PGlite;

async function owner() { await db.exec("reset role; select set_config('request.jwt.claims','{}',false);"); }
async function asUser(id: string, anonymous = true) {
  await owner();
  await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub: id, is_anonymous: anonymous, user_metadata: { is_anonymous: false } })]);
  await db.exec("set role authenticated;");
}
async function seed(id = A, reset = false, watchedOverride?: unknown) {
  await owner();
  const rows = DEMO_SHOWS.flatMap((show) => [1, 2, 3].map((episodeNumber) => ({ showTmdbId: show.tmdbId, seasonNumber: 1, episodeNumber, airDate: "2020-01-01" })));
  const data = buildGuestSeed(rows, { referenceDate: "2026-10-07", timeZone: "America/Sao_Paulo" });
  const profile = (await db.query<{ timezone: string | null }>("select timezone from public.profiles where id=$1", [id])).rows[0];
  await db.exec("set role service_role;");
  try {
    await db.query("select public.seed_guest_demo($1,$2,$3,$4::jsonb,$5::jsonb,$6)", [id, "America/Sao_Paulo", profile?.timezone ?? null, JSON.stringify(data.library), JSON.stringify(watchedOverride ?? data.watched), reset]);
  } finally { await owner(); }
}

describe("guest migration on PostgreSQL (PGlite)", () => {
  beforeAll(async () => {
    db = new PGlite();
    // Auth schema/claims stand-ins; the application's actual migrations are unmodified.
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth;
      create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb default '{}', is_anonymous boolean default false, created_at timestamptz default now());
      create table auth.sessions(id uuid primary key, user_id uuid references auth.users on delete cascade);
      create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
      create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt()->>'sub')::uuid $$;
      grant usage on schema public,auth to anon,authenticated,service_role;
      alter default privileges in schema public grant all on tables to authenticated,service_role;
      alter default privileges in schema public grant usage,select on sequences to authenticated,service_role;
    `);
    for (const name of ["20260604000100_create_core_schema.sql", "20260604000200_enable_rls_and_policies.sql", "20260604000300_add_supporting_indexes.sql", "20261007140947_isolated_guest_demo.sql", "20261008004252_harden_auth_trigger_grants.sql"]) {
      await db.exec(await readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), "utf8"));
    }
    for (const [index, show] of DEMO_SHOWS.entries()) {
      await db.query("insert into public.shows(tmdb_id,title) values($1,$2)", [show.tmdbId, show.title]);
      await db.query("insert into public.demo_catalogue values($1,$2)", [show.tmdbId, index]);
      await db.query("insert into public.seasons(show_tmdb_id,season_number,name) values($1,1,'Season 1'),($1,0,'Specials')", [show.tmdbId]);
      for (const episode of [1, 2, 3]) await db.query("insert into public.episodes(show_tmdb_id,season_number,episode_number,title,air_date) values($1,1,$2,'Episode','2020-01-01')", [show.tmdbId, episode]);
      await db.query("insert into public.episodes(show_tmdb_id,season_number,episode_number,title) values($1,0,1,'Special')", [show.tmdbId]);
    }
    await db.exec("insert into public.shows(tmdb_id,title) values(999,'Outside demo');");
  }, 60000);
  afterAll(async () => { await db?.close(); });
  beforeEach(async () => {
    await owner();
    await db.exec("delete from auth.users;");
    for (const [id, anonymous] of [[A, true], [B, true], [REAL, false]] as const) {
      await db.query("insert into auth.users(id,email,is_anonymous) values($1,$2,$3)", [id, anonymous ? null : "test@example.invalid", anonymous]);
    }
  });

  it("registers a fixed 72-hour expiry and fails closed before initialization", async () => {
    const grants = (await db.query<{ callable: boolean }>("select has_function_privilege('authenticated','public.handle_new_user()','execute') as callable")).rows;
    expect(grants[0].callable).toBe(false);
    const { rows } = await db.query<{ hours: number }>("select extract(epoch from (g.expires_at-u.created_at))/3600 as hours from public.guest_sessions g join auth.users u on u.id=g.user_id");
    expect(rows.map((row) => Number(row.hours))).toEqual([72, 72]);
    await asUser(A);
    expect((await db.query("select * from public.shows")).rows).toEqual([]);
    await expect(db.query("insert into public.user_shows(user_id,show_tmdb_id) values($1,1396)", [A])).rejects.toThrow(/row-level security/);
  });

  it("isolates two seeded guests, restricts catalogue and leaves permanent access intact", async () => {
    await seed(A); await seed(B);
    await asUser(A);
    const library = (await db.query<{ user_id: string }>("select * from public.user_shows")).rows;
    expect(library).toHaveLength(5); expect(library.every((row) => row.user_id === A)).toBe(true);
    expect((await db.query("select * from public.shows where tmdb_id=999")).rows).toEqual([]);
    await expect(db.query("insert into public.user_shows(user_id,show_tmdb_id) values($1,106379)", [B])).rejects.toThrow(/row-level security/);
    await expect(db.query("insert into public.user_shows(user_id,show_tmdb_id) values($1,999)", [A])).rejects.toThrow(/row-level security/);
    await db.query("insert into public.user_shows(user_id,show_tmdb_id) values($1,106379)", [A]);
    await db.query("insert into public.watched_episodes(user_id,show_tmdb_id,season_number,episode_number) values($1,1396,0,1)", [A]);
    await expect(db.query("update public.guest_sessions set expires_at=now()+interval '1 year'")).rejects.toThrow(/permission denied/);
    await expect(db.query("update public.demo_catalogue set display_order=8")).rejects.toThrow(/permission denied/);
    await expect(db.query("insert into public.shows(tmdb_id,title) values(888,'Guest write')")).rejects.toThrow(/row-level security|permission denied/);
    await db.query("update public.shows set title='Guest write' where tmdb_id=1396");
    expect((await db.query("select title from public.shows where tmdb_id=1396")).rows[0]).toEqual({ title: "Breaking Bad" });
    await expect(db.query("select public.seed_guest_demo($1,'UTC',null,'[]','[]',false)", [A])).rejects.toThrow(/permission denied/);
    await expect(db.query("select * from public.cleanup_guest_accounts(false)")).rejects.toThrow(/permission denied/);
    await asUser(REAL, false);
    expect((await db.query("select * from public.shows where tmdb_id=999")).rows).toHaveLength(1);
    await db.query("insert into public.user_shows(user_id,show_tmdb_id) values($1,999)", [REAL]);
    expect((await db.query("select * from public.user_shows")).rows).toHaveLength(1);
  });

  it("denies expired/missing sessions despite forged user metadata and retained JWTs", async () => {
    await seed();
    await db.query("update public.guest_sessions set expires_at=now() where user_id=$1", [A]);
    await asUser(A);
    for (const table of ["profiles", "user_preferences", "user_shows", "watched_episodes", "shows", "seasons", "episodes", "demo_catalogue"]) {
      expect((await db.query(`select * from public.${table}`)).rows).toEqual([]);
    }
    await expect(db.query("insert into public.watched_episodes(user_id,show_tmdb_id,season_number,episode_number) values($1,1396,1,3)", [A])).rejects.toThrow(/row-level security/);
    await owner(); await db.query("delete from public.guest_sessions where user_id=$1", [B]);
    await asUser(B); expect((await db.query("select * from public.shows")).rows).toEqual([]);
  });

  it("resumes idempotently and resets only its own data without extending expiry or changing timezone", async () => {
    await seed(A); await seed(B);
    const original = (await db.query<{ expires_at: Date }>("select * from public.guest_sessions where user_id=$1", [A])).rows[0];
    await db.query("update public.profiles set timezone='Asia/Tokyo' where id=$1", [A]);
    await db.query("update public.user_shows set favourite=false where user_id=$1", [A]);
    await seed(A);
    expect((await db.query("select favourite from public.user_shows where user_id=$1 and show_tmdb_id=1396", [A])).rows[0]).toEqual({ favourite: false });
    await seed(A, true);
    const restored = (await db.query<{ expires_at: Date }>("select * from public.guest_sessions where user_id=$1", [A])).rows[0];
    expect(restored.expires_at).toEqual(original.expires_at);
    expect((await db.query("select timezone from public.profiles where id=$1", [A])).rows[0]).toEqual({ timezone: "Asia/Tokyo" });
    expect((await db.query("select favourite,status from public.user_shows where user_id=$1 and show_tmdb_id=1396", [A])).rows[0]).toEqual({ favourite: true, status: "watching" });
    expect((await db.query("select status from public.user_shows where user_id=$1 and show_tmdb_id=2316", [A])).rows[0]).toEqual({ status: "dropped" });
    expect((await db.query("select * from public.user_shows where user_id=$1", [B])).rows).toHaveLength(5);
    await expect(seed(A, true)).rejects.toThrow(/Try again/);
    await expect(seed(REAL, true)).rejects.toThrow(/Demo access required/);
  });

  it("rolls back interrupted seeding and remains retryable", async () => {
    await expect(seed(A, false, [{ show_tmdb_id: 1396, season_number: 1, episode_number: 999 }])).rejects.toThrow(/foreign key/);
    expect((await db.query("select * from public.user_shows where user_id=$1", [A])).rows).toEqual([]);
    expect((await db.query("select seeded_at from public.guest_sessions where user_id=$1", [A])).rows[0]).toEqual({ seeded_at: null });
    await seed(A); expect((await db.query("select * from public.user_shows where user_id=$1", [A])).rows).toHaveLength(5);
  });

  it("rejects a changed timezone before any seed writes and keeps privileged RPCs service-only", async () => {
    await db.exec("set role service_role;");
    await expect(db.query("select public.seed_guest_demo($1,'UTC','Asia/Tokyo','[]','[]',false)", [A])).rejects.toThrow(/Timezone changed/);
    await owner();
    expect((await db.query("select * from public.user_shows where user_id=$1", [A])).rows).toEqual([]);
    for (const signature of ["public.seed_guest_demo(uuid,text,text,jsonb,jsonb,boolean)", "public.cleanup_guest_accounts(boolean)", "public.metadata_refresh_eligible_library_rows()"]) {
      const { rows } = await db.query<{ anon: boolean; authenticated: boolean; service: boolean }>(
        "select has_function_privilege('anon',$1,'EXECUTE') as anon,has_function_privilege('authenticated',$1,'EXECUTE') as authenticated,has_function_privilege('service_role',$1,'EXECUTE') as service", [signature]);
      expect(rows[0]).toEqual({ anon: false, authenticated: false, service: true });
    }
    await seed();
  });

  it("excludes guest-only metadata demand but retains real-user demand and dropped semantics", async () => {
    await seed();
    await db.exec("set role service_role;");
    expect((await db.query("select * from public.metadata_refresh_eligible_library_rows()")).rows).toEqual([]);
    await owner();
    await db.query("insert into public.user_shows(user_id,show_tmdb_id) values($1,1396),($1,999)", [REAL]);
    await db.query("update public.user_shows set status='dropped' where user_id=$1 and show_tmdb_id=999", [REAL]);
    await db.exec("set role service_role;");
    expect((await db.query<{ show_tmdb_id: number }>("select * from public.metadata_refresh_eligible_library_rows()")).rows.map((row) => row.show_tmdb_id)).toEqual([1396]);
  });

  it("dry run is read-only and cleanup preserves active guests, converted users and shared metadata", async () => {
    await seed(A); await seed(B);
    await db.query("update public.guest_sessions set expires_at=now() where user_id=$1", [A]);
    await db.query("insert into public.guest_sessions(user_id,expires_at) values($1,now()-interval '1 day')", [REAL]);
    await db.query("insert into auth.sessions values($1,$1)", [A]);
    await db.exec("set role service_role;");
    expect((await db.query("select * from public.cleanup_guest_accounts(true)")).rows[0]).toEqual({ eligible: 1, deleted: 0, remaining: 1 });
    expect((await db.query("select * from public.guest_sessions")).rows).toHaveLength(3);
    expect((await db.query("select * from public.cleanup_guest_accounts(false)")).rows[0]).toEqual({ eligible: 1, deleted: 1, remaining: 0 });
    await owner();
    expect((await db.query("select * from auth.users where id=$1", [REAL])).rows).toHaveLength(1);
    expect((await db.query("select * from public.user_shows where user_id=$1", [B])).rows).toHaveLength(5);
    expect((await db.query("select * from public.user_shows where user_id=$1", [A])).rows).toEqual([]);
    expect((await db.query("select * from public.watched_episodes where user_id=$1", [A])).rows).toEqual([]);
    expect((await db.query("select * from public.shows")).rows).toHaveLength(7);
    expect((await db.query("select * from auth.sessions")).rows).toEqual([]);
    expect((await db.query("select * from public.cleanup_guest_accounts(false)")).rows[0]).toEqual({ eligible: 0, deleted: 0, remaining: 0 });
  });

  it("bounds cleanup to 100 accounts and reports backlog", async () => {
    await db.exec("insert into auth.users(id,is_anonymous,created_at) select md5(n::text)::uuid,true,now()-interval '4 days' from generate_series(1,101) n;");
    await db.exec("set role service_role;");
    expect((await db.query("select * from public.cleanup_guest_accounts(false)")).rows[0]).toEqual({ eligible: 101, deleted: 100, remaining: 1 });
  });
});
