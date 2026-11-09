import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { createServer } from "node:net";
import { testDatabase } from "./support/database.mjs";
import { startNode, runNode, stopNode } from "./support/process.mjs";

try { await access(new URL("../apps/web/.next/BUILD_ID", import.meta.url)); }
catch { throw new Error("Run npm run build before npm run test:http."); }

const storage = await testDatabase({ socketConnections: 12 });
let server;
try {
  const encoding = await storage.sql("SHOW server_encoding");
  assert.equal(encoding.rows[0].server_encoding, "UTF8", "HTTP integration tests require a UTF8 test database");
  for (const migration of storage.migrations) await storage.migrate(migration);
  const probe = createServer();
  await new Promise((resolve, reject) => { probe.once("error", reject); probe.listen(0, "127.0.0.1", resolve); });
  const port = probe.address().port;
  await new Promise((resolve, reject) => probe.close(error => error ? reject(error) : resolve()));
  const env = { ...process.env, NODE_ENV: "production", DATABASE_URL: storage.connectionUrl(),
    APP_ORIGIN: "https://backend-smoke.example.test", TEST_APP_ORIGIN: "https://backend-smoke.example.test",
    TEST_BASE_URL: `http://127.0.0.1:${port}`, REGISTER_IP_LIMIT: "100",
  };
  server = startNode(["node_modules/next/dist/bin/next", "start", "apps/web", "--hostname", "127.0.0.1", "--port", String(port)], { env });
  for (const suite of ["registration-http-smoke", "sessions-http-smoke", "materials-http-smoke", "workspace-http-smoke", "worksheets-http-smoke"]) {
    await runNode([`tests/${suite}.mjs`], { env });
  }
  console.log("Backend HTTP integration passed using isolated synthetic data.");
} finally {
  try { await stopNode(server); }
  finally { await storage.close(); }
}
