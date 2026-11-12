import assert from "node:assert/strict";
import { createServer } from "node:net";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { testDatabase } from "./support/database.mjs";
import { runNode, startNode, stopNode } from "./support/process.mjs";

const production = process.argv.includes("--production");

async function freePort() {
  const server = createServer();
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const port = server.address().port;
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return port;
}

async function ready(url, server) {
  for (let attempt = 0; attempt < 90; attempt++) {
    if (server.child.exitCode !== null) throw new Error("PWA integration server exited before readiness.");
    try { if ((await fetch(url, { signal: AbortSignal.timeout(3000) })).ok) return; } catch { /* Startup. */ }
    await delay(500);
  }
  throw new Error("PWA integration server did not become ready.");
}

const storage = await testDatabase({ socketConnections: 8 });
let web, pwa;
try {
  for (const migration of storage.migrations) await storage.migrate(migration);
  const webPort = await freePort(), pwaPort = await freePort();
  const origin = `http://127.0.0.1:${webPort}`;
  // HTTPS is the configured security boundary; the local transport only tests
  // production routing/session behavior, not browser TLS or installation.
  const appOrigin = production ? "https://pwa-smoke.example.test" : origin;
  const env = { ...process.env, NODE_ENV: production ? "production" : "development", APP_ORIGIN: appOrigin,
    IMAJILEARN_TEST_BUILD: production ? "pwa-production" : "pwa-http",
    PWA_INTERNAL_ORIGIN: `http://127.0.0.1:${pwaPort}`, DATABASE_URL: storage.connectionUrl(),
    PWA_BACKEND_ORIGIN: origin, PWA_BACKEND_PUBLIC_ORIGIN: appOrigin,
    PWA_PUBLIC_ORIGIN: production ? "https://pwa-direct.example.test" : `http://127.0.0.1:${pwaPort}` };
  if (production) {
    for (const app of ["pwa", "web"]) await runNode(["node_modules/next/dist/bin/next", "build", `apps/${app}`], { env });
  }
  const command = production ? "start" : "dev";
  pwa = startNode(["node_modules/next/dist/bin/next", command, "apps/pwa", "--hostname", "127.0.0.1", "--port", String(pwaPort)], { env });
  await ready(`${env.PWA_INTERNAL_ORIGIN}/app`, pwa);
  web = startNode(["node_modules/next/dist/bin/next", command, "apps/web", "--hostname", "127.0.0.1", "--port", String(webPort)], { env });
  await ready(`${origin}/app`, web);
  const directRoot = await fetch(env.PWA_INTERNAL_ORIGIN, { redirect: "manual" });
  assert.equal(directRoot.status, 307);
  assert.equal(directRoot.headers.get("location"), "/app");
  const direct = (path, { method = "GET", cookie, body, requestOrigin = env.PWA_PUBLIC_ORIGIN } = {}) => fetch(`${env.PWA_INTERNAL_ORIGIN}/app/api/v1${path}`, {
    method, headers: { origin: requestOrigin, ...(cookie ? { cookie } : {}), ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  assert.equal((await direct("/auth/session")).status, 401);
  const directRegistration = await direct("/auth/register", { method: "POST", body: {
    name: "Direct PWA teacher", email: `direct-${randomUUID()}@example.test`, password: "Synthetic password" } });
  assert.equal(directRegistration.status, 201);
  const directCookie = directRegistration.headers.get("set-cookie").split(";")[0];
  const directUser = (await directRegistration.json()).data.user;
  assert.equal((await direct("/auth/session", { cookie: directCookie })).status, 200);
  assert.equal((await direct("/materials", { cookie: directCookie })).status, 200);
  assert.equal((await direct("/me", { method: "PATCH", cookie: directCookie, body: { name: "Updated PWA teacher" } })).status, 200);
  assert.equal((await direct("/me", { method: "PATCH", cookie: directCookie, requestOrigin: "https://foreign.example", body: { name: "Denied" } })).status, 403);
  assert.equal((await direct("/auth/logout", { method: "POST", cookie: directCookie })).status, 204);
  assert.equal((await direct("/auth/session", { cookie: directCookie })).status, 401);
  const directLogin = await direct("/auth/login", { method: "POST", body: {
    email: directUser.email, password: "Synthetic password" } });
  assert.equal(directLogin.status, 200);
  const loginCookie = directLogin.headers.get("set-cookie").split(";")[0];
  assert.equal((await direct("/me", { cookie: loginCookie })).status, 200);
  assert.equal((await direct("/auth/logout", { method: "POST", cookie: loginCookie })).status, 204);
  const page = await fetch(`${origin}/app`);
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.match(html, /ImajiLearn/);
  const signIn = await fetch(`${origin}/app/masuk`);
  assert.equal(signIn.status, 200);
  const authHtml = await signIn.text();
  assert.match(authHtml, /mascot-book/);
  assert.match(authHtml, /name="email"/);
  assert.match(authHtml, /name="password"/);
  assert.match(authHtml, /\/app\/daftar/);
  const manifest = await (await fetch(`${origin}/app/manifest.webmanifest`)).json();
  assert.equal(manifest.scope, "/app/");
  assert.equal(manifest.start_url, "/app/beranda");
  assert.equal(manifest.display, "standalone");
  for (const icon of manifest.icons) {
    const response = await fetch(`${origin}${icon.src}`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /image\/png/);
    assert.deepEqual([...new Uint8Array(await response.arrayBuffer()).slice(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  }
  for (const path of ["/app/sw.js", "/app/offline.html", ...manifest.icons.map(icon => icon.src)]) assert.equal((await fetch(`${origin}${path}`)).status, 200);
  const worker = await fetch(`${origin}/app/sw.js`);
  assert.match(worker.headers.get("cache-control"), /no-store/);
  assert.equal(worker.headers.get("service-worker-allowed"), "/app/");
  assert.equal((await fetch(`${origin}/app/lkpd`, { redirect: "manual" })).status, 404);
  assert.equal((await fetch(`${origin}/lkpd/pancasila/star.svg`)).status, 404);
  for (const path of ["/app/daftar", "/app/beranda", "/app/materi", "/app/akun", "/app/ujian", "/app/jadwal"]) {
    const screen = await fetch(`${origin}${path}`);
    assert.equal(screen.status, 200, path);
    assert.doesNotMatch(await screen.text(), /PWA synthetic teacher/);
  }
  for (const path of ["/brand/imajilearn-mark.svg", "/brand/imajilearn-wordmark.svg"]) {
    const assetResponse = await fetch(`${origin}${path}`);
    assert.equal(assetResponse.status, 200);
    assert.match(await assetResponse.text(), /<svg/);
  }
  const asset = html.match(/src="(\/app\/_next\/static\/[^"\s]+\.js[^"\s]*)"/);
  assert.ok(asset, "PWA scripts must retain /app/_next rather than collide with web assets");
  assert.equal((await fetch(`${origin}${asset[1].replaceAll("&amp;", "&")}`)).status, 200);
  assert.match(await (await fetch(`${origin}/masuk`)).text(), /Masuk ke ImajiLearn/);
  const request = (path, { method = "GET", cookie, body, requestOrigin = appOrigin } = {}) => fetch(`${origin}/api/v1${path}`, {
    method, headers: { Origin: requestOrigin, ...(cookie ? { Cookie: cookie } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined,
  });
  assert.equal((await request("/auth/session")).status, 401);
  const registered = await request("/auth/register", { method: "POST", body: {
    name: "PWA synthetic teacher", email: `pwa-${randomUUID()}@example.test`, password: "Synthetic password" } });
  assert.equal(registered.status, 201);
  if (production) {
    const sessionCookie = registered.headers.get("set-cookie");
    assert.match(sessionCookie, /^__Host-/);
    assert.match(sessionCookie, /; Secure/i);
    assert.match(sessionCookie, /; HttpOnly/i);
    assert.match(sessionCookie, /; Path=\/(?:;|$)/i);
    assert.doesNotMatch(sessionCookie, /; Domain=/i);
  }
  const cookie = registered.headers.get("set-cookie").split(";")[0];
  const user = (await registered.json()).data.user;
  const session = await request("/auth/session", { cookie });
  assert.equal(session.status, 200);
  assert.match(session.headers.get("cache-control"), /no-store/);
  assert.equal((await session.json()).data.user.id, user.id);
  const profile = await request("/me", { cookie });
  assert.equal(profile.status, 200);
  assert.match(profile.headers.get("cache-control"), /no-store/);
  assert.equal((await profile.json()).data.id, user.id);
  assert.equal((await request("/me", { method: "PATCH", cookie, requestOrigin: env.PWA_INTERNAL_ORIGIN,
    body: { name: "Wrong origin" } })).status, 403);
  assert.equal((await request("/auth/logout", { method: "POST", cookie })).status, 204);
  assert.equal((await request("/auth/session", { cookie })).status, 401);
  console.log(`PWA ${command} same-origin routing, assets and backend session integration passed.`);
} finally {
  try { await stopNode(web); } finally {
    try { await stopNode(pwa); } finally { await storage.close(); }
  }
}
