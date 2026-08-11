import assert from "node:assert/strict";
import test from "node:test";

import {
  main,
  shouldBuildVercelBranch,
} from "../scripts/vercel-ignore-build.mjs";

test("Vercel builds only the two long-lived branches", () => {
  assert.equal(shouldBuildVercelBranch("main"), true);
  assert.equal(shouldBuildVercelBranch("staging"), true);
  assert.equal(shouldBuildVercelBranch("change/update-github-actions"), false);
  assert.equal(shouldBuildVercelBranch("codex/update-github-actions-v7"), false);
  assert.equal(shouldBuildVercelBranch(undefined), false);
  assert.equal(shouldBuildVercelBranch("main", true), false);
  assert.equal(shouldBuildVercelBranch("staging", true), false);
});

test("the ignored-build command uses Vercel exit-code semantics", () => {
  assert.equal(main({ VERCEL_GIT_COMMIT_REF: "main" }), 1);
  assert.equal(main({ VERCEL_GIT_COMMIT_REF: "staging" }), 1);
  assert.equal(main({ VERCEL_GIT_COMMIT_REF: "change/docs" }), 0);
  assert.equal(main({ VERCEL_GIT_COMMIT_REF: "main", COURSETRACK_CONTROLLED_RELEASES: "true" }), 0);
});
