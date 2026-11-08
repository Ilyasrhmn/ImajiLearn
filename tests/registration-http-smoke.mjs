import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { setTimeout } from "node:timers/promises";

const base = process.env.TEST_BASE_URL, origin = process.env.TEST_APP_ORIGIN;
if (!base || !origin) throw new Error("Set TEST_BASE_URL and TEST_APP_ORIGIN for an isolated test deployment.");
let ready = false;
for (let attempt = 0; attempt < 100; attempt++) {
  try {
    const response = await fetch(`${base}/api/v1/auth/register`);
    if (response.status === 405) { ready = true; break; }
  } catch { /* The test server may still be starting. */ }
  await setTimeout(100);
}
assert.ok(ready, "Registration route did not become ready within 10 seconds");
const body = { name: "Synthetic HTTP Teacher", email: `registration-${randomUUID()}@example.test`, password: "Synthetic HTTP password" };
const send = (value, headers = {}) => fetch(`${base}/api/v1/auth/register`, {
  method: "POST", headers: { origin, "content-type": "application/json", ...headers }, body: JSON.stringify(value),
});
const registered = await send(body);
assert.equal(registered.status, 201);
assert.equal(registered.headers.get("cache-control"), "no-store");
assert.match(registered.headers.get("set-cookie"), /HttpOnly; SameSite=Lax/);
if (origin.startsWith("https://")) {
  assert.match(registered.headers.get("set-cookie"), /^__Host-imajilearn_session=/);
  assert.match(registered.headers.get("set-cookie"), /; Secure$/);
}
const data = (await registered.json()).data;
assert.equal(data.user.email, body.email);
assert.ok(Date.parse(data.expiresAt) > Date.now());
assert.ok(!JSON.stringify(data).includes(body.password));
assert.equal((await send(body)).status, 409);
assert.equal((await send({ ...body, password: "short" })).status, 422);
assert.equal((await send(body, { origin: "https://foreign.example" })).status, 403);
console.log("Registration HTTP smoke passed: account, private session cookie, duplicate/validation/Origin guards.");
