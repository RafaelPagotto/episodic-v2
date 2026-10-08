import { createServer } from "node:http";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { build } from "esbuild";

// Browser-only fixture: real React/forms, fake CAPTCHA and actions, no Auth/DB calls.
const root = fileURLToPath(new URL("../../", import.meta.url));
const mocks = {
  "next/script": `import { useEffect } from 'react'; export default function Script({onReady}) { useEffect(() => { onReady(); }, []); return null; }`,
  "next/link": `import React from 'react'; export default function Link(props) { return <a {...props}/>; }`,
  actions: `export const signInAction = (state, data) => window.qa.request('sign-in', data);
    export const startGuestDemoAction = (state, data) => window.qa.request('demo', data);
    export const exitGuestDemoAction = async () => ({ status: 'success', message: 'Exited.' });`,
};
const result = await build({
  stdin: {
    resolveDir: root,
    loader: "tsx",
    contents: `import React from 'react';
      import { createRoot } from 'react-dom/client';
      import { SharedAuthCaptcha } from './features/auth/components/shared-auth-captcha';
      import { SignInForm } from './features/auth/components/sign-in-form';
      import { DemoEntry } from './features/guest/components/demo-entry';
      import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './components/ui/card';
      window.qa = { calls: [], resets: 0, tokenNumber: 0, finish: null, options: null,
        request(kind, data) {
          this.calls.push({kind, data: Object.fromEntries(data.entries())});
          this.report();
          return new Promise(resolve => { this.finish = resolve; });
        },
        report() { document.getElementById('qa-report').textContent = JSON.stringify({calls: this.calls, resets: this.resets}); }
      };
      window.turnstile = {
        render(element, options) {
          window.qa.options = options;
          const button = document.createElement('button');
          button.type = 'button'; button.textContent = 'Verify test check';
          button.className = 'border p-3 text-sm';
          button.onclick = () => { options.callback('fixture-token-' + ++window.qa.tokenNumber); button.textContent = 'Test check verified'; };
          element.replaceChildren(button); return 'test-widget';
        },
        reset() { ++window.qa.resets; const button = document.querySelector('[aria-label="Security check"] button'); if (button) button.textContent = 'Verify test check'; window.qa.report(); },
        remove() { document.querySelector('[aria-label="Security check"]')?.replaceChildren(); }
      };
      createRoot(document.getElementById('root')).render(
        <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10 sm:px-6">
          <div className="w-full max-w-md space-y-7">
            <div className="text-center"><p className="text-3xl font-semibold">Episodic</p><p className="mt-2 text-sm text-muted-foreground">Build your personal library and track your shows.</p></div>
            <Card><CardHeader><CardTitle>Sign in</CardTitle><CardDescription>Use your account to open your library.</CardDescription></CardHeader>
              <CardContent><SharedAuthCaptcha><SignInForm/><DemoEntry/></SharedAuthCaptcha></CardContent>
            </Card>
          </div>
        </main>
      );
      document.getElementById('qa-finish-error').onclick = () => window.qa.finish?.({status:'error',message:'Fixture authentication failed.'});
      document.getElementById('qa-finish-success').onclick = () => window.qa.finish?.({status:'success',message:'Fixture authentication succeeded.'});
      document.getElementById('qa-expire').onclick = () => window.qa.options['expired-callback']();
      document.getElementById('qa-fail').onclick = () => window.qa.options['error-callback']();
      document.getElementById('qa-race').onclick = () => document.querySelector('form').requestSubmit();`,
  },
  bundle: true,
  write: false,
  jsx: "automatic",
  define: {
    "process.env.NODE_ENV": '"development"',
    "process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY": '"fixture-public-site-key"',
  },
  plugins: [{ name: "fixture-dependencies", setup(bundler) {
    bundler.onResolve({ filter: /^(next\/(script|link)|@\/features\/auth\/actions|\.\.\/actions)$/ }, ({ path: modulePath }) => ({
      path: modulePath in mocks ? modulePath : "actions", namespace: "fixture",
    }));
    bundler.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path: modulePath }) => ({ contents: mocks[modulePath], loader: "jsx", resolveDir: root }));
  } }],
});
const cssDirectory = path.join(root, ".next/static/css");
const cssFiles = (await readdir(cssDirectory)).filter((name) => name.endsWith(".css"));
let css = "";
for (const name of cssFiles) css += await readFile(path.join(cssDirectory, name), "utf8");
const html = `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Shared CAPTCHA browser fixture</title><link rel="stylesheet" href="/app.css"></head>
  <body><div id="root"></div><aside aria-label="Test controls" class="border-t p-4 space-x-3">
    <button id="qa-finish-error">Finish with error</button><button id="qa-finish-success">Finish with success</button>
    <button id="qa-expire">Expire test token</button><button id="qa-fail">Fail test check</button><button id="qa-race">Attempt concurrent sign-in</button>
    <pre id="qa-report" class="whitespace-pre-wrap break-all"></pre></aside><script src="/app.js"></script></body></html>`;
const server = createServer((request, response) => {
  response.setHeader("Cache-Control", "no-store");
  if (request.url === "/app.js") { response.setHeader("Content-Type", "application/javascript"); response.end(result.outputFiles[0].contents); }
  else if (request.url === "/app.css") { response.setHeader("Content-Type", "text/css"); response.end(css); }
  else if (request.url === "/") { response.setHeader("Content-Type", "text/html"); response.end(html); }
  else { response.statusCode = 404; response.end(); }
});
server.listen(0, "127.0.0.1", () => console.info(`Shared CAPTCHA fixture: http://127.0.0.1:${server.address().port}`));
process.on("SIGINT", () => server.close());
