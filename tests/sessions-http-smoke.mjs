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
assert.equal((await send("POST", "login", { email: body.email, password: "wrong" }, cookie)).status, 401);
assert.equal((await send("GET", "session", undefined, cookie)).status, 200);
assert.equal((await send("POST", "logout", undefined, cookie, { origin: "https://foreign.example" })).status, 403);
for (let i = 0; i < 2; i++) {
  const response = await send("POST", "logout", undefined, cookie);
  assert.equal(response.status, 204); assert.equal(await response.text(), "");
}
assert.equal((await send("GET", "session", undefined, cookie)).status, 401);
console.log("Sessions HTTP smoke passed: JSON401, login rotation, private session, Origin protection, idempotent logout.");
