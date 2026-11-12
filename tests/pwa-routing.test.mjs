import assert from "node:assert/strict";
import test from "node:test";
import { mobileRewrites } from "../apps/web/pwa-routing.mjs";

test("mobile routing is opt-in in production and confined to /app", () => {
  assert.deepEqual(mobileRewrites(), []);
  const routes = mobileRewrites({ development: true });
  assert.deepEqual(routes, [
    { source: "/app", destination: "http://127.0.0.1:3002/app" },
    { source: "/app/:path*", destination: "http://127.0.0.1:3002/app/:path*" },
  ]);
  assert.equal(mobileRewrites({ upstream: "http://pwa:3002/" })[1].destination, "http://pwa:3002/app/:path*");
});

test("mobile routing rejects malformed upstreams and direct public-origin loops", () => {
  for (const upstream of ["bad", "ftp://pwa", "http://user:secret@pwa", "http://pwa/app", "http://pwa?x=1", "http://pwa#x"]) {
    assert.throws(() => mobileRewrites({ upstream }), /PWA_INTERNAL_ORIGIN/);
  }
  assert.throws(() => mobileRewrites({ upstream: "https://school.example", publicOrigin: "https://school.example" }), /separate/);
});
