import test from "node:test";
import assert from "node:assert/strict";

test("registration deployment rejects invalid Origin configuration without exposing environment values", async () => {
  const { registrationRoute } = await import("../apps/web/server/accounts/runtime.mjs");
  const previous = { APP_ORIGIN: process.env.APP_ORIGIN, NODE_ENV: process.env.NODE_ENV, REGISTER_IP_LIMIT: process.env.REGISTER_IP_LIMIT };
  try {
    process.env.NODE_ENV = "production";
    for (const origin of [undefined, "invalid", "http://localhost:3000", "https://example.test/path"]) {
      if (origin === undefined) delete process.env.APP_ORIGIN; else process.env.APP_ORIGIN = origin;
      const response = await registrationRoute(new Request("http://localhost/api/v1/auth/register", { method: "POST" }));
      assert.equal(response.status, 503);
      assert.equal((await response.json()).error.code, "CONFIGURATION_ERROR");
    }
    process.env.APP_ORIGIN = "https://example.test";
    process.env.REGISTER_IP_LIMIT = "invalid-private-value";
    const response = await registrationRoute(new Request("http://localhost/api/v1/auth/register", { method: "POST" }));
    assert.equal(response.status, 503);
    assert.ok(!(await response.text()).includes("invalid-private-value"));
  } finally {
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  }
});
