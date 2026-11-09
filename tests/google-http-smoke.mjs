import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const base = process.env.TEST_BASE_URL;
const origin = process.env.TEST_APP_ORIGIN;
assert.ok(base && origin, "Run through npm run test:http.");
const send = (path, body, cookie) => fetch(`${base}/api/v1/${path}`, {
  method: "POST", headers: { origin, "content-type": "application/json", ...(cookie ? { cookie } : {}) },
  body: body === undefined ? undefined : JSON.stringify(body), redirect: "manual",
});
const start = await send("auth/google");
assert.equal(start.status, 200);
assert.equal(start.headers.get("cache-control"), "no-store");
const authorization = new URL((await start.json()).data.url);
assert.equal(authorization.origin, "https://accounts.google.com");
assert.equal(authorization.searchParams.get("redirect_uri"), `${origin}/api/v1/auth/google/callback`);
assert.equal(authorization.searchParams.get("scope"), "openid email profile");
assert.equal(authorization.searchParams.get("code_challenge_method"), "S256");
assert.equal(authorization.searchParams.has("client_secret"), false);
const flowCookie = start.headers.get("set-cookie").split(";")[0];
async function cancel(url, cookie) {
  const callback = new URL(`${base}/api/v1/auth/google/callback`);
  callback.searchParams.set("state", url.searchParams.get("state"));
  callback.searchParams.set("error", "access_denied");
  return fetch(callback, { headers: { cookie }, redirect: "manual" });
}
const cancelled = await cancel(authorization, flowCookie);
assert.equal(cancelled.status, 303);
assert.equal(cancelled.headers.get("location"), "/masuk?google=cancelled");
assert.match(cancelled.headers.get("set-cookie"), /Max-Age=0/);
assert.equal((await cancel(authorization, flowCookie)).headers.get("location"), "/masuk?google=expired");
assert.equal((await fetch(`${base}/api/v1/auth/google/callback?state=invalid&code=private`, { redirect: "manual" })).headers.get("location"), "/masuk?google=expired");

const password = "Synthetic Google link password";
const registration = await send("auth/register", { name: "Google Link HTTP", email: `google-link-${randomUUID()}@example.test`, password });
assert.equal(registration.status, 201);
const sessionCookie = registration.headers.get("set-cookie").split(";")[0];
const me = await fetch(`${base}/api/v1/me`, { headers: { cookie: sessionCookie } });
assert.equal(me.status, 200);
assert.deepEqual((await me.json()).data.auth, { hasPassword: true, googleLinked: false, googleEnabled: true });
assert.equal((await send("me/google/link", { currentPassword: "wrong" }, sessionCookie)).status, 422);
const link = await send("me/google/link", { currentPassword: password }, sessionCookie);
assert.equal(link.status, 200);
const linkUrl = new URL((await link.json()).data.url);
const cancelledLink = await cancel(linkUrl, `${sessionCookie}; ${link.headers.get("set-cookie").split(";")[0]}`);
assert.equal(cancelledLink.headers.get("location"), "/akun?google=cancelled");
console.log("Google HTTP smoke passed: production routes, PKCE/browser binding, cancellation/replay, account capability and password-authorized link start.");
