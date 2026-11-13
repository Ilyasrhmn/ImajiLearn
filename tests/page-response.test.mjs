import assert from "node:assert/strict";
import { test } from "node:test";
import { expectPageRedirect, expectPageNotFound } from "./support/page-response.mjs";

test("page redirects accept HTTP and streamed navigation only to the expected destination", async () => {
  await expectPageRedirect(new Response(null, { status: 307, headers: { location: "/masuk" } }), "/masuk");
  await expectPageRedirect(new Response('<meta id="__next-page-redirect" http-equiv="refresh" content="1;url=/masuk"/>'), "/masuk");
  await assert.rejects(expectPageRedirect(new Response("Private content"), "/masuk"));
  await assert.rejects(expectPageRedirect(new Response('<meta id="__next-page-redirect" http-equiv="refresh" content="1;url=/beranda"/>'), "/masuk"));
  await assert.rejects(expectPageRedirect(new Response(null, { status: 307, headers: { location: "/beranda" } }), "/masuk"));
});

test("streamed not-found pages require both the error marker and noindex", async () => {
  await expectPageNotFound(new Response(null, { status: 404 }));
  await expectPageNotFound(new Response('<meta name="robots" content="noindex"/>NEXT_HTTP_ERROR_FALLBACK;404'));
  await assert.rejects(expectPageNotFound(new Response("Private content")));
  await assert.rejects(expectPageNotFound(new Response("NEXT_HTTP_ERROR_FALLBACK;404")));
});
