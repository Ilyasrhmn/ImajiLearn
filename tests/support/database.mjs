import { readFile, readdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { createDatabase } from "../../apps/web/server/core/database.mjs";

export async function testDatabase() {
  let engine, socket, admin;
  const schema = `test_${randomUUID().replaceAll("-", "")}`;
  let connectionString = process.env.TEST_DATABASE_URL;
  if (connectionString) {
    admin = new pg.Client({ connectionString });
    await admin.connect();
    await admin.query(`CREATE SCHEMA "${schema}"`);
    await admin.query(`SET search_path TO "${schema}"`);
  } else {
    const { PGlite } = await import("@electric-sql/pglite");
    const { PGLiteSocketServer } = await import("@electric-sql/pglite-socket");
    engine = await PGlite.create();
    await engine.exec(`CREATE SCHEMA "${schema}"; SET search_path TO "${schema}"`);
    // Allow the old socket to finish closing while a new client reconnects.
    socket = new PGLiteSocketServer({ db: engine, port: 0, host: "127.0.0.1", maxConnections: 2 });
    await socket.start();
    connectionString = `postgresql://postgres:postgres@${socket.getServerConn()}/postgres`;
  }
  const connect = () => createDatabase(connectionString, { schema, maxConnections: engine ? 1 : 8 });
  const db = connect();
  const migrations = (await readdir(new URL("../../prisma/migrations/", import.meta.url))).filter(x => /^\d/.test(x)).sort();
  return {
    db, connect, migrations,
    sql: (query, params) => engine ? engine.query(query, params) : admin.query(query, params),
    connectFromUrlSchema() {
      const url = new URL(connectionString);
      url.searchParams.set("schema", schema);
      return createDatabase(url.toString(), { maxConnections: 1 });
    },
    async migrate(name) {
      const sql = await readFile(new URL(`../../prisma/migrations/${name}/migration.sql`, import.meta.url), "utf8");
      if (engine) await engine.exec(sql); else await admin.query(sql);
    },
    async close() {
      await db.$disconnect();
      if (socket) await socket.stop();
      if (engine) await engine.close();
      if (admin) {
        await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
        await admin.end();
      }
    },
  };
}
