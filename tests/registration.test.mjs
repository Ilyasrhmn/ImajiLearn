import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createHash, scrypt as scryptCallback } from "node:crypto";
import { promisify } from "node:util";
import { testDatabase } from "./support/database.mjs";

const scrypt = promisify(scryptCallback);
const origin = "http://localhost:3000";
const password = "  密碼🙂 ab  ";
let storage, handler, createRegistrationHandler;
const account = (email = "teacher@example.test") => ({ name: "  Guru Sintetis  ", email, password });
function request(body, headers = {}) {
  return new Request(`${origin}/api/v1/auth/register`, { method: "POST",
    headers: { origin, "content-type": "application/json", ...headers }, body: JSON.stringify(body),
  });
}
before(async () => {
  ({ createRegistrationHandler } = await import("../apps/web/server/accounts/registration.mjs"));
  storage = await testDatabase();
  for (const migration of storage.migrations) await storage.migrate(migration);
  handler = createRegistrationHandler(storage.db, { origin, registerLimit: 100 });
});
after(async () => { await storage?.close(); });

test("registration normalizes identity, hashes exact Unicode password and creates a private session", async () => {
  const response = await handler(request(account(" TEACHER@example.test ")));
  assert.equal(response.status, 201);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const body = await response.json();
  assert.equal(body.data.user.name, "Guru Sintetis");
  assert.equal(body.data.user.email, "teacher@example.test");
  assert.equal(body.data.user.school, ""); assert.equal(body.data.user.grade, "");
  assert.ok(Date.parse(body.data.expiresAt) > Date.now());
  const row = await storage.db.teacher.findUnique({ where: { id: body.data.user.id } });
  const [algorithm, N, r, p, salt, hash] = row.passwordHash.split("$");
  assert.equal(algorithm, "scrypt"); assert.equal(Number(N), 32768);
  const actual = await scrypt(password, salt, 64, { N: Number(N), r: Number(r), p: Number(p), maxmem: 64 * 1024 * 1024 });
  assert.equal(actual.toString("hex"), hash);
  const trimmed = await scrypt(password.trim(), salt, 64, { N: Number(N), r: Number(r), p: Number(p), maxmem: 64 * 1024 * 1024 });
  assert.notEqual(trimmed.toString("hex"), hash);
  const cookie = response.headers.get("set-cookie");
  assert.match(cookie, /^imajilearn_session=[a-f\d]{64}; Path=\/; HttpOnly; SameSite=Lax; Max-Age=604800$/);
  const token = cookie.split(";")[0].split("=")[1];
  const session = await storage.db.session.findUnique({ where: { tokenHash: createHash("sha256").update(token).digest("hex") } });
  assert.equal(session.userId, row.id);
  assert.notEqual(session.tokenHash, token);
  assert.equal(session.expiresAt.toISOString(), body.data.expiresAt);
  for (const secret of [password, row.passwordHash, hash, token, session.tokenHash]) assert.ok(!JSON.stringify(body).includes(secret));
});

test("duplicate normalized email returns a safe 409 and adds no teacher/session", async () => {
  const count = await storage.db.session.count();
  const response = await handler(request(account("Teacher@EXAMPLE.test")));
  assert.equal(response.status, 409);
  const body = await response.json();
  assert.equal(body.error.code, "EMAIL_IN_USE"); assert.equal(body.data, undefined);
  assert.equal(response.headers.get("set-cookie"), null);
  assert.equal(await storage.db.session.count(), count);
});

test("registration rejects invalid boundaries and injected fields before persisting", async () => {
  const before = await storage.db.teacher.count();
  for (const body of [null, [], {}, { ...account(), name: " " }, { ...account(), name: "a".repeat(61) },
    { ...account(), name: "A\u0000B" },
    { ...account(), email: "invalid" }, { ...account(), email: "a".repeat(255) },
    { ...account(), password: "a".repeat(7) }, { ...account(), password: "a".repeat(129) },
    { ...account(), password: null }, { ...account(), userId: "forged" }, { ...account(), school: "Injected" }]) {
    assert.equal((await handler(request(body))).status, 422);
  }
  assert.equal(await storage.db.teacher.count(), before);
  const invalidEmail = await handler(request({ ...account(), email: "invalid" }));
  const error = (await invalidEmail.json()).error;
  assert.equal(invalidEmail.status, 422);
  assert.equal(error.code, "VALIDATION_ERROR");
  assert.equal(error.fields.email, "Isi alamat email yang valid.");
});

test("exact name/password/email limits succeed with distinct password salts", async () => {
  const email = `${"a".repeat(64)}@${"b".repeat(63)}.${"c".repeat(63)}.${"d".repeat(61)}`;
  assert.equal(email.length, 254);
  const rows = [];
  for (const [index, secret] of ["a".repeat(8), "a".repeat(128), password].entries()) {
    const response = await handler(request({ name: "🙂".repeat(30), email: index ? `boundary${index}@example.test` : email, password: secret }));
    assert.equal(response.status, 201);
    const id = (await response.json()).data.user.id;
    rows.push(await storage.db.teacher.findUnique({ where: { id } }));
  }
  const original = await storage.db.teacher.findUnique({ where: { email: "teacher@example.test" } });
  assert.notEqual(rows[2].passwordHash, original.passwordHash);
});

test("HTTPS registration uses a Secure host-only cookie", async () => {
  const secure = createRegistrationHandler(storage.db, { origin: "https://imajilearn.example", registerLimit: 100 });
  const response = await secure(request(account("https@example.test"), { origin: "https://imajilearn.example" }));
  assert.equal(response.status, 201);
  assert.match(response.headers.get("set-cookie"), /^__Host-imajilearn_session=/);
  assert.match(response.headers.get("set-cookie"), /; Secure$/);
  assert.ok(!response.headers.get("set-cookie").includes("Domain="));
});

test("Origin, body format and body budget protect registration", async () => {
  for (const headers of [{ origin: "https://foreign.example" }, { origin: "" }, { "sec-fetch-site": "cross-site" }]) {
    assert.equal((await handler(request(account(), headers))).status, 403);
  }
  for (const [body, contentType, status] of [["{", "application/json", 400], ["{}", "text/plain", 415], ["a".repeat(17000), "application/json", 413]]) {
    const response = await handler(new Request(`${origin}/api/v1/auth/register`, { method: "POST", headers: { origin, "content-type": contentType }, body }));
    assert.equal(response.status, status);
    const result = await response.json();
    assert.match(result.error.requestId, /^[a-f\d-]{36}$/);
    assert.equal(response.headers.get("x-request-id"), result.error.requestId);
    assert.equal(response.headers.get("cache-control"), "no-store");
  }
});

test("rate limits persist across handlers, ignore untrusted forwarded IPs and recover after window expiry", async () => {
  await storage.db.rateLimit.deleteMany();
  const limited = () => createRegistrationHandler(storage.db, { origin, registerLimit: 1 });
  assert.equal((await limited()(request(account("limited1@example.test"), { "x-forwarded-for": "1.1.1.1" }))).status, 201);
  const response = await limited()(request(account("limited2@example.test"), { "x-forwarded-for": "2.2.2.2" }));
  assert.equal(response.status, 429);
  assert.ok(Number(response.headers.get("retry-after")) > 0);
  assert.equal(await storage.db.teacher.count({ where: { email: "limited2@example.test" } }), 0);
  await storage.db.rateLimit.updateMany({ data: { windowStart: new Date(0) } });
  assert.equal((await limited()(request(account("limited2@example.test")))).status, 201);
});

test("a failed session insert rolls registration back and hides database details", async () => {
  await storage.sql('ALTER TABLE "Session" ADD CONSTRAINT synthetic_failure CHECK (false) NOT VALID');
  const previous = console.error, logs = [];
  console.error = value => logs.push(String(value));
  try {
    const response = await handler(request(account("rollback-registration@example.test")));
    assert.equal(response.status, 500);
    const body = await response.json();
    assert.equal(body.error.code, "INTERNAL_ERROR");
    assert.ok(!JSON.stringify(body).includes("synthetic_failure"));
    assert.ok(!logs.join(" ").includes(password));
    assert.equal(await storage.db.teacher.count({ where: { email: "rollback-registration@example.test" } }), 0);
  } finally {
    console.error = previous;
    await storage.sql('ALTER TABLE "Session" DROP CONSTRAINT synthetic_failure');
  }
});

test("registration migration upgrades existing teachers without changing their data", async () => {
  const upgrade = await testDatabase();
  try {
    await upgrade.migrate(upgrade.migrations[0]);
    const seeded = await upgrade.db.teacher.create({ data: { name: "Existing", email: "old@example.test", passwordHash: "synthetic-existing-hash" }, select: { id: true, name: true, email: true, passwordHash: true, school: true, grade: true, createdAt: true } });
    for (const migration of upgrade.migrations.slice(1)) await upgrade.migrate(migration);
    const result = await upgrade.db.teacher.findUnique({ where: { id: seeded.id } });
    assert.equal(result.passwordHash, seeded.passwordHash);
    assert.equal(await upgrade.db.session.count(), 0);
    assert.equal(await upgrade.db.rateLimit.count(), 0);
  } finally { await upgrade.close(); }
});

test("PostgreSQL: simultaneous duplicate registrations create only one teacher and one session", { skip: !process.env.TEST_DATABASE_URL }, async () => {
  const responses = await Promise.all([1, 2].map(() => handler(request(account("race@example.test")))));
  assert.deepEqual(responses.map(response => response.status).sort(), [201, 409]);
  const teacher = await storage.db.teacher.findUnique({ where: { email: "race@example.test" } });
  assert.equal(await storage.db.session.count({ where: { userId: teacher.id } }), 1);
});

test("PostgreSQL: concurrent registrations cannot exceed the rate limit", { skip: !process.env.TEST_DATABASE_URL }, async () => {
  await storage.db.rateLimit.deleteMany();
  const limited = createRegistrationHandler(storage.db, { origin, registerLimit: 2 });
  const responses = await Promise.all([1, 2, 3].map(i => limited(request(account(`rate-race-${i}@example.test`)))));
  assert.deepEqual(responses.map(response => response.status).sort(), [201, 201, 429]);
  assert.equal(await storage.db.teacher.count({ where: { email: { startsWith: "rate-race-" } } }), 2);
});
