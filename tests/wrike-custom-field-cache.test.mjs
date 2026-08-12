import "../scripts/register-aliases.mjs";
import assert from "node:assert/strict";
import test from "node:test";

const { clearCustomFieldDefinitionCache, getCachedCustomFieldDefinitions } = await import(
  "../lib/wrike-custom-field-cache.ts"
);

const DEFINITIONS = [{ id: "IEA1", title: "Reporting Year", type: "Text" }];

function clock(start = 0) {
  const state = { value: start };
  return { nowMs: () => state.value, advance: (ms) => { state.value += ms; }, state };
}

test("concurrent callers share one in-flight request", async () => {
  clearCustomFieldDefinitionCache();
  let calls = 0;
  const loader = async () => {
    calls += 1;
    await new Promise((resolve) => setTimeout(resolve, 10));
    return DEFINITIONS;
  };
  const [first, second, third] = await Promise.all([
    getCachedCustomFieldDefinitions("account-a", loader),
    getCachedCustomFieldDefinitions("account-a", loader),
    getCachedCustomFieldDefinitions("account-a", loader),
  ]);
  assert.equal(calls, 1, "one Wrike request, not one per caller");
  assert.deepEqual(first, DEFINITIONS);
  assert.deepEqual(second, DEFINITIONS);
  assert.deepEqual(third, DEFINITIONS);
});

test("a successful result is cached for the positive TTL and refetched after it", async () => {
  clearCustomFieldDefinitionCache();
  let calls = 0;
  const loader = async () => { calls += 1; return DEFINITIONS; };
  const time = clock();
  const options = { nowMs: time.nowMs, positiveTtlMs: 600_000, negativeTtlMs: 45_000 };

  await getCachedCustomFieldDefinitions("account-a", loader, options);
  time.advance(599_000);
  await getCachedCustomFieldDefinitions("account-a", loader, options);
  assert.equal(calls, 1, "a search inside the TTL must not hit Wrike again");

  time.advance(2_000);
  await getCachedCustomFieldDefinitions("account-a", loader, options);
  assert.equal(calls, 2, "the catalogue is refreshed once the TTL lapses");
});

test("a failed request resolves empty, is not cached permanently, and does not poison later calls", async () => {
  clearCustomFieldDefinitionCache();
  let calls = 0;
  const time = clock();
  const options = { nowMs: time.nowMs, positiveTtlMs: 600_000, negativeTtlMs: 45_000 };
  const failing = async () => { calls += 1; throw new Error("Wrike returned 503 for /api/v4/customfields."); };

  const result = await getCachedCustomFieldDefinitions("account-a", failing, options);
  assert.deepEqual(result, [], "a failure degrades to no field names, it never throws");

  time.advance(30_000);
  await getCachedCustomFieldDefinitions("account-a", failing, options);
  assert.equal(calls, 1, "an outage must not retry on every keystroke");

  time.advance(20_000);
  const recovered = await getCachedCustomFieldDefinitions("account-a", async () => DEFINITIONS, options);
  assert.equal(calls, 1);
  assert.deepEqual(recovered, DEFINITIONS, "recovery is picked up shortly after the failure, not ten minutes later");
});

test("a successful but empty catalogue uses the short TTL, not the long one", async () => {
  clearCustomFieldDefinitionCache();
  let calls = 0;
  const time = clock();
  const options = { nowMs: time.nowMs, positiveTtlMs: 600_000, negativeTtlMs: 45_000 };
  const loader = async () => { calls += 1; return []; };

  await getCachedCustomFieldDefinitions("account-a", loader, options);
  time.advance(46_000);
  await getCachedCustomFieldDefinitions("account-a", loader, options);
  assert.equal(calls, 2, "an empty response is treated as a soft failure");
});

test("cache entries are isolated per account, not shared across a common host", async () => {
  clearCustomFieldDefinitionCache();
  const options = { nowMs: clock().nowMs };
  const a = await getCachedCustomFieldDefinitions("https://www.wrike.com|account-a", async () => DEFINITIONS, options);
  const b = await getCachedCustomFieldDefinitions(
    "https://www.wrike.com|account-b",
    async () => [{ id: "IEA2", title: "Other account field", type: "Text" }],
    options,
  );
  assert.deepEqual(a, DEFINITIONS);
  assert.deepEqual(b, [{ id: "IEA2", title: "Other account field", type: "Text" }]);
});
