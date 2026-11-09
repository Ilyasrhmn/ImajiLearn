import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import { setTimeout } from "node:timers/promises";
import { testDatabase } from "./support/database.mjs";
import { issueSession } from "../apps/web/server/accounts/session-issuer.mjs";
import { createWorksheetRecord } from "../apps/web/server/documents/worksheets/document.mjs";
import { createWorksheetDocumentRepository } from "../apps/web/server/documents/worksheets/repository.mjs";

// Run after npm run build. Only an isolated test schema and synthetic fixtures are used.
const storage = await testDatabase();
const origin = "https://worksheet-smoke.example.test";
let server, exit, output = "";
try {
  for (const migration of storage.migrations) await storage.migrate(migration);
  const teachers = await Promise.all(["a", "b"].map(label => storage.db.teacher.create({ data: {
    name: `Synthetic Smoke ${label}`, email: `worksheet-smoke-${label}@example.test`, passwordHash: "synthetic-test-hash", grade: "4",
  } })));
  const session = await storage.db.$transaction(tx => issueSession(tx, teachers[0].id, { secure: true, absoluteSeconds: 3600 }));
  const cookie = session.cookie.split(";")[0];
  const repository = createWorksheetDocumentRepository({ database: storage.db });
  const documents = [];
  for (const teacher of teachers) {
    const content = { templateId: "fold", title: "Tumbuhan", instructions: ["Buka kartu."],
      items: Array.from({ length: 4 }, (_, i) => ({ id: `card-${i}`, front: "Bagian", back: "Penjelasan", assetId: null })),
      pairs: [], order: [], groups: [], teacher: { preparation: ["Siapkan kertas."], notes: "" } };
    const document = createWorksheetRecord({ ownerId: teacher.id, source: { id: randomUUID(), title: "Sumber", revision: randomUUID() },
      templateId: "fold", grade: "4", content });
    document.sourceMaterialId = null;
    await repository.withTeacherTransaction(teacher.id, tx => tx.insertSaved(document));
    documents.push(document);
  }
  const probe = createServer();
  await new Promise((resolve, reject) => { probe.once("error", reject); probe.listen(0, "127.0.0.1", resolve); });
  const port = probe.address().port;
  await new Promise((resolve, reject) => probe.close(error => error ? reject(error) : resolve()));
  const base = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, [fileURLToPath(new URL("../node_modules/next/dist/bin/next", import.meta.url)),
    "start", fileURLToPath(new URL("../apps/web", import.meta.url)), "--port", String(port), "--hostname", "127.0.0.1"], {
    env: { ...process.env, NODE_ENV: "production", DATABASE_URL: storage.connectionUrl(), APP_ORIGIN: origin },
    stdio: ["ignore", "pipe", "pipe"], windowsHide: true,
  });
  exit = new Promise(resolve => { server.once("exit", resolve); server.once("error", resolve); });
  for (const stream of [server.stdout, server.stderr]) stream.on("data", chunk => { output = (output + chunk.toString()).slice(-8000); });
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(`${base}/api/v1/worksheets`)).status === 401) { ready = true; break; } }
    catch { /* Wait for this isolated Next.js server. */ }
    await setTimeout(100);
  }
  assert.ok(ready, `Worksheet routes did not start: ${output}`);
  function send(method, suffix = "", body, headers = {}, withCookie = true) {
    return fetch(`${base}/api/v1/worksheets${suffix}`, { method,
      headers: { ...(withCookie ? { cookie } : {}), ...(method === "GET" || method === "HEAD" ? {} : { origin, "content-type": "application/json" }), ...headers },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }
  assert.equal((await send("GET", "", undefined, {}, false)).status, 401);
  const list = await send("GET"); assert.equal(list.status, 200); assert.equal(list.headers.get("cache-control"), "no-store");
  assert.deepEqual((await list.json()).data.map(document => document.id), [documents[0].id]);
  assert.equal((await send("HEAD")).status, 200);
  assert.equal((await send("POST", "", {})).status, 405);
  const own = `/${documents[0].id}`, foreign = `/${documents[1].id}`;
  const detail = await send("GET", own); assert.equal(detail.status, 200); assert.equal(detail.headers.get("etag"), '"1"');
  assert.deepEqual((await detail.json()).data.source, documents[0].source);
  assert.equal((await send("GET", foreign)).status, 404);
  assert.equal((await send("PATCH", own, { theme: "color" })).status, 428);
  assert.equal((await send("PATCH", own, { ownerId: teachers[1].id }, { "if-match": '"1"' })).status, 422);
  const patched = await send("PATCH", own, { theme: "color" }, { "if-match": '"1"' });
  assert.equal(patched.status, 200); assert.equal(patched.headers.get("etag"), '"2"');
  assert.equal((await patched.json()).data.theme, "color");
  assert.equal((await send("PATCH", own, { theme: "ink" }, { "if-match": '"1"' })).status, 412);
  assert.equal((await send("DELETE", foreign, undefined, { "if-match": '"1"' })).status, 404);
  assert.equal((await send("DELETE", own, undefined, { "if-match": '"2"', origin: "https://foreign.example" })).status, 403);
  const deleted = await send("DELETE", own, undefined, { "if-match": '"2"' });
  assert.equal(deleted.status, 204); assert.equal(await deleted.text(), "");
  assert.equal((await send("GET", own)).status, 404);
  assert.equal((await fetch(`${base}/api/v1/auth/logout`, { method: "POST", headers: { origin, cookie } })).status, 204);
  assert.equal((await send("GET")).status, 401);
  console.log("Worksheet Next.js HTTP smoke passed: real session auth, owner isolation, ETag/PATCH/DELETE, Origin protection, logout revocation, no public create route.");
} finally {
  if (server) {
    server.kill();
    await exit;
  }
  await storage.close();
}
