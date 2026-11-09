import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { digest } from "../apps/web/server/core/crypto.mjs";
import { testDatabase } from "./support/database.mjs";
import { createRegistrationHandler } from "../apps/web/server/accounts/registration.mjs";

const origin = "http://localhost:3000", password = "  Synthetic 密碼🙂  ";
let storage, auth, createSessionHandlers, a, b;
function req(method, path, body, { cookie, headers = {} } = {}) {
  return new Request(`${origin}/api/v1/auth/${path}`, { method,
    headers: { ...(method === "GET" ? {} : { origin, "content-type": "application/json" }), ...(cookie ? { cookie } : {}), ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
async function account(label) {
  const email = `${label}@example.test`;
  const response = await createRegistrationHandler(storage.db, { origin, registerLimit: 200 })(req("POST", "register", { name: label, email, password }));
  assert.equal(response.status, 201);
  return { email, id: (await response.json()).data.user.id, cookie: response.headers.get("set-cookie").split(";")[0] };
}
const read = cookie => auth.session(req("GET", "session", undefined, { cookie }));
const login = (email, secret = password, options) => auth.login(req("POST", "login", { email, password: secret }, options));
before(async () => {
  ({ createSessionHandlers } = await import("../apps/web/server/accounts/sessions.mjs"));
  storage = await testDatabase();
  for (const name of storage.migrations) await storage.migrate(name);
  auth = createSessionHandlers(storage.db, { origin, loginIpLimit: 200 });
  a = await account("session-a"); b = await account("session-b");
});
after(async () => { await storage?.close(); });

test("session GET without Origin returns only the current teacher and absolute expiry", async () => {
  for (const user of [a, b]) {
    const response = await read(user.cookie);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const body = await response.json();
    assert.equal(body.data.user.id, user.id); assert.equal(body.data.user.email, user.email);
    assert.ok(Date.parse(body.data.expiresAt) > Date.now());
    for (const secret of ["passwordHash", "tokenHash", password, user.cookie.split("=")[1]]) assert.ok(!JSON.stringify(body).includes(secret));
    assert.deepEqual(await auth.requireTeacher(req("GET", "private", undefined, { cookie: user.cookie })), body.data.user);
  }
});

test("login normalizes email, preserves password bytes, rotates the presented session", async () => {
  const old = a.cookie;
  const response = await login(" SESSION-A@EXAMPLE.test ", password, { cookie: old });
  assert.equal(response.status, 200);
  a.cookie = response.headers.get("set-cookie").split(";")[0];
  assert.notEqual(a.cookie, old);
  assert.equal((await read(old)).status, 401);
  assert.equal((await read(a.cookie)).status, 200);
  assert.equal((await read(b.cookie)).status, 200);
  assert.equal((await login(a.email, password.trim())).status, 401);
});

test("invalid credentials are generic and never revoke a valid session", async () => {
  const before = await storage.db.session.count();
  const existing = await login(a.email, "incorrect", { cookie: a.cookie });
  const absent = await login("absent@example.test", "incorrect");
  for (const response of [existing, absent]) {
    assert.equal(response.status, 401); assert.equal(response.headers.get("set-cookie"), null);
    const body = await response.json();
    assert.equal(body.error.code, "INVALID_CREDENTIALS");
    assert.equal(body.error.message, "Email atau kata sandi salah.");
  }
  assert.equal(await storage.db.session.count(), before);
  assert.equal((await read(a.cookie)).status, 200);
  assert.equal((await login(a.email, "x")).status, 401);
  assert.equal((await login(a.email, "x".repeat(129))).status, 422);
  assert.equal((await auth.login(req("POST", "login", { email: a.email, password, userId: b.id }))).status, 422);
});

test("missing, malformed and ambiguous cookies yield JSON401", async () => {
  for (const cookie of [undefined, "imajilearn_session=invalid", `${a.cookie}; ${a.cookie}`, `imajilearn_session=${"0".repeat(64)}`]) {
    const response = await read(cookie);
    assert.equal(response.status, 401); assert.equal((await response.json()).error.code, "SESSION_REQUIRED");
  }
  await assert.rejects(auth.requireTeacher(req("GET", "private")), { status: 401 });
});

test("absolute/idle expiration rejects sessions; successful reads touch idle time only", async () => {
  const user = await account("expiry");
  const tokenHash = digest(user.cookie.split("=")[1]);
  await storage.db.session.update({ where: { tokenHash }, data: { lastSeen: new Date(Date.now() - 10000) } });
  const initial = await storage.db.session.findUnique({ where: { tokenHash } });
  assert.equal((await read(user.cookie)).status, 200);
  const touched = await storage.db.session.findUnique({ where: { tokenHash } });
  assert.ok(touched.lastSeen > initial.lastSeen);
  assert.equal(touched.expiresAt.getTime(), initial.expiresAt.getTime());
  await storage.db.session.update({ where: { tokenHash }, data: { lastSeen: new Date(0) } });
  assert.equal((await read(user.cookie)).status, 401);
  await storage.db.session.update({ where: { tokenHash }, data: { lastSeen: new Date(), expiresAt: new Date(0) } });
  assert.equal((await read(user.cookie)).status, 401);
});

test("logout revokes just the presented session, is idempotent and clears its cookie", async () => {
  const user = await account("logout");
  const second = await login(user.email);
  const other = second.headers.get("set-cookie").split(";")[0];
  for (let i = 0; i < 2; i++) {
    const response = await auth.logout(req("POST", "logout", undefined, { cookie: user.cookie }));
    assert.equal(response.status, 204); assert.equal(await response.text(), "");
    assert.match(response.headers.get("set-cookie"), /Max-Age=0/);
  }
  assert.equal((await read(user.cookie)).status, 401);
  assert.equal((await read(other)).status, 200);
  assert.equal((await read(b.cookie)).status, 200);
});

test("login/logout writes require matching Origin; rejected logout preserves the session", async () => {
  assert.equal((await login(a.email, password, { headers: { origin: "https://foreign.example" } })).status, 403);
  assert.equal((await auth.logout(req("POST", "logout", undefined, { cookie: a.cookie, headers: { origin: "" } }))).status, 403);
  assert.equal((await read(a.cookie)).status, 200);
});

test("login failure and IP throttles survive handler recreation, expire, and never block logout", async () => {
  await storage.db.rateLimit.deleteMany();
  const limited = () => createSessionHandlers(storage.db, { origin, loginFailureLimit: 2, loginIpLimit: 100 });
  for (let i = 0; i < 2; i++) assert.equal((await limited().login(req("POST", "login", { email: "limited@example.test", password: "wrong" }))).status, 401);
  const blocked = await limited().login(req("POST", "login", { email: "limited@example.test", password: "wrong" }));
  assert.equal(blocked.status, 429); assert.ok(Number(blocked.headers.get("retry-after")) > 0);
  await storage.db.rateLimit.updateMany({ data: { windowStart: new Date(0) } });
  assert.equal((await limited().login(req("POST", "login", { email: "limited@example.test", password: "wrong" }))).status, 401);
  await storage.db.rateLimit.deleteMany();
  const ipLimited = createSessionHandlers(storage.db, { origin, loginIpLimit: 1 });
  assert.equal((await ipLimited.login(req("POST", "login", { email: a.email, password }, { headers: { "x-forwarded-for": "1.1.1.1" } }))).status, 200);
  assert.equal((await ipLimited.login(req("POST", "login", { email: b.email, password }, { headers: { "x-forwarded-for": "2.2.2.2" } }))).status, 429);
  assert.equal((await ipLimited.logout(req("POST", "logout"))).status, 204);
});

test("a failed login session insert rolls rotation back, preserving the original session", async () => {
  const user = await account("rollback-login");
  await storage.sql('ALTER TABLE "Session" ADD CONSTRAINT synthetic_login_failure CHECK (false) NOT VALID');
  const previous = console.error; console.error = () => {};
  try {
    const response = await login(user.email, password, { cookie: user.cookie });
    assert.equal(response.status, 500); assert.equal(response.headers.get("set-cookie"), null);
    assert.ok(!(await response.text()).includes("synthetic_login_failure"));
  } finally { console.error = previous; await storage.sql('ALTER TABLE "Session" DROP CONSTRAINT synthetic_login_failure'); }
  assert.equal((await read(user.cookie)).status, 200);
});

test("HTTPS login and logout use the Secure host cookie", async () => {
  const secure = createSessionHandlers(storage.db, { origin: "https://imajilearn.example", loginIpLimit: 200 });
  const logged = await secure.login(req("POST", "login", { email: b.email, password }, { headers: { origin: "https://imajilearn.example" } }));
  assert.equal(logged.status, 200);
  assert.match(logged.headers.get("set-cookie"), /^__Host-imajilearn_session=/);
  assert.match(logged.headers.get("set-cookie"), /; Secure$/);
  const cookie = logged.headers.get("set-cookie").split(";")[0];
  const response = await secure.logout(req("POST", "logout", undefined, { cookie, headers: { origin: "https://imajilearn.example" } }));
  assert.match(response.headers.get("set-cookie"), /^__Host-imajilearn_session=;/);
  assert.match(response.headers.get("set-cookie"), /Max-Age=0; Secure$/);
});

test("failed throttle cleanup rolls login rotation back instead of orphaning a new session", async () => {
  const user = await account("rollback-throttle");
  assert.equal((await login(user.email, "wrong")).status, 401);
  await storage.sql("CREATE FUNCTION synthetic_limit_delete() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic throttle failure'; END; $$");
  await storage.sql('CREATE TRIGGER synthetic_limit_failure BEFORE DELETE ON "RateLimit" FOR EACH ROW EXECUTE FUNCTION synthetic_limit_delete()');
  const previous = console.error; console.error = () => {};
  try {
    const response = await login(user.email, password, { cookie: user.cookie });
    assert.equal(response.status, 500); assert.equal(response.headers.get("set-cookie"), null);
  } finally {
    console.error = previous;
    await storage.sql('DROP TRIGGER synthetic_limit_failure ON "RateLimit"');
    await storage.sql("DROP FUNCTION synthetic_limit_delete()");
  }
  assert.equal((await read(user.cookie)).status, 200);
  assert.equal(await storage.db.session.count({ where: { userId: user.id } }), 1);
});

test("PostgreSQL: concurrent failed logins cannot bypass the failure limit", { skip: !process.env.TEST_DATABASE_URL }, async () => {
  await storage.db.rateLimit.deleteMany();
  const limited = createSessionHandlers(storage.db, { origin, loginFailureLimit: 2, loginIpLimit: 100 });
  const responses = await Promise.all([1, 2, 3].map(() => limited.login(req("POST", "login", { email: "parallel@example.test", password: "wrong" }))));
  assert.deepEqual(responses.map(response => response.status).sort(), [401, 401, 429]);
  assert.equal((await limited.login(req("POST", "login", { email: "parallel@example.test", password: "wrong" }))).status, 429);
});
