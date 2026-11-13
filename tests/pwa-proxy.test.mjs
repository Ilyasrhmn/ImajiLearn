import test from "node:test";
import assert from "node:assert/strict";
import { proxyBackend } from "../apps/pwa/lib/backend-proxy.mjs";
import { apiPath } from "@imajilearn/shared/lib/session.mjs";

const env = { NODE_ENV: "test" };
const context = { params: Promise.resolve({ path: ["auth", "login"] }) };
const request = origin => new Request("http://localhost:3002/app/api/v1/auth/login", { method: "POST", headers: { origin, "content-type": "application/json" }, body: '{"email":"synthetic@example.test"}' });
test("direct PWA requests preserve credentials, statuses and session cookies", async () => {
  const response = await proxyBackend(request("http://localhost:3002"), context, env, async (url, options) => {
    assert.equal(url.href, "http://localhost:3000/api/v1/auth/login");
    assert.equal(options.headers.get("origin"), "http://localhost:3000");
    assert.match(await new Response(options.body).text(), /synthetic@example.test/);
    return Response.json({ data: { id: "teacher" } }, { status: 201, headers: { "set-cookie": "session=synthetic; Path=/; HttpOnly; SameSite=Lax" } });
  });
  assert.equal(response.status, 201);
  assert.match(response.headers.get("set-cookie"), /HttpOnly/);
  assert.equal(response.headers.get("cache-control"), "no-store");
});
test("foreign and missing origins are denied before reaching backend", async () => {
  for (const origin of ["https://foreign.test", "null", ""]) {
    const response = await proxyBackend(request(origin), context, env, () => { throw Error("Must not run"); });
    assert.equal(response.status, 403);
  }
});
test("offline backend returns JSON and invalid production config fails closed", async () => {
  const unavailable = await proxyBackend(request("http://localhost:3002"), context, env, () => { throw Error("offline"); });
  assert.equal(unavailable.status, 502);
  assert.match((await unavailable.json()).error.message, /dihubungi/);
  assert.equal((await proxyBackend(request("http://localhost:3002"), context, { NODE_ENV: "production" })).status, 503);
});
test("web and PWA clients address their own API entrypoints", () => {
  assert.equal(apiPath("/me", "/app/akun"), "/app/api/v1/me");
  assert.equal(apiPath("/me", "/app"), "/app/api/v1/me");
  assert.equal(apiPath("/me", "/akun"), "/api/v1/me");
  assert.equal(apiPath("/me", "/apple"), "/api/v1/me");
});


test("PWA OAuth preserves the validated browser origin and slow requests return an explicit timeout", async () => {
  const oauth = { params: Promise.resolve({ path: ["auth", "google", "pwa"] }) };
  const response = await proxyBackend(request("http://localhost:3002"), oauth, env, async (_url, options) => {
    assert.equal(options.headers.get("origin"), "http://localhost:3002");
    return Response.json({ data: {} });
  });
  assert.equal(response.status, 200);
  const timedOut = await proxyBackend(request("http://localhost:3002"), context, env,
    () => { throw new DOMException("deadline", "TimeoutError"); });
  assert.equal(timedOut.status, 504);
  assert.match((await timedOut.json()).error.message, /progres/);
});
