import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createProfileHandlers } from "../apps/web/server/accounts/profile.mjs";
import { createRegistrationHandler } from "../apps/web/server/accounts/registration.mjs";
import { createSessionHandlers } from "../apps/web/server/accounts/sessions.mjs";
import { testDatabase } from "./support/database.mjs";

const origin = "http://localhost:3000";
const config = { origin };
const initialPassword = "  Synthetic 密碼🙂  ";
const newPassword = "  Kata sandi baru🙂  ";
let storage, profile, auth, a, b;

function request(method, path, cookie, body, requestOrigin = origin) {
  return new Request(`${origin}/api/v1/${path}`, {
    method,
    headers: { origin: requestOrigin, "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function account(label) {
  const email = `${label}@example.test`;
  const registered = await createRegistrationHandler(storage.db, config)(request("POST", "auth/register", null, {
    name: label, email, password: initialPassword,
  }));
  assert.equal(registered.status, 201);
  const { user } = (await registered.json()).data;
  return { ...user, cookie: registered.headers.get("set-cookie").split(";")[0] };
}

before(async () => {
  storage = await testDatabase();
  for (const migration of storage.migrations) await storage.migrate(migration);
  profile = createProfileHandlers(storage.db, config);
  auth = createSessionHandlers(storage.db, config);
  a = await account("profile-a");
  b = await account("profile-b");
});

after(async () => { await storage?.close(); });

test("profile requires a session and updates only the teacher from that session", async () => {
  assert.equal((await profile.get(request("GET", "me"))).status, 401);
  assert.equal((await profile.patch(request("PATCH", "me", a.cookie, { id: b.id, name: "Foreign" }))).status, 422);
  assert.equal((await profile.patch(request("PATCH", "me", a.cookie, { name: "Foreign origin" }, "https://foreign.example"))).status, 403);
  const updated = await profile.patch(request("PATCH", "me", a.cookie, { name: "  Bu Guru  ", school: "SD Negeri", grade: "6" }));
  assert.equal(updated.status, 200);
  assert.equal(updated.headers.get("cache-control"), "no-store");
  assert.deepEqual((await updated.json()).data, { id: a.id, name: "Bu Guru", email: a.email, school: "SD Negeri", grade: "6" });
  const foreign = await profile.get(request("GET", "me", b.cookie));
  assert.equal((await foreign.json()).data.name, b.name);
  const emailChange = await profile.patch(request("PATCH", "me", a.cookie, { email: b.email }));
  assert.equal(emailChange.status, 422);
  assert.equal((await emailChange.json()).error.code, "EMAIL_CHANGE_UNAVAILABLE");
});

test("password change validates credentials, rotates the current session and revokes other sessions", async () => {
  const payload = { currentPassword: initialPassword, newPassword, confirmPassword: newPassword };
  assert.equal((await profile.password(request("POST", "me/password", null, payload))).status, 401);
  const additional = await auth.login(request("POST", "auth/login", null, { email: a.email, password: initialPassword }));
  assert.equal(additional.status, 200);
  const otherCookie = additional.headers.get("set-cookie").split(";")[0];
  const incorrect = await profile.password(request("POST", "me/password", a.cookie, { ...payload, currentPassword: "wrong password" }));
  assert.equal(incorrect.status, 422);
  assert.ok((await incorrect.json()).error.fields.currentPassword);
  assert.equal((await profile.get(request("GET", "me", otherCookie))).status, 200);
  const changed = await profile.password(request("POST", "me/password", a.cookie, payload));
  assert.equal(changed.status, 204);
  assert.equal(await changed.text(), "");
  const replacement = changed.headers.get("set-cookie").split(";")[0];
  assert.notEqual(replacement, a.cookie);
  assert.equal((await profile.get(request("GET", "me", a.cookie))).status, 401);
  assert.equal((await profile.get(request("GET", "me", otherCookie))).status, 401);
  assert.equal((await profile.get(request("GET", "me", replacement))).status, 200);
  assert.equal((await profile.get(request("GET", "me", b.cookie))).status, 200);
  assert.equal((await auth.login(request("POST", "auth/login", null, { email: a.email, password: initialPassword }))).status, 401);
  assert.equal((await auth.login(request("POST", "auth/login", null, { email: a.email, password: newPassword }))).status, 200);
});

test("a stale profile page cannot read or update the newly active account", async () => {
  const read = request("GET", "me", b.cookie);
  const patch = request("PATCH", "me", b.cookie, { name: "Stale edit" });
  const password = request("POST", "me/password", b.cookie, {
    currentPassword: initialPassword, newPassword, confirmPassword: newPassword,
  });
  for (const [method, operation] of [["get", read], ["patch", patch], ["password", password]]) {
    operation.headers.set("x-teacher-id", a.id);
    const response = await profile[method](operation);
    assert.equal(response.status, 409);
    assert.equal((await response.json()).error.code, "ACCOUNT_CHANGED");
  }
  const guest = request("GET", "me");
  guest.headers.set("x-teacher-id", b.id);
  assert.equal((await profile.get(guest)).status, 401);
  assert.equal((await (await profile.get(request("GET", "me", b.cookie))).json()).data.name, b.name);
});

test("a login verified before a password change cannot issue a session with stale credentials", async () => {
  const db = storage.db;
  const delayedLogin = createSessionHandlers({
    teacher: db.teacher,
    rateLimit: db.rateLimit,
    async $transaction(operation) {
      const changed = await profile.password(request("POST", "me/password", b.cookie, {
        currentPassword: initialPassword, newPassword, confirmPassword: newPassword,
      }));
      assert.equal(changed.status, 204);
      return db.$transaction(operation);
    },
  }, config);
  const response = await delayedLogin.login(request("POST", "auth/login", null, { email: b.email, password: initialPassword }));
  assert.equal(response.status, 401);
  assert.equal(response.headers.get("set-cookie"), null);
  assert.equal(await db.session.count({ where: { userId: b.id } }), 1);
});
