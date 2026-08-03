import assert from "node:assert/strict";
import test from "node:test";

const { encryptSecret, decryptSecret } = await import("../lib/wrike-crypto.ts");

const KEY = "test-encryption-key-do-not-use-in-prod";

test("encryptSecret/decryptSecret round-trips a token", () => {
  const encrypted = encryptSecret("wrike-permanent-token-value", KEY);
  assert.notEqual(encrypted, "wrike-permanent-token-value");
  assert.equal(decryptSecret(encrypted, KEY), "wrike-permanent-token-value");
});

test("decryptSecret rejects a tampered ciphertext (GCM auth failure)", () => {
  const encrypted = encryptSecret("wrike-permanent-token-value", KEY);
  const [iv, authTag, ciphertext] = encrypted.split(":");
  const tampered = [iv, authTag, `${ciphertext.slice(0, -2)}zz`].join(":");
  assert.throws(() => decryptSecret(tampered, KEY));
});

test("decryptSecret rejects a malformed encoded value", () => {
  assert.throws(() => decryptSecret("not-a-valid-encoded-value", KEY));
});

test("decryptSecret fails with the wrong key", () => {
  const encrypted = encryptSecret("wrike-permanent-token-value", KEY);
  assert.throws(() => decryptSecret(encrypted, "a-completely-different-key"));
});
