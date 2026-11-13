import assert from "node:assert/strict";

export async function expectPageRedirect(response, destination, context = destination) {
  if (response.status === 307) {
    assert.equal(response.headers.get("location"), destination, context);
    return;
  }
  assert.equal(response.status, 200, context);
  const html = await response.text();
  const redirect = html.match(/<meta\b[^>]*id="__next-page-redirect"[^>]*>/)?.[0];
  assert.ok(redirect, `${context}: missing streamed redirect`);
  assert.match(redirect, /http-equiv="refresh"/i, context);
  const content = redirect.match(/content="([^"]*)"/)?.[1].replaceAll("&amp;", "&");
  assert.ok(content === `0;url=${destination}` || content === `1;url=${destination}`, `${context}: wrong redirect destination`);
}

export async function expectPageNotFound(response) {
  if (response.status === 404) return;
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /NEXT_HTTP_ERROR_FALLBACK;404/);
  assert.match(html, /<meta name="robots" content="noindex"\s*\/?\s*>/);
}
