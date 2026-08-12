import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

/**
 * Guards a GitHub Actions failure mode that is silent and therefore expensive.
 *
 * A job-level `if` is evaluated BEFORE the job is assigned its environment, so
 * `vars.X` referencing an environment-scoped variable resolves to an empty
 * string there and the job skips. A skipped job reports the workflow run as
 * SUCCESSFUL, so a gated job can quietly never run.
 *
 * This happened here: STAGING_REFRESH_ENABLED was set on the `staging`
 * environment on 2026-08-06 and the scheduled refresh-staging-data run on
 * 2026-08-09 was skipped, so the weekly sanitized snapshot never ran.
 *
 * Any variable used to gate a job must therefore be REPOSITORY-scoped. Adding a
 * new gate means adding it here deliberately, having confirmed its scope with
 * `gh variable list` (repository) rather than `gh variable list --env <name>`.
 */
const REPOSITORY_SCOPED_VARIABLES = new Set([
  "STAGING_REFRESH_ENABLED",
  "WRIKE_SYNC_ENABLED",
  "AUTO_PROMOTE_STAGING_TO_MAIN",
  "AUTO_PROMOTE_EXPIRES_AT",
]);

const root = new URL("../", import.meta.url);
const WORKFLOW_DIR = new URL(".github/workflows/", root);

/**
 * Extracts job-level `if` expressions. Job ids sit at two-space indent and
 * job-level keys at four, so a four-space `if:` is job-level while a step's
 * `if:` is deeper and correctly ignored -- step-level conditions run after the
 * environment resolves and may safely read environment variables.
 */
function jobLevelConditions(text) {
  const lines = text.split(/\r?\n/);
  const conditions = [];
  for (let index = 0; index < lines.length; index += 1) {
    const match = /^ {4}if:(.*)$/.exec(lines[index]);
    if (!match) continue;
    let expression = match[1].trim();
    // Folded/literal block scalars (`>-`, `|`) continue on deeper-indented lines.
    if (/^[>|]/.test(expression)) {
      expression = "";
      for (let next = index + 1; next < lines.length; next += 1) {
        if (!/^ {6,}\S/.test(lines[next])) break;
        expression += ` ${lines[next].trim()}`;
      }
    }
    conditions.push(expression.trim());
  }
  return conditions;
}

const workflowFiles = (await readdir(WORKFLOW_DIR)).filter((name) => /\.ya?ml$/.test(name));

test("every job gated on a variable uses a repository-scoped one", async () => {
  assert.ok(workflowFiles.length > 0, "there should be workflows to audit");
  const gated = [];

  for (const file of workflowFiles) {
    const text = await readFile(new URL(file, WORKFLOW_DIR), "utf8");
    for (const condition of jobLevelConditions(text)) {
      for (const [, name] of condition.matchAll(/vars\.([A-Za-z0-9_]+)/g)) {
        gated.push({ file, name });
        assert.ok(
          REPOSITORY_SCOPED_VARIABLES.has(name),
          `${file}: job-level \`if\` reads vars.${name}, which must be a repository variable `
          + "(environment variables are not resolved yet at that point and the job would silently skip). "
          + "Confirm the scope, move it if needed, then add it to REPOSITORY_SCOPED_VARIABLES.",
        );
      }
    }
  }

  // The audit must actually be looking at something.
  assert.ok(gated.length > 0, "expected at least one variable-gated job");
});

test("no job selects its environment from a variable", async () => {
  // `environment:` is resolved at the same point as the job-level `if`, so an
  // environment-scoped variable there is unresolvable by definition.
  for (const file of workflowFiles) {
    const text = await readFile(new URL(file, WORKFLOW_DIR), "utf8");
    for (const line of text.split(/\r?\n/)) {
      if (/^ {4}environment:/.test(line)) {
        assert.doesNotMatch(
          line,
          /vars\./,
          `${file}: a job's environment must be a literal name, not a variable reference`,
        );
      }
    }
  }
});

test("every variable-gated workflow records why its scope matters", async () => {
  // The explanation lives next to each gate: the failure is invisible, so a
  // future editor moving the variable back has no other signal. Derived from
  // the workflows that actually have a gate, so a new one is covered
  // automatically and no list goes stale.
  const gatedFiles = [];
  for (const file of workflowFiles) {
    const text = await readFile(new URL(file, WORKFLOW_DIR), "utf8");
    if (jobLevelConditions(text).some((condition) => /vars\./.test(condition))) gatedFiles.push(file);
  }
  assert.ok(gatedFiles.length > 0, "expected at least one variable-gated workflow");

  for (const file of gatedFiles) {
    const text = await readFile(new URL(file, WORKFLOW_DIR), "utf8");
    // Comment prose is unwrapped first so the assertion survives re-wrapping.
    const prose = text
      .split(/\r?\n/)
      .filter((line) => /^\s*#/.test(line))
      .map((line) => line.replace(/^\s*#\s?/, ""))
      .join(" ")
      .replace(/\s+/g, " ");
    assert.match(prose, /REPOSITORY variable, not an environment one/, `${file} should explain the scope requirement`);
    assert.match(prose, /before the job is assigned its environment/, `${file} should explain why`);
  }
});
