import test from "node:test";
import assert from "node:assert/strict";

test("database configuration rejects missing and non-PostgreSQL URLs without exposing credentials", async () => {
  const { createDatabase } = await import("../apps/web/server/core/database.mjs");
  for (const value of [undefined, "", "not-a-url", "https://user:private-password@example.test/database"]) {
    assert.throws(() => createDatabase(value), error => {
      assert.equal(error.code, "DATABASE_CONFIGURATION_ERROR");
      assert.ok(!error.message.includes("private-password"));
      return true;
    });
  }
});

test("foundation migration persists teacher records across connections and enforces unique email", async () => {
  const { testDatabase } = await import("./support/database.mjs");
  const storage = await testDatabase();
  let reconnected;
  try {
    for (const migration of storage.migrations) await storage.migrate(migration);
    const teacher = await storage.db.teacher.create({ data: {
      name: "Synthetic Teacher", email: "foundation@example.test", passwordHash: "synthetic-test-hash",
    } });
    assert.match(teacher.id, /^[a-f\d-]{36}$/);
    assert.equal(teacher.school, "");
    assert.equal(teacher.grade, "");
    assert.ok(teacher.createdAt instanceof Date);
    await storage.db.$disconnect();
    reconnected = storage.connect();
    const persisted = await reconnected.teacher.findUnique({ where: { id: teacher.id } });
    assert.equal(persisted.name, "Synthetic Teacher");
    assert.equal(persisted.passwordHash, "synthetic-test-hash");
    await assert.rejects(reconnected.teacher.create({ data: {
      name: "Duplicate", email: "foundation@example.test", passwordHash: "synthetic-test-hash",
    } }), { code: "P2002" });
    assert.equal(await reconnected.teacher.count(), 1);
  } finally {
    await reconnected?.$disconnect();
    await storage.close();
  }
});

test("database transaction rolls back the entire write on failure", async () => {
  const { testDatabase } = await import("./support/database.mjs");
  const storage = await testDatabase();
  try {
    for (const migration of storage.migrations) await storage.migrate(migration);
    await assert.rejects(storage.db.$transaction(async tx => {
      await tx.teacher.create({ data: { name: "Rollback", email: "rollback@example.test", passwordHash: "synthetic-test-hash" } });
      throw new Error("Intentional transaction failure");
    }), { message: "Intentional transaction failure" });
    assert.equal(await storage.db.teacher.count(), 0);
  } finally { await storage.close(); }
});

test("DATABASE_URL schema selects the same tables as the migration runner", async () => {
  const { testDatabase } = await import("./support/database.mjs");
  const storage = await testDatabase();
  let fromUrl;
  try {
    for (const migration of storage.migrations) await storage.migrate(migration);
    const teacher = await storage.db.teacher.create({ data: {
      name: "Custom schema", email: "schema@example.test", passwordHash: "synthetic-test-hash",
    } });
    await storage.db.$disconnect();
    fromUrl = storage.connectFromUrlSchema();
    const restored = await fromUrl.teacher.findUnique({ where: { id: teacher.id } });
    assert.equal(restored?.email, "schema@example.test");
    const [raw] = await fromUrl.$queryRaw`SELECT "email" FROM "Teacher" WHERE "id" = ${teacher.id}::uuid`;
    assert.equal(raw?.email, restored.email);
  } finally {
    await fromUrl?.$disconnect();
    await storage.close();
  }
});
