import test from "node:test";
import assert from "node:assert/strict";
import { googleCallbackNotice, requestGoogleAuthorization } from "../apps/web/lib/google-auth-client.mjs";

const authorizationUrl = "https://accounts.google.com/o/oauth2/v2/auth?state=synthetic-state";

test("Google login starts with a same-origin POST and returns the authorization URL", async () => {
  const result = await requestGoogleAuthorization({}, { fetchImpl: async (path, options) => {
    assert.equal(path, "/api/v1/auth/google");
    assert.equal(options.method, "POST");
    assert.equal(options.credentials, "same-origin");
    assert.equal(options.body, undefined);
    return Response.json({ data: { url: authorizationUrl } });
  } });
  assert.deepEqual(result, { url: authorizationUrl });
});

test("Google linking sends the current password with the teacher identity check", async () => {
  await requestGoogleAuthorization({ teacherId: "teacher-1", currentPassword: "synthetic-password" }, { fetchImpl: async (path, options) => {
    assert.equal(path, "/api/v1/me/google/link");
    assert.equal(options.headers["X-Teacher-Id"], "teacher-1");
    assert.deepEqual(JSON.parse(options.body), { currentPassword: "synthetic-password" });
    return Response.json({ data: { url: authorizationUrl } });
  } });
});

test("Google start refuses an unexpected redirect and does not render raw server failures", async () => {
  for (const response of [Response.json({ data: { url: "https://unexpected.example/auth" } }), Response.json({ error: { message: "private upstream detail" } }, { status: 500 })]) {
    await assert.rejects(requestGoogleAuthorization({}, { fetchImpl: async () => response }), error => !error.message.includes("private") && error.message.includes("Coba lagi"));
  }
});

test("Google linking distinguishes expired and changed accounts before redirect", async () => {
  const options = { teacherId: "teacher-1", currentPassword: "synthetic-password" };
  assert.deepEqual(await requestGoogleAuthorization(options, { fetchImpl: async () => new Response(null, { status: 401 }) }), { sessionExpired: true });
  assert.deepEqual(await requestGoogleAuthorization(options, { fetchImpl: async () => Response.json({ error: { code: "ACCOUNT_CHANGED" } }, { status: 409 }) }), { accountChanged: true });
});

test("Google linking offers an actionable retry for a wrong current password", async () => {
  await assert.rejects(requestGoogleAuthorization({ teacherId: "teacher-1", currentPassword: "wrong" }, {
    fetchImpl: async () => Response.json({ error: { code: "INVALID_PASSWORD", message: "private detail" } }, { status: 422 }),
  }), { message: "Kata sandi saat ini belum sesuai. Periksa dan coba lagi." });
});

test("Google starts explain a changed sign-in capability using fixed notices", async () => {
  for (const [code, message] of [
    ["GOOGLE_ALREADY_LINKED", "Akun ini sudah terhubung dengan Google. Muat ulang halaman."],
    ["PASSWORD_UNAVAILABLE", "Akun ini masuk menggunakan Google. Muat ulang halaman."],
    ["GOOGLE_UNAVAILABLE", "Google belum tersedia. Silakan coba lagi nanti."],
  ]) {
    await assert.rejects(requestGoogleAuthorization({ teacherId: "teacher-1", currentPassword: "synthetic-password" }, {
      fetchImpl: async () => Response.json({ error: { code, message: "private detail" } }, { status: 422 }),
    }), { message });
  }
});

test("callback notices are fixed messages and never echo arbitrary query values", () => {
  assert.equal(googleCallbackNotice("linked", "account")?.type, "success");
  assert.equal(googleCallbackNotice("linked", "login"), null);
  assert.equal(googleCallbackNotice("<script>private-token</script>", "login"), null);
  assert.equal(googleCallbackNotice(["cancelled", "linked"], "login"), null);
});
