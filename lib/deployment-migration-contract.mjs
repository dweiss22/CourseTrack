/**
 * The migration contract is intentionally committed with the application so
 * the deployed health route does not depend on Vercel packaging SQL files.
 * tests/deployment-readiness.test.mjs verifies that this list exactly matches
 * supabase/migrations.
 */
export const DEPLOYMENT_MIGRATION_CONTRACT = Object.freeze([
  "202607300001",
  "202607300002",
  "202607310003",
  "202607310004",
  "202607310005",
  "202608030001",
  "202608040001",
  "202608040002",
  "202608040003",
  "202608040004",
  "202608040005",
  "202608040006",
  "202608040007",
  "202608040008",
  "202608050001",
  "202608100001",
  "202608110001",
  "202608120001",
  "202608120002",
  "202608120003",
]);

/**
 * Supabase created this reviewed production baseline when GitHub Branching was
 * enabled against the existing database. It represents every checked-in
 * migration through `coversThrough`. New migrations must still appear as
 * normal ledger rows after this baseline.
 */
export const PRODUCTION_MIGRATION_BASELINE = Object.freeze({
  version: "20260806160508",
  coversThrough: "202608040007",
});
