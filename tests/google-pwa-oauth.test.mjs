import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPair, SignJWT } from "jose";
import { testDatabase } from "./support/database.mjs";
import { pwaGoogleConfig, googleConfig } from "../apps/web/server/accounts/google/config.mjs";
import { createGoogleHandlers } from "../apps/web/server/accounts/google/handlers.mjs";
import { createGoogleProvider } from "../apps/web/server/accounts/google/provider.mjs";
import { createSessionHandlers } from "../apps/web/server/accounts/sessions.mjs";
import { proxyBackend } from "../apps/pwa/lib/backend-proxy.mjs";

test("PWA OAuth preserves browser binding, PKCE and session cookies across the backend proxy", async () => {
 const storage = await testDatabase();
 try {
  for (const name of storage.migrations) await storage.migrate(name);
  const env = { APP_ORIGIN: "https://web.example.test", PWA_PUBLIC_ORIGIN: "https://pwa.example.test", PWA_BACKEND_ORIGIN: "http://backend.internal", PWA_BACKEND_PUBLIC_ORIGIN: "https://web.example.test", GOOGLE_CLIENT_ID: "synthetic-client", GOOGLE_CLIENT_SECRET: "synthetic-secret", NODE_ENV: "production" };
  const config = pwaGoogleConfig(env), { privateKey, publicKey } = await generateKeyPair("RS256");
  let idToken, exchanges = 0;
  const provider = createGoogleProvider(config, { keys: publicKey, fetch: async (url, options) => {
   exchanges++;
   assert.equal(url, "https://oauth2.googleapis.com/token");
   assert.equal(options.body.get("redirect_uri"), config.redirectUri);
   assert.ok(options.body.get("code_verifier").length >= 43);
   return Response.json({ id_token: idToken });
  } });
  const pwa = createGoogleHandlers(storage.db, config, { provider });
  const web = createGoogleHandlers(storage.db, googleConfig(env), { provider });
  const send = (url, options) => {
   const request = new Request(url, options);
   return url.pathname.endsWith("/callback") ? pwa.callback(request) : pwa.start(request);
  };
  const throughProxy = (method, path, { cookie, query = "", origin = env.PWA_PUBLIC_ORIGIN } = {}) => proxyBackend(new Request(`${env.PWA_PUBLIC_ORIGIN}/app/api/v1/${path}${query}`, { method, headers: { origin, ...(cookie ? { cookie } : {}) } }), { params: Promise.resolve({ path: path.split("/") }) }, env, send);
  const start = await throughProxy("POST", "auth/google/pwa");
  assert.equal(start.status, 200);
  const authorization = new URL((await start.json()).data.url), cookie = start.headers.getSetCookie()[0].split(";")[0];
  assert.match(cookie, /^__Host-imajilearn_pwa_google_flow=/);
  assert.match(start.headers.getSetCookie()[0], /HttpOnly; SameSite=Lax; Max-Age=600; Secure$/);
  assert.equal(authorization.searchParams.get("redirect_uri"), config.redirectUri);
  assert.equal(authorization.searchParams.get("code_challenge_method"), "S256");
  const query = `?state=${authorization.searchParams.get("state")}&code=synthetic-code`;
  const aliasCookie = cookie.replace("imajilearn_pwa_google_flow=", "imajilearn_google_flow=");
  const wrongApp = await web.callback(new Request(`${env.APP_ORIGIN}/api/v1/auth/google/callback${query}`, { headers: { cookie: aliasCookie } }));
  assert.equal(wrongApp.headers.get("location"), "/masuk?google=expired");
  assert.equal(exchanges, 0);
  const missingCookie = await throughProxy("GET", "auth/google/pwa/callback", { query });
  assert.equal(missingCookie.headers.get("location"), "/app/masuk?google=expired");
  assert.equal(exchanges, 0);
  idToken = await new SignJWT({ nonce: authorization.searchParams.get("nonce"), email: "pwa-google@example.test", email_verified: true, name: "PWA Teacher" }).setProtectedHeader({ alg: "RS256" }).setSubject("pwa-sub").setIssuer("https://accounts.google.com").setAudience(config.clientId).setIssuedAt().setExpirationTime("5m").sign(privateKey);
  const complete = await throughProxy("GET", "auth/google/pwa/callback", { query, cookie });
  assert.equal(complete.status, 303);
  assert.equal(complete.headers.get("location"), "/app/beranda?google=signed_in");
  const session = complete.headers.getSetCookie().find(value => value.startsWith("__Host-imajilearn_session="));
  assert.ok(session);
  assert.equal(complete.headers.getSetCookie().length, 2);
  assert.equal(complete.headers.get("cache-control"), "no-store");
  const teacher = await createSessionHandlers(storage.db, config).requireTeacher(new Request(`${env.PWA_PUBLIC_ORIGIN}/app/api/v1/auth/session`, { headers: { cookie: session.split(";")[0] } }));
  assert.equal(teacher.email, "pwa-google@example.test");
  const replay = await throughProxy("GET", "auth/google/pwa/callback", { query, cookie });
  assert.equal(replay.headers.get("location"), "/app/masuk?google=expired");
  assert.equal(exchanges, 1);
  assert.equal((await throughProxy("POST", "auth/google/pwa", { origin: "https://attacker.test" })).status, 403);
  assert.equal((await pwa.start(new Request(`${env.APP_ORIGIN}/api/v1/auth/google/pwa`, { method: "POST", headers: { origin: env.APP_ORIGIN } }))).status, 403);
  const cancelledStart = await throughProxy("POST", "auth/google/pwa");
  const cancelledUrl = new URL((await cancelledStart.json()).data.url);
  const cancelled = await throughProxy("GET", "auth/google/pwa/callback", { cookie: cancelledStart.headers.getSetCookie()[0].split(";")[0], query: `?state=${cancelledUrl.searchParams.get("state")}&error=access_denied` });
  assert.equal(cancelled.headers.get("location"), "/app/masuk?google=cancelled");
  assert.equal(exchanges, 1);
 } finally { await storage.close(); }
});
