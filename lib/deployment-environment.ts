export type DeploymentEnvironment =
  | "production"
  | "staging"
  | "preview"
  | "development";

function normalizeEnvironment(value: string | undefined): DeploymentEnvironment | null {
  switch (value?.trim().toLowerCase()) {
    case "production":
      return "production";
    case "staging":
      return "staging";
    case "preview":
      return "preview";
    case "development":
    case "dev":
    case "local":
      return "development";
    default:
      return null;
  }
}

/**
 * Resolve the deployment identity on the server. COURSETRACK_ENVIRONMENT is
 * deliberately first so Vercel's staging branch can be distinguished from
 * ordinary Preview deployments.
 */
export function resolveDeploymentEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
): DeploymentEnvironment {
  return (
    normalizeEnvironment(environment.COURSETRACK_ENVIRONMENT) ??
    normalizeEnvironment(environment.VERCEL_TARGET_ENV) ??
    normalizeEnvironment(environment.VERCEL_ENV) ??
    "development"
  );
}

export function environmentTitlePrefix(environment: DeploymentEnvironment): string {
  if (environment === "staging") return "[STAGING] ";
  if (environment === "preview") return "[PREVIEW] ";
  return "";
}
