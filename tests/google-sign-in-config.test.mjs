import test from "node:test";
import assert from "node:assert/strict";
import { isGoogleSignInConfigured } from "../apps/web/lib/google-sign-in-config.mjs";

test("Google UI configuration exposes a boolean only when both server credentials are present", () => {
  assert.equal(isGoogleSignInConfigured({}), false);
  assert.equal(isGoogleSignInConfigured({ GOOGLE_CLIENT_ID: "synthetic" }), false);
  assert.equal(isGoogleSignInConfigured({ GOOGLE_CLIENT_ID: "synthetic", GOOGLE_CLIENT_SECRET: " " }), false);
  assert.equal(isGoogleSignInConfigured({ GOOGLE_CLIENT_ID: "synthetic", GOOGLE_CLIENT_SECRET: "synthetic-secret" }), true);
});
