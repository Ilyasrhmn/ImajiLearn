import test from "node:test";
import assert from "node:assert/strict";
import { worksheetRoute } from "../apps/web/server/documents/worksheets/runtime.mjs";

test("worksheet deployment rejects invalid configuration without leaking environment values", async () => {
  const previous = { APP_ORIGIN: process.env.APP_ORIGIN, NODE_ENV: process.env.NODE_ENV, SESSION_IDLE_SECONDS: process.env.SESSION_IDLE_SECONDS };
  try {
    process.env.NODE_ENV = "production";
    for (const origin of [undefined, "invalid", "http://localhost:3000", "https://example.test/path"]) {
      if (origin === undefined) delete process.env.APP_ORIGIN; else process.env.APP_ORIGIN = origin;
      const response = await worksheetRoute("list")(new Request("http://localhost/api/v1/worksheets"));
      assert.equal(response.status, 503); assert.equal((await response.json()).error.code, "CONFIGURATION_ERROR");
    }
    process.env.APP_ORIGIN = "https://example.test"; process.env.SESSION_IDLE_SECONDS = "private-invalid-value";
    const response = await worksheetRoute("list")(new Request("http://localhost/api/v1/worksheets"));
    assert.equal(response.status, 503); assert.ok(!(await response.text()).includes("private-invalid-value"));
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});
