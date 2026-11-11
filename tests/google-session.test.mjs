import test from "node:test";
import assert from "node:assert/strict";
import { completeGoogleSession } from "../apps/web/lib/google-session.mjs";

test("Google callback announces the new session once and removes only its status flag", () => {
  const location = { href: "http://localhost:3000/dashboard?google=signed_in&folder=all#materials" };
  let announcements = 0;
  const history = { replaceState(_state, _unused, path) { location.href = new URL(path, location.href).href; } };
  completeGoogleSession(location, history, () => announcements++);
  assert.equal(location.href, "http://localhost:3000/dashboard?folder=all#materials");
  completeGoogleSession(location, history, () => announcements++);
  assert.equal(announcements, 1);
});

test("ordinary navigation and unrecognized callback status do not broadcast", () => {
  for (const path of ["/dashboard", "/dashboard?google=error", "/akun?google=signed_in"]) {
    completeGoogleSession({ href: `http://localhost:3000${path}` }, { replaceState() { assert.fail("unexpected replacement"); } }, () => assert.fail("unexpected broadcast"));
  }
});

test("Google callback also completes on the teacher home page", () => {
  let path;
  let announcements = 0;
  completeGoogleSession({ href: "http://localhost:3000/beranda?google=signed_in" }, {
    replaceState(_state, _unused, target) { path = target; },
  }, () => announcements++);
  assert.equal(path, "/beranda");
  assert.equal(announcements, 1);
});
