import assert from "node:assert/strict";
import test from "node:test";

async function render(path = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${path}`, {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the CourseTrack dashboard", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>CourseTrack<\/title>/i);
  assert.match(html, /Search\. Explore\. Manage\./);
  assert.match(html, /Portfolio overview/);
  assert.match(html, /Sample workspace/);
  assert.doesNotMatch(html, /codex-preview|taking shape|loading skeleton/i);
});

test("server-renders the course library", async () => {
  const response = await render("/courses");
  assert.equal(response.status, 200);

  const html = await response.text();
  assert.match(html, /Course Library/);
  assert.match(html, /Search courses/);
  assert.match(html, /64 courses/);
  assert.match(html, /Law Enforcement/);
});
