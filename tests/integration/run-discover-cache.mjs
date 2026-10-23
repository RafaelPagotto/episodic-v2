import { spawn } from "node:child_process";
import { once } from "node:events";
import { realpath, rm } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const app = path.join(root, "tests/integration/discover-cache-app");
const next = path.join(root, "node_modules/next/dist/bin/next");
const options = { cwd: root, stdio: "inherit", windowsHide: true, env: { ...process.env, TMDB_API_KEY: "" } };
async function run(args) {
  const child = spawn(process.execPath, args, options);
  const [code] = await once(child, "exit");
  if (code !== 0) throw new Error("Discover cache fixture failed");
}
await run([next, "build", app]);
// Reset generated fixture cache only, never the main application or database.
const resolvedApp = await realpath(app);
const generated = await realpath(path.join(app, ".next"));
if (!generated.startsWith(resolvedApp + path.sep)) throw new Error("Unexpected fixture output path");
await rm(path.join(generated, "cache/fetch-cache"), { recursive: true, force: true });
const probe = createServer();
await new Promise((resolve) => probe.listen(0, "127.0.0.1", resolve));
const port = probe.address().port;
await new Promise((resolve) => probe.close(resolve));
const base = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, [next, "start", app, "--port", String(port), "--hostname", "127.0.0.1"], options);
const closed = once(server, "exit");
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try { ready = (await fetch(`${base}/api/control`, { method: "POST", body: "{}" })).ok; } catch { /* Server is starting. */ }
    if (ready) break;
    if (server.exitCode !== null) throw new Error("Fixture server exited");
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (!ready) throw new Error("Fixture server did not start");
  await run([path.join(root, "tests/integration/discover-cache.mjs"), base]);
} finally { server.kill(); await closed; }
