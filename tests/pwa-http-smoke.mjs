import assert from "node:assert/strict";
import { createServer } from "node:net";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { testDatabase } from "./support/database.mjs";
import { startNode, stopNode } from "./support/process.mjs";

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
  const env = { ...process.env, NODE_ENV: "development", APP_ORIGIN: origin,
    PWA_INTERNAL_ORIGIN: `http://127.0.0.1:${pwaPort}`, DATABASE_URL: storage.connectionUrl() };
  pwa = startNode(["node_modules/next/dist/bin/next", "dev", "apps/pwa", "--hostname", "127.0.0.1", "--port", String(pwaPort)], { env });
  await ready(`${env.PWA_INTERNAL_ORIGIN}/app`, pwa);
  web = startNode(["node_modules/next/dist/bin/next", "dev", "apps/web", "--hostname", "127.0.0.1", "--port", String(webPort)], { env });
  await ready(`${origin}/app`, web);
  const page = await fetch(`${origin}/app`);
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.match(html, /ImajiLearn PWA/);
  assert.match(html, /mascot-book/);
  for (const path of ["/brand/imajilearn-mark.svg", "/brand/imajilearn-wordmark.svg", "/lkpd/pancasila/star.svg"]) {
    const assetResponse = await fetch(`${origin}${path}`);
    assert.equal(assetResponse.status, 200);
    assert.match(await assetResponse.text(), /<svg/);
  }
  const asset = html.match(/src="(\/app\/_next\/static\/[^"\s]+\.js[^"\s]*)"/);
  assert.ok(asset, "PWA scripts must retain /app/_next rather than collide with web assets");
  assert.equal((await fetch(`${origin}${asset[1].replaceAll("&amp;", "&")}`)).status, 200);
  assert.match(await (await fetch(`${origin}/masuk`)).text(), /Masuk ke ImajiLearn/);
  const request = (path, { method = "GET", cookie, body, requestOrigin = origin } = {}) => fetch(`${origin}/api/v1${path}`, {
    method, headers: { Origin: requestOrigin, ...(cookie ? { Cookie: cookie } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined,
  });
  assert.equal((await request("/auth/session")).status, 401);
  const registered = await request("/auth/register", { method: "POST", body: {
    name: "PWA synthetic teacher", email: `pwa-${randomUUID()}@example.test`, password: "Synthetic password" } });
  assert.equal(registered.status, 201);
  const cookie = registered.headers.get("set-cookie").split(";")[0];
  const user = (await registered.json()).data.user;
  const session = await request("/auth/session", { cookie });
  assert.equal(session.status, 200);
  assert.equal((await session.json()).data.user.id, user.id);
  const profile = await request("/me", { cookie });
  assert.equal(profile.status, 200);
  assert.equal((await profile.json()).data.id, user.id);
  assert.equal((await request("/me", { method: "PATCH", cookie, requestOrigin: env.PWA_INTERNAL_ORIGIN,
    body: { name: "Wrong origin" } })).status, 403);
  assert.equal((await request("/auth/logout", { method: "POST", cookie })).status, 204);
  assert.equal((await request("/auth/session", { cookie })).status, 401);
  console.log("PWA same-origin routing, assets and backend session integration passed.");
} finally {
  try { await stopNode(web); } finally {
    try { await stopNode(pwa); } finally { await storage.close(); }
  }
}
