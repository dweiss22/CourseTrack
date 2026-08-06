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
]);
