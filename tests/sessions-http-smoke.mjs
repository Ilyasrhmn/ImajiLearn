import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { setTimeout } from "node:timers/promises";

const base = process.env.TEST_BASE_URL, origin = process.env.TEST_APP_ORIGIN;
if (!base || !origin) throw new Error("Set TEST_BASE_URL and TEST_APP_ORIGIN for an isolated test deployment.");
let ready = false;
for (let attempt = 0; attempt < 100; attempt++) {
  try { if ((await fetch(`${base}/api/v1/auth/register`)).status === 405) { ready = true; break; } }
  catch { /* Wait for the isolated test server. */ }
  await setTimeout(100);
}
assert.ok(ready, "Auth routes did not start within 10 seconds");
function send(method, path, body, cookie, headers = {}) {
  return fetch(`${base}/api/v1/auth/${path}`, { method,
    headers: { ...(method === "GET" ? {} : { origin, "content-type": "application/json" }), ...(cookie ? { cookie } : {}), ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
const privatePages = ["/beranda", "/dashboard", "/akun", "/jadwal", "/ujian", "/lkpd"];
async function expectPrivateRedirect(path, cookie) {
  const response = await fetch(`${base}${path}`, {
    redirect: "manual", headers: cookie ? { cookie } : {},
  });
  assert.equal(response.status, 307, path);
  assert.equal(response.headers.get("location"), "/masuk", path);
}
for (const path of privatePages) await expectPrivateRedirect(path);
for (const path of ["/masuk", "/daftar"]) {
  assert.equal((await fetch(`${base}${path}`, { redirect: "manual" })).status, 200);
}
assert.equal((await send("GET", "session")).status, 401);
const body = { name: "Synthetic Sessions", email: `sessions-${randomUUID()}@example.test`, password: "  Synthetic 密碼🙂  " };
const registered = await send("POST", "register", body);
assert.equal(registered.status, 201);
const original = registered.headers.get("set-cookie").split(";")[0];
assert.equal((await send("GET", "session", undefined, original)).status, 200);
const logged = await send("POST", "login", { email: body.email.toUpperCase(), password: body.password }, original);
assert.equal(logged.status, 200);
const cookie = logged.headers.get("set-cookie").split(";")[0];
assert.notEqual(cookie, original);
assert.equal((await send("GET", "session", undefined, original)).status, 401);
const current = await send("GET", "session", undefined, cookie);
assert.equal(current.status, 200); assert.equal(current.headers.get("cache-control"), "no-store");
assert.equal((await current.json()).data.user.email, body.email);
for (const path of privatePages) {
  const response = await fetch(`${base}${path}`, { redirect: "manual", headers: { cookie } });
  assert.equal(response.status, 200, path);
  assert.match(response.headers.get("cache-control"), /\bno-store\b/, path);
}
await expectPrivateRedirect("/dashboard", original);
assert.equal((await send("POST", "login", { email: body.email, password: "wrong" }, cookie)).status, 401);
assert.equal((await send("GET", "session", undefined, cookie)).status, 200);
assert.equal((await send("POST", "logout", undefined, cookie, { origin: "https://foreign.example" })).status, 403);
for (let i = 0; i < 2; i++) {
  const response = await send("POST", "logout", undefined, cookie);
  assert.equal(response.status, 204); assert.equal(await response.text(), "");
}
assert.equal((await send("GET", "session", undefined, cookie)).status, 401);
for (const path of privatePages) await expectPrivateRedirect(path, cookie);
console.log("Sessions HTTP smoke passed: JSON401, login rotation, protected pages, Origin protection, idempotent logout.");
