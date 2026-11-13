import test from "node:test";
import assert from "node:assert/strict";
import config from "../apps/web/next.config.mjs";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants.js";
import pwaConfig from "../apps/pwa/next.config.mjs";

test("development request logs exclude OAuth callback codes while ordinary request logging stays enabled", () => {
  const developmentConfig = config(PHASE_DEVELOPMENT_SERVER);
  const ignored = path => developmentConfig.logging.incomingRequests.ignore.some(pattern => pattern.test(path));
  assert.equal(ignored("/api/v1/auth/google/callback?code=synthetic-private-code&state=synthetic"), true);
  assert.equal(ignored("/api/v1/auth/google/callback"), true);
  assert.equal(ignored("/api/v1/auth/google/pwa/callback?code=synthetic-private-code&state=synthetic"), true);
  assert.equal(ignored("/app/api/v1/auth/google/pwa/callback?code=synthetic-private-code&state=synthetic"), true);
  assert.equal(pwaConfig.logging.incomingRequests.ignore.some(pattern => pattern.test("/app/api/v1/auth/google/pwa/callback?code=synthetic-private-code")), true);
  assert.equal(ignored("/api/v1/materials"), false);
});
