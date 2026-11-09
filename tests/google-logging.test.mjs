import test from "node:test";
import assert from "node:assert/strict";
import config from "../apps/web/next.config.mjs";

test("development request logs exclude OAuth callback codes while ordinary request logging stays enabled", () => {
  const ignored = path => config.logging.incomingRequests.ignore.some(pattern => pattern.test(path));
  assert.equal(ignored("/api/v1/auth/google/callback?code=synthetic-private-code&state=synthetic"), true);
  assert.equal(ignored("/api/v1/auth/google/callback"), true);
  assert.equal(ignored("/api/v1/materials"), false);
});
