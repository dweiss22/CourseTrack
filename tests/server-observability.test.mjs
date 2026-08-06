import assert from "node:assert/strict";
import test from "node:test";

import { redactSensitiveText } from "../lib/safe-error-text.mjs";

test("server error redaction removes URLs, keys, JWTs, and query secrets", () => {
  const input = [
    "postgresql://user:password@db.example.test/database",
    "https://projectref.supabase.co/rest/v1/courses",
    "sb_secret_example-value",
    "eyJheader.eyJpayload.signature",
    "token=secret-value",
  ].join(" ");
  const result = redactSensitiveText(input);
  assert.doesNotMatch(result, /password@|projectref|example-value|eyJpayload|secret-value/);
  assert.match(result, /redacted/);
});
