import assert from "node:assert/strict";
// Run against the isolated production fixture, never the application's routes.
const base = process.argv[2];
if (!base || !/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base)) throw new Error("Pass an isolated localhost fixture URL");
async function control(body) { return (await fetch(`${base}/api/control`, { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } })).json(); }
async function listing(query = "") { const response = await fetch(`${base}/api/list${query}`); return { status: response.status, ...await response.json() }; }
const hour = 3600_000;
const first = await listing();
assert.equal(first.status, 200); assert.equal(first.data.freshness, "fresh");
const second = await listing();
assert.equal(second.calls, first.calls); assert.deepEqual(second.data, first.data);
await control({ advance: 6 * hour + 1100 });
const stale = await listing();
assert.equal(stale.status, 200); assert.equal(stale.data.freshness, "stale"); assert.equal(stale.data.fetchedAt, first.data.fetchedAt);
let fresh;
for (let i = 0; i < 20; i++) { await new Promise((r) => setTimeout(r, 100)); fresh = await listing(); if (fresh.data?.freshness === "fresh") break; }
assert.equal(fresh.data.freshness, "fresh"); assert.notEqual(fresh.data.fetchedAt, first.data.fetchedAt);
await control({ fail: true, advance: 6 * hour + 1100 });
const failedStale = await listing(); assert.equal(failedStale.status, 200); assert.equal(failedStale.data.freshness, "stale"); assert.equal(failedStale.data.fetchedAt, fresh.data.fetchedAt);
await new Promise((r) => setTimeout(r, 200));
await control({ advance: 18 * hour });
const overAge = await listing(); assert.equal(overAge.status, 503); assert.equal(overAge.unavailable, true);
const coldFailure = await listing("?feed=trending"); assert.equal(coldFailure.status, 503);
await control({ fail: false });
let recovered;
for (let i = 0; i < 20; i++) { recovered = await listing(); if (recovered.status === 200) break; await new Promise((r) => setTimeout(r, 100)); }
assert.equal(recovered.status, 200); assert.equal(recovered.data.freshness, "fresh");
const top = await listing("?feed=top-rated"); assert.equal(top.data.freshness, "fresh");
await control({ advance: 24 * hour + 1100, fail: true });
const topStale = await listing("?feed=top-rated"); assert.equal(topStale.data.freshness, "stale");
await new Promise((r) => setTimeout(r, 200));
await control({ advance: 48 * hour });
assert.equal((await listing("?feed=top-rated")).status, 503);
console.info("PASS: Next.js production Data Cache reuse, successful/failed revalidation, unchanged timestamps, cold errors, recovery, 24h/72h maximum age.");
