import assert from "node:assert/strict";
import { test } from "node:test";
import { googleAvatarUrl } from "../packages/shared/lib/google-avatar.mjs";

test("Google avatars allow only bounded HTTPS photo URLs without credentials or arbitrary hosts", () => {
  const valid = "https://lh3.googleusercontent.com/a/example=s96-c";
  assert.equal(googleAvatarUrl(valid), valid);
  for (const value of [null, "", "data:image/svg+xml,test", "javascript:alert(1)", "http://lh3.googleusercontent.com/a/photo", "https://lh3.googleusercontent.com.evil.test/photo", "https://user:password@lh3.googleusercontent.com/a/photo", "https://lh3.googleusercontent.com:444/photo", "https://example.test/photo", valid + "x".repeat(2048)]) {
    assert.equal(googleAvatarUrl(value), null);
  }
});
