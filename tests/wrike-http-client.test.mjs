import assert from "node:assert/strict";
import test from "node:test";
import "../scripts/register-aliases.mjs";

const { callWrikeApi, fetchAllWrikePages, WrikeApiError } = await import("../lib/wrike-http-client.ts");

function jsonResponse(status, body, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Map(Object.entries(headers)),
    json: async () => body,
  };
}
// Wrap Map so response.headers.get(...) matches the Headers API used by the client.
function withHeadersGet(response) {
  const map = response.headers;
  return { ...response, headers: { get: (key) => map.get(key.toLowerCase()) ?? null } };
}

test("callWrikeApi rejects an invalid host before ever calling fetch", async () => {
  let called = false;
  const fetchImpl = async () => {
    called = true;
    return withHeadersGet(jsonResponse(200, { data: [] }));
  };
  await assert.rejects(
    () =>
      callWrikeApi({
        apiHost: "https://evil.example.com",
        accessToken: "token",
        path: "/api/v4/account",
        fetchImpl,
      }),
    /wrike\.com/i,
  );
  assert.equal(called, false);
});

test("callWrikeApi throws WrikeApiError with status 401 and does not retry", async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return withHeadersGet(jsonResponse(401, {}));
  };
  await assert.rejects(
    () => callWrikeApi({ apiHost: "https://www.wrike.com", accessToken: "token", path: "/api/v4/account", fetchImpl }),
    (error) => error instanceof WrikeApiError && error.status === 401,
  );
  assert.equal(calls, 1);
});

test("callWrikeApi retries 429 with bounded attempts, honoring Retry-After, then succeeds", async () => {
  let calls = 0;
  const sleeps = [];
  const fetchImpl = async () => {
    calls += 1;
    if (calls < 3) return withHeadersGet(jsonResponse(429, {}, { "retry-after": "1" }));
    return withHeadersGet(jsonResponse(200, { data: ["ok"] }));
  };
  const result = await callWrikeApi({
    apiHost: "https://www.wrike.com",
    accessToken: "token",
    path: "/api/v4/account",
    fetchImpl,
    sleepImpl: async (ms) => sleeps.push(ms),
  });
  assert.deepEqual(result, { data: ["ok"] });
  assert.equal(calls, 3);
  assert.equal(sleeps.length, 2);
  assert.ok(sleeps.every((ms) => ms === 1000));
});

test("callWrikeApi gives up after exhausting retries on repeated 5xx", async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return withHeadersGet(jsonResponse(503, {}));
  };
  await assert.rejects(
    () =>
      callWrikeApi({
        apiHost: "https://www.wrike.com",
        accessToken: "token",
        path: "/api/v4/account",
        fetchImpl,
        sleepImpl: async () => {},
        maxRetries: 2,
      }),
    (error) => error instanceof WrikeApiError && error.status === 503,
  );
  assert.equal(calls, 3); // initial + 2 retries
});

test("fetchAllWrikePages follows nextPageToken across multiple pages", async () => {
  const pages = [
    { kind: "tasks", data: [{ id: "1" }], nextPageToken: "page-2" },
    { kind: "tasks", data: [{ id: "2" }], nextPageToken: "page-3" },
    { kind: "tasks", data: [{ id: "3" }] },
  ];
  let call = 0;
  const fetchImpl = async () => {
    const page = pages[call];
    call += 1;
    return withHeadersGet(jsonResponse(200, page));
  };
  const items = await fetchAllWrikePages({
    apiHost: "https://www.wrike.com",
    accessToken: "token",
    path: "/api/v4/folders/ABC/tasks",
    fetchImpl,
  });
  assert.deepEqual(items.map((item) => item.id), ["1", "2", "3"]);
  assert.equal(call, 3);
});

test("fetchAllWrikePages throws when the pagination cap is hit with more pages remaining", async () => {
  const fetchImpl = async () =>
    withHeadersGet(jsonResponse(200, { kind: "tasks", data: [{ id: "x" }], nextPageToken: "always-more" }));
  await assert.rejects(
    () =>
      fetchAllWrikePages({
        apiHost: "https://www.wrike.com",
        accessToken: "token",
        path: "/api/v4/folders/ABC/tasks",
        fetchImpl,
      }),
    (error) => error instanceof WrikeApiError && /pagination cap/i.test(error.message),
  );
});
